-- Eliminate RETURNS TABLE / PLpgSQL variable-name conflicts comprehensively.
-- PostgreSQL exposes RETURNS TABLE names (quantity, ticker, fees, etc.) as variables.
-- #variable_conflict use_column tells PL/pgSQL to prefer SQL columns when a SQL
-- statement contains an otherwise ambiguous identifier. Explicit aliases remain in
-- place for readability and deterministic FIFO processing.

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
#variable_conflict use_column
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
  v_lot_seq bigint;
  v_row record;
begin
  if auth.role() <> 'service_role' then raise exception 'AG SELL execution requires service role'; end if;

  select a.* into v_auth from public.ag_sell_execution_authorizations as a where a.id = p_authorization_id for update;
  if not found then raise exception 'AG SELL authorization not found'; end if;
  if v_auth.consumed_at is not null then raise exception 'AG SELL authorization already consumed'; end if;
  if v_auth.expires_at <= now() then raise exception 'AG SELL authorization expired'; end if;

  select d.* into v_decision from public.investment_decisions as d where d.id = v_auth.decision_id for update;
  if not found then raise exception 'AG SELL decision not found'; end if;
  if v_decision.portfolio_id <> v_auth.portfolio_id or upper(v_decision.ticker) <> upper(v_auth.ticker) then raise exception 'AG SELL authorization does not match decision'; end if;
  if v_decision.decision_type <> 'sell' then raise exception 'AG SELL requires a SELL decision'; end if;
  if v_decision.source <> 'ai_committee' then raise exception 'AG SELL requires AI Committee decision'; end if;
  if v_decision.status <> 'active' or v_decision.transaction_id is not null then raise exception 'AG SELL decision is not executable'; end if;

  select e.* into v_era from public.portfolio_strategy_eras as e where e.id = v_auth.strategy_era_id for update;
  if not found then raise exception 'AG strategy era not found'; end if;
  if v_era.portfolio_id <> v_auth.portfolio_id or v_era.user_id <> v_auth.user_id or v_era.strategy_key <> 'accelerated_growth' or v_era.execution_mode <> 'paper' or v_era.ended_at is not null then raise exception 'AG SELL authorization is outside active paper strategy era'; end if;

  select p.* into v_portfolio from public.portfolios as p where p.id = v_auth.portfolio_id for update;
  if not found or v_portfolio.user_id <> v_auth.user_id or v_portfolio.type <> 'paper_active' or coalesce(v_portfolio.is_real_money, false) then raise exception 'AG SELL requires paper_active non-real-money portfolio'; end if;

  create temporary table if not exists pg_temp.ag_fifo_lots (
    seq bigserial,
    remaining_quantity numeric not null,
    unit_cost numeric not null
  ) on commit drop;
  truncate table pg_temp.ag_fifo_lots;

  for v_row in
    select tx.id as tx_id, tx.transaction_type as tx_type, tx.quantity as tx_qty,
           tx.price_per_share as tx_price, coalesce(tx.fees, 0) as tx_fee,
           tx.transaction_date as tx_date, tx.created_at as tx_created
    from public.transactions as tx
    where tx.portfolio_id = v_auth.portfolio_id
      and upper(tx.ticker) = upper(v_auth.ticker)
      and tx.transaction_date >= v_era.inception_at
    order by tx.transaction_date, tx.created_at, tx.id
  loop
    if v_row.tx_type = 'buy' then
      insert into pg_temp.ag_fifo_lots(remaining_quantity, unit_cost)
      values (v_row.tx_qty, ((v_row.tx_qty * v_row.tx_price) + v_row.tx_fee) / v_row.tx_qty);
    elsif v_row.tx_type = 'sell' then
      v_remaining := v_row.tx_qty;
      for v_lot_seq in
        select l.seq from pg_temp.ag_fifo_lots as l where l.remaining_quantity > 0 order by l.seq
      loop
        exit when v_remaining <= 0;
        select least(l.remaining_quantity, v_remaining) into v_take
        from pg_temp.ag_fifo_lots as l where l.seq = v_lot_seq;
        update pg_temp.ag_fifo_lots as l
          set remaining_quantity = l.remaining_quantity - v_take
          where l.seq = v_lot_seq;
        v_remaining := v_remaining - v_take;
      end loop;
      if v_remaining > 0 then raise exception 'AG transaction ledger oversells FIFO position'; end if;
    end if;
  end loop;

  select coalesce(sum(l.remaining_quantity), 0) into v_owned from pg_temp.ag_fifo_lots as l;
  if v_auth.quantity > v_owned then raise exception 'AG SELL quantity exceeds era holdings'; end if;

  v_remaining := v_auth.quantity;
  v_basis := 0;
  for v_row in
    select l.seq as lot_seq, l.remaining_quantity as lot_qty, l.unit_cost as lot_cost
    from pg_temp.ag_fifo_lots as l where l.remaining_quantity > 0 order by l.seq
  loop
    exit when v_remaining <= 0;
    v_take := least(v_row.lot_qty, v_remaining);
    v_basis := v_basis + (v_take * v_row.lot_cost);
    v_remaining := v_remaining - v_take;
  end loop;
  if v_remaining > 0 then raise exception 'AG SELL FIFO basis could not be resolved'; end if;

  v_gross := v_auth.quantity * v_auth.price_per_share;
  v_net := v_gross - v_auth.fees;
  if v_net < 0 then raise exception 'AG SELL fees exceed proceeds'; end if;

  insert into public.transactions as tx
    (user_id, portfolio_id, transaction_type, ticker, quantity, price_per_share, gross_amount, fees,
     transaction_date, notes, cost_basis, realized_gain_loss, lot_method)
  values
    (v_auth.user_id, v_auth.portfolio_id, 'sell', upper(v_auth.ticker), v_auth.quantity,
     v_auth.price_per_share, v_gross, v_auth.fees, now(),
     'Authorized Accelerated Growth paper SELL for decision ' || v_auth.decision_id,
     round(v_basis, 2), round(v_net - v_basis, 2), 'fifo')
  returning tx.id into v_transaction_id;

  update public.investment_decisions as d
  set transaction_id = v_transaction_id, status = 'executed'
  where d.id = v_auth.decision_id and d.status = 'active' and d.transaction_id is null;
  if not found then raise exception 'AG SELL decision linkage failed'; end if;

  update public.ag_sell_execution_authorizations as a
  set consumed_at = now(), transaction_id = v_transaction_id
  where a.id = v_auth.id and a.consumed_at is null;
  if not found then raise exception 'AG SELL authorization consumption failed'; end if;

  return query
  select v_transaction_id, v_auth.decision_id, upper(v_auth.ticker), v_auth.quantity,
         v_auth.price_per_share, v_gross, v_auth.fees, v_net, round(v_basis, 2),
         round(v_net - v_basis, 2), v_owned, v_owned - v_auth.quantity;
end;
$$;

revoke all on function public.execute_ag_paper_sell_authorized(uuid) from public, anon, authenticated;
grant execute on function public.execute_ag_paper_sell_authorized(uuid) to service_role;
