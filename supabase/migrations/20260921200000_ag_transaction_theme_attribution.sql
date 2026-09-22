-- Retirement Rebuild
-- Carry deterministic AG theme attribution into executed transactions so
-- concentration accounting remains auditable after decision execution.

alter table public.transactions
  add column if not exists ag_theme_key text;

comment on column public.transactions.ag_theme_key is
  'AG concentration bucket copied from the originating decision at execution; null for non-AG/legacy transactions.';

create or replace function public.execute_ag_paper_buy_authorized(p_authorization_id uuid)
returns table (out_decision_id uuid, out_transaction_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_auth public.ag_execution_authorizations%rowtype;
  v_decision public.investment_decisions%rowtype;
  v_portfolio public.portfolios%rowtype;
  v_era public.portfolio_strategy_eras%rowtype;
  v_tx uuid; v_reference numeric; v_sleeve_cap numeric; v_position_cap numeric;
  v_starter_cap numeric; v_min_qty numeric; v_expected_gross numeric;
  v_buys numeric := 0; v_sells numeric := 0; v_net numeric := 0; v_existing_qty numeric := 0;
begin
  select * into v_auth from public.ag_execution_authorizations where id=p_authorization_id for update;
  if not found then raise exception 'AG execution authorization not found'; end if;
  if v_auth.consumed_at is not null then raise exception 'AG execution authorization already consumed'; end if;
  if v_auth.expires_at <= now() then raise exception 'AG execution authorization expired'; end if;

  select * into v_decision from public.investment_decisions where id=v_auth.decision_id and user_id=v_auth.user_id for update;
  if not found then raise exception 'AG decision not found'; end if;
  if v_decision.portfolio_id<>v_auth.portfolio_id or upper(v_decision.ticker)<>upper(v_auth.ticker)
     or v_decision.source<>'ai_committee' or v_decision.decision_type<>'buy'
     or v_decision.status<>'active' or v_decision.transaction_id is not null then
    raise exception 'AG authorization does not match an active unexecuted Committee BUY';
  end if;
  if v_decision.ag_theme_key is null or v_decision.ag_theme_key !~ '^ag-theme-v1:sector:[a-z0-9-]+$' then
    raise exception 'AG decision lacks deterministic theme attribution';
  end if;

  select * into v_portfolio from public.portfolios where id=v_auth.portfolio_id and user_id=v_auth.user_id;
  if not found or v_portfolio.type<>'paper_active' or v_portfolio.is_real_money then raise exception 'AG paper execution requires paper_active'; end if;

  select * into v_era from public.portfolio_strategy_eras
   where portfolio_id=v_portfolio.id and user_id=v_auth.user_id and strategy_key='accelerated_growth' and execution_mode='paper' and ended_at is null;
  if not found then raise exception 'Open paper Accelerated Growth era required'; end if;
  if v_decision.created_at<v_era.inception_at then raise exception 'Pre-inception decision cannot execute in AG era'; end if;

  if v_auth.quantity<=0 or v_auth.price<=0 or v_auth.gross_amount<=0 then raise exception 'Invalid AG authorization values'; end if;
  if round(v_auth.quantity,3)<>v_auth.quantity then raise exception 'AG quantity may use at most three decimal places'; end if;
  v_expected_gross:=round(v_auth.quantity*v_auth.price,2);
  if v_expected_gross<>round(v_auth.gross_amount,2) then raise exception 'AG authorization gross mismatch'; end if;

  v_reference:=v_era.reference_total_capital; v_sleeve_cap:=round(v_reference*0.20,2);
  v_position_cap:=round(v_reference*0.05,2); v_starter_cap:=round(v_position_cap*0.50,2);

  select coalesce(sum(case when transaction_type='buy' then gross_amount+fees else 0 end),0),
         coalesce(sum(case when transaction_type='sell' then gross_amount-fees else 0 end),0)
    into v_buys,v_sells from public.transactions where portfolio_id=v_portfolio.id and created_at>=v_era.inception_at;
  v_net:=v_buys-v_sells;

  select coalesce(sum(case when transaction_type='buy' then quantity else -quantity end),0)
    into v_existing_qty from public.transactions where portfolio_id=v_portfolio.id and upper(ticker)=upper(v_decision.ticker) and created_at>=v_era.inception_at;
  if v_existing_qty>0 then raise exception 'AG ADD requires persisted reassessment and is not enabled'; end if;
  if round(v_auth.gross_amount,2)<5.00 then raise exception 'AG BUY is below the minimum notional'; end if;
  if v_net+round(v_auth.gross_amount,2)>v_sleeve_cap then raise exception 'AG BUY exceeds the AG sleeve capital cap'; end if;
  if round(v_auth.gross_amount,2)>v_position_cap then raise exception 'AG BUY exceeds the hard single-position cap'; end if;

  v_min_qty:=ceil(v_starter_cap/v_auth.price*1000)/1000;
  if v_auth.quantity<>v_min_qty or round(v_auth.gross_amount,2)<>round(v_min_qty*v_auth.price,2) then
    raise exception 'AG authorization does not match deterministic starter sizing';
  end if;

  insert into public.transactions(user_id,portfolio_id,transaction_type,ticker,quantity,price_per_share,gross_amount,fees,transaction_date,notes,ag_theme_key)
  values(v_auth.user_id,v_portfolio.id,'buy',upper(v_decision.ticker),v_auth.quantity,v_auth.price,round(v_auth.gross_amount,2),0,now(),
    'Accelerated Growth paper execution; server-authorized',v_decision.ag_theme_key)
  returning id into v_tx;

  update public.investment_decisions set transaction_id=v_tx,status='executed'
   where id=v_decision.id and user_id=v_auth.user_id and status='active' and transaction_id is null;
  if not found then raise exception 'AG decision linkage failed'; end if;
  update public.ag_execution_authorizations set consumed_at=now() where id=v_auth.id and consumed_at is null;
  if not found then raise exception 'AG authorization consumption failed'; end if;
  return query select v_decision.id,v_tx;
end;
$$;

revoke all on function public.execute_ag_paper_buy_authorized(uuid) from public, anon, authenticated;
grant execute on function public.execute_ag_paper_buy_authorized(uuid) to service_role;
