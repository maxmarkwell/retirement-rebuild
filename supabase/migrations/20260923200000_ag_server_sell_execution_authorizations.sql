-- Retirement Rebuild
-- Accelerated Growth V1: separate, server-authorized, atomic paper SELL boundary.
-- BUY execution remains untouched. SELLs require a short-lived service-role authorization
-- and consume only post-era AG holdings using deterministic FIFO accounting.

create table if not exists public.ag_sell_execution_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  strategy_era_id uuid not null references public.portfolio_strategy_eras(id) on delete cascade,
  decision_id uuid not null references public.investment_decisions(id) on delete cascade,
  ticker text not null,
  quantity numeric not null check (quantity > 0),
  price_per_share numeric not null check (price_per_share > 0),
  fees numeric not null default 0 check (fees >= 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists ag_sell_execution_authorizations_open_decision_idx
  on public.ag_sell_execution_authorizations(decision_id)
  where consumed_at is null;

alter table public.ag_sell_execution_authorizations enable row level security;
revoke all on table public.ag_sell_execution_authorizations from anon, authenticated;
grant all on table public.ag_sell_execution_authorizations to service_role;

create or replace function public.execute_ag_paper_sell_authorized(p_authorization_id uuid)
returns table (
  transaction_id uuid,
  decision_id uuid,
  ticker text,
  quantity numeric,
  price_per_share numeric,
  gross_amount numeric,
  fees numeric,
  net_proceeds numeric,
  cost_basis numeric,
  realized_gain_loss numeric,
  shares_owned_before numeric,
  shares_owned_after numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth public.ag_sell_execution_authorizations%rowtype;
  v_decision public.investment_decisions%rowtype;
  v_era public.portfolio_strategy_eras%rowtype;
  v_portfolio public.portfolios%rowtype;
  v_transaction_id uuid;
  v_gross numeric;
  v_net numeric;
  v_basis numeric := 0;
  v_owned numeric := 0;
  v_remaining numeric;
  v_take numeric;
  v_row record;
begin
  if auth.role() <> 'service_role' then
    raise exception 'AG SELL execution requires service role';
  end if;

  select * into v_auth
  from public.ag_sell_execution_authorizations
  where id = p_authorization_id
  for update;
  if not found then raise exception 'AG SELL authorization not found'; end if;
  if v_auth.consumed_at is not null then raise exception 'AG SELL authorization already consumed'; end if;
  if v_auth.expires_at <= now() then raise exception 'AG SELL authorization expired'; end if;

  select * into v_decision from public.investment_decisions where id = v_auth.decision_id for update;
  if not found then raise exception 'AG SELL decision not found'; end if;
  if v_decision.portfolio_id <> v_auth.portfolio_id or upper(v_decision.ticker) <> upper(v_auth.ticker) then
    raise exception 'AG SELL authorization does not match decision';
  end if;
  if v_decision.decision_type <> 'sell' then raise exception 'AG SELL requires a SELL decision'; end if;
  if v_decision.source <> 'ai_committee' then raise exception 'AG SELL requires AI Committee decision'; end if;
  if v_decision.status <> 'active' or v_decision.transaction_id is not null then
    raise exception 'AG SELL decision is not executable';
  end if;

  select * into v_era from public.portfolio_strategy_eras where id = v_auth.strategy_era_id for update;
  if not found then raise exception 'AG strategy era not found'; end if;
  if v_era.portfolio_id <> v_auth.portfolio_id or v_era.user_id <> v_auth.user_id
     or v_era.strategy_key <> 'accelerated_growth' or v_era.execution_mode <> 'paper'
     or v_era.ended_at is not null then
    raise exception 'AG SELL authorization is outside active paper strategy era';
  end if;

  select * into v_portfolio from public.portfolios where id = v_auth.portfolio_id for update;
  if not found or v_portfolio.user_id <> v_auth.user_id or v_portfolio.type <> 'paper_active' or coalesce(v_portfolio.is_real_money, false) then
    raise exception 'AG SELL requires paper_active non-real-money portfolio';
  end if;

  -- Replay only transactions at/after AG era inception. FIFO basis includes BUY fees.
  -- Historical SELLs consume FIFO lots; the requested SELL is then valued from what remains.
  create temporary table if not exists pg_temp.ag_fifo_lots (
    seq bigserial,
    remaining_quantity numeric not null,
    unit_cost numeric not null
  ) on commit drop;
  truncate pg_temp.ag_fifo_lots;

  for v_row in
    select id, transaction_type, quantity, price_per_share, coalesce(fees,0) as fees, transaction_date, created_at
    from public.transactions
    where portfolio_id = v_auth.portfolio_id
      and upper(ticker) = upper(v_auth.ticker)
      and transaction_date >= v_era.inception_at
    order by transaction_date, created_at, id
  loop
    if v_row.transaction_type = 'buy' then
      insert into pg_temp.ag_fifo_lots(remaining_quantity, unit_cost)
      values (v_row.quantity, ((v_row.quantity * v_row.price_per_share) + v_row.fees) / v_row.quantity);
    elsif v_row.transaction_type = 'sell' then
      v_remaining := v_row.quantity;
      for v_take in select seq from pg_temp.ag_fifo_lots where remaining_quantity > 0 order by seq loop
        exit when v_remaining <= 0;
        select least(remaining_quantity, v_remaining) into v_basis from pg_temp.ag_fifo_lots where seq = v_take;
        update pg_temp.ag_fifo_lots set remaining_quantity = remaining_quantity - v_basis where seq = v_take;
        v_remaining := v_remaining - v_basis;
      end loop;
      if v_remaining > 0 then raise exception 'AG transaction ledger oversells FIFO position'; end if;
    end if;
  end loop;

  select coalesce(sum(remaining_quantity),0) into v_owned from pg_temp.ag_fifo_lots;
  if v_auth.quantity > v_owned then raise exception 'AG SELL quantity exceeds era holdings'; end if;

  v_remaining := v_auth.quantity;
  v_basis := 0;
  for v_row in select seq, remaining_quantity, unit_cost from pg_temp.ag_fifo_lots where remaining_quantity > 0 order by seq loop
    exit when v_remaining <= 0;
    v_take := least(v_row.remaining_quantity, v_remaining);
    v_basis := v_basis + (v_take * v_row.unit_cost);
    v_remaining := v_remaining - v_take;
  end loop;
  if v_remaining > 0 then raise exception 'AG SELL FIFO basis could not be resolved'; end if;

  v_gross := v_auth.quantity * v_auth.price_per_share;
  v_net := v_gross - v_auth.fees;
  if v_net < 0 then raise exception 'AG SELL fees exceed proceeds'; end if;

  insert into public.transactions(
    user_id, portfolio_id, transaction_type, ticker, quantity, price_per_share,
    gross_amount, fees, transaction_date, notes, cost_basis, realized_gain_loss, lot_method
  ) values (
    v_auth.user_id, v_auth.portfolio_id, 'sell', upper(v_auth.ticker), v_auth.quantity,
    v_auth.price_per_share, v_gross, v_auth.fees, now(),
    'Authorized Accelerated Growth paper SELL for decision ' || v_auth.decision_id,
    round(v_basis,2), round(v_net - v_basis,2), 'fifo'
  ) returning id into v_transaction_id;

  update public.investment_decisions
  set transaction_id = v_transaction_id, status = 'executed'
  where id = v_auth.decision_id and status = 'active' and transaction_id is null;
  if not found then raise exception 'AG SELL decision linkage failed'; end if;

  update public.ag_sell_execution_authorizations
  set consumed_at = now(), transaction_id = v_transaction_id
  where id = v_auth.id and consumed_at is null;
  if not found then raise exception 'AG SELL authorization consumption failed'; end if;

  return query select
    v_transaction_id, v_auth.decision_id, upper(v_auth.ticker), v_auth.quantity,
    v_auth.price_per_share, v_gross, v_auth.fees, v_net, round(v_basis,2),
    round(v_net - v_basis,2), v_owned, v_owned - v_auth.quantity;
end;
$$;

revoke all on function public.execute_ag_paper_sell_authorized(uuid) from public, anon, authenticated;
grant execute on function public.execute_ag_paper_sell_authorized(uuid) to service_role;

comment on function public.execute_ag_paper_sell_authorized(uuid) is
  'Service-role-only atomic AG paper SELL execution. Validates active Committee SELL, active AG paper era, era-scoped holdings, FIFO basis, single-use authorization, transaction linkage, and realized P/L.';
