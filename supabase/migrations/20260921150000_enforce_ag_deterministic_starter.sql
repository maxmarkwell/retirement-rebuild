-- Retirement Rebuild
-- Enforce the deterministic AG fresh-starter size at the database boundary.
-- The starter target is 50% of the hard position cap ($5 on a $200 reference
-- portfolio). A small overshoot is permitted only when 3-decimal share
-- precision makes exactly $5 impossible: quantity must be the minimum
-- 0.001-share increment that reaches the starter target.

create or replace function public.execute_ag_paper_buy_atomic(
  p_decision_id uuid,
  p_quantity numeric,
  p_price numeric,
  p_gross_amount numeric,
  p_notes text default null
)
returns table (out_decision_id uuid, out_transaction_id uuid)
language plpgsql security invoker set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_decision public.investment_decisions%rowtype;
  v_portfolio public.portfolios%rowtype;
  v_era public.portfolio_strategy_eras%rowtype;
  v_transaction_id uuid;
  v_reference numeric;
  v_sleeve_cap numeric;
  v_position_cap numeric;
  v_starter_cap numeric;
  v_min_buy numeric := 5.00;
  v_era_buys numeric := 0;
  v_era_sells numeric := 0;
  v_net_deployed numeric := 0;
  v_existing_qty numeric := 0;
  v_expected_gross numeric;
  v_min_starter_qty numeric;
  v_max_starter_gross numeric;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_quantity is null or p_quantity <= 0 or p_price is null or p_price <= 0 or p_gross_amount is null or p_gross_amount <= 0 then
    raise exception 'Positive quantity, price, and gross amount are required';
  end if;
  if round(p_quantity, 3) <> p_quantity then raise exception 'AG quantity may use at most three decimal places'; end if;
  v_expected_gross := round(p_quantity * p_price, 2);
  if abs(v_expected_gross - round(p_gross_amount, 2)) > 0.001 then raise exception 'AG gross amount must equal rounded quantity times price'; end if;

  select * into v_decision from public.investment_decisions where id = p_decision_id and user_id = v_user_id for update;
  if not found then raise exception 'AG decision not found'; end if;
  if v_decision.source <> 'ai_committee' or v_decision.decision_type <> 'buy' or v_decision.status <> 'active' or v_decision.transaction_id is not null then
    raise exception 'AG decision is not an active unexecuted Committee BUY';
  end if;

  select * into v_portfolio from public.portfolios where id = v_decision.portfolio_id and user_id = v_user_id;
  if not found or v_portfolio.type <> 'paper_active' or v_portfolio.is_real_money then raise exception 'AG paper execution requires paper_active'; end if;

  select * into v_era from public.portfolio_strategy_eras
   where portfolio_id = v_portfolio.id and user_id = v_user_id and strategy_key = 'accelerated_growth'
     and execution_mode = 'paper' and ended_at is null;
  if not found then raise exception 'Open paper Accelerated Growth era required'; end if;
  if v_decision.created_at < v_era.inception_at then raise exception 'Pre-inception decision cannot execute in AG era'; end if;

  v_reference := v_era.reference_total_capital;
  v_sleeve_cap := round(v_reference * 0.20, 2);
  v_position_cap := round(v_reference * 0.05, 2);
  v_starter_cap := round(v_position_cap * 0.50, 2);

  select coalesce(sum(case when transaction_type='buy' then gross_amount+fees else 0 end),0),
         coalesce(sum(case when transaction_type='sell' then gross_amount-fees else 0 end),0)
    into v_era_buys,v_era_sells from public.transactions
   where portfolio_id=v_portfolio.id and created_at>=v_era.inception_at;
  v_net_deployed := v_era_buys-v_era_sells;

  select coalesce(sum(case when transaction_type='buy' then quantity else -quantity end),0)
    into v_existing_qty from public.transactions
   where portfolio_id=v_portfolio.id and upper(ticker)=upper(v_decision.ticker) and created_at>=v_era.inception_at;

  if v_existing_qty > 0 then raise exception 'AG ADD requires persisted reassessment and is not enabled'; end if;
  if round(p_gross_amount,2) < v_min_buy then raise exception 'AG BUY is below the minimum notional'; end if;
  if v_net_deployed + round(p_gross_amount,2) > v_sleeve_cap then raise exception 'AG BUY exceeds the AG sleeve capital cap'; end if;
  if round(p_gross_amount,2) > v_position_cap then raise exception 'AG BUY exceeds the hard single-position cap'; end if;

  -- Fresh START must equal the deterministic starter target, except for the
  -- smallest 0.001-share precision overshoot necessary to reach that target.
  v_min_starter_qty := ceil(v_starter_cap / p_price * 1000) / 1000;
  v_max_starter_gross := round(v_min_starter_qty * p_price, 2);
  if p_quantity <> v_min_starter_qty or round(p_gross_amount,2) <> v_max_starter_gross then
    raise exception 'AG fresh BUY does not match deterministic starter sizing';
  end if;
  if v_max_starter_gross > v_position_cap or v_net_deployed + v_max_starter_gross > v_sleeve_cap then
    raise exception 'AG starter precision would exceed a hard risk cap';
  end if;

  insert into public.transactions(user_id,portfolio_id,transaction_type,ticker,quantity,price_per_share,gross_amount,fees,transaction_date,notes)
  values(v_user_id,v_portfolio.id,'buy',upper(v_decision.ticker),p_quantity,p_price,round(p_gross_amount,2),0,now(),p_notes)
  returning id into v_transaction_id;

  update public.investment_decisions set transaction_id=v_transaction_id,status='executed'
   where id=v_decision.id and user_id=v_user_id and status='active' and transaction_id is null;
  if not found then raise exception 'AG decision linkage failed'; end if;
  return query select v_decision.id,v_transaction_id;
end;
$$;

revoke all on function public.execute_ag_paper_buy_atomic(uuid,numeric,numeric,numeric,text) from public;
grant execute on function public.execute_ag_paper_buy_atomic(uuid,numeric,numeric,numeric,text) to authenticated;
