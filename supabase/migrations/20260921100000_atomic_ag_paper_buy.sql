-- Retirement Rebuild
-- Atomic Accelerated Growth paper BUY execution.
-- Risk eligibility and deterministic sizing remain application responsibilities.
-- This RPC owns the final ledger write + decision linkage as one DB transaction.

create or replace function public.execute_ag_paper_buy_atomic(
  p_decision_id uuid,
  p_quantity numeric,
  p_price numeric,
  p_gross_amount numeric,
  p_notes text default null
)
returns table (
  out_decision_id uuid,
  out_transaction_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_decision public.investment_decisions%rowtype;
  v_portfolio public.portfolios%rowtype;
  v_era public.portfolio_strategy_eras%rowtype;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_quantity is null or p_quantity <= 0
     or p_price is null or p_price <= 0
     or p_gross_amount is null or p_gross_amount <= 0 then
    raise exception 'Positive quantity, price, and gross amount are required';
  end if;

  select *
    into v_decision
    from public.investment_decisions
   where id = p_decision_id
     and user_id = v_user_id
   for update;

  if not found then
    raise exception 'AG decision not found';
  end if;

  if v_decision.source <> 'ai_committee'
     or v_decision.decision_type <> 'buy'
     or v_decision.status <> 'active'
     or v_decision.transaction_id is not null then
    raise exception 'AG decision is not an active unexecuted Committee BUY';
  end if;

  select *
    into v_portfolio
    from public.portfolios
   where id = v_decision.portfolio_id
     and user_id = v_user_id;

  if not found
     or v_portfolio.type <> 'paper_active'
     or v_portfolio.is_real_money then
    raise exception 'AG paper execution requires paper_active';
  end if;

  select *
    into v_era
    from public.portfolio_strategy_eras
   where portfolio_id = v_portfolio.id
     and user_id = v_user_id
     and strategy_key = 'accelerated_growth'
     and execution_mode = 'paper'
     and ended_at is null;

  if not found then
    raise exception 'Open paper Accelerated Growth era required';
  end if;

  if v_decision.created_at < v_era.inception_at then
    raise exception 'Pre-inception decision cannot execute in AG era';
  end if;

  insert into public.transactions (
    user_id, portfolio_id, transaction_type, ticker, quantity,
    price_per_share, gross_amount, fees, transaction_date, notes
  ) values (
    v_user_id, v_portfolio.id, 'buy', upper(v_decision.ticker), p_quantity,
    p_price, round(p_gross_amount, 2), 0, now(), p_notes
  )
  returning id into v_transaction_id;

  update public.investment_decisions
     set transaction_id = v_transaction_id,
         status = 'executed'
   where id = v_decision.id
     and user_id = v_user_id
     and status = 'active'
     and transaction_id is null;

  if not found then
    raise exception 'AG decision linkage failed';
  end if;

  return query select v_decision.id, v_transaction_id;
end;
$$;

revoke all on function public.execute_ag_paper_buy_atomic(uuid, numeric, numeric, numeric, text) from public;
grant execute on function public.execute_ag_paper_buy_atomic(uuid, numeric, numeric, numeric, text) to authenticated;
