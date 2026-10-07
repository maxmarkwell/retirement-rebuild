-- Candidate: split non-consuming queue wake validation from productive AG worker budget charging.
create or replace function public.ag_validate_cycle_worker(
  p_cycle_id uuid,
  p_token_hash text
) returns table(authorization_id uuid,user_id uuid,invocation_number integer,max_candidates integer)
language plpgsql security definer set search_path=''
as $$
declare v_auth public.ag_cycle_worker_authorizations%rowtype;
begin
 select * into v_auth from public.ag_cycle_worker_authorizations
 where cycle_id=p_cycle_id and token_hash=p_token_hash for update;
 if not found or v_auth.status <> 'active' then return; end if;
 if v_auth.expires_at <= now() then
  update public.ag_cycle_worker_authorizations set status='expired',updated_at=now() where id=v_auth.id;
  return;
 end if;
 if v_auth.invocation_count >= v_auth.max_invocations then
  update public.ag_cycle_worker_authorizations set status='revoked',updated_at=now() where id=v_auth.id;
  return;
 end if;
 if not exists (
  select 1 from public.ag_daily_cycles c
  join public.portfolios p on p.id=c.portfolio_id and p.user_id=c.user_id
  join public.portfolio_strategy_eras e on e.id=c.strategy_era_id and e.portfolio_id=c.portfolio_id and e.user_id=c.user_id
  where c.id=v_auth.cycle_id and c.user_id=v_auth.user_id and c.status='running'
   and p.type='paper_active' and p.is_real_money=false
   and e.strategy_key='accelerated_growth' and e.execution_mode='paper' and e.ended_at is null
 ) then
  update public.ag_cycle_worker_authorizations set status='revoked',updated_at=now() where id=v_auth.id;
  return;
 end if;
 authorization_id:=v_auth.id; user_id:=v_auth.user_id; invocation_number:=v_auth.invocation_count;
 select c.max_candidates into max_candidates from public.ag_daily_cycles c where c.id=v_auth.cycle_id and c.user_id=v_auth.user_id;
 return next;
end $$;
revoke all on function public.ag_validate_cycle_worker(uuid,text) from public,anon,authenticated;
grant execute on function public.ag_validate_cycle_worker(uuid,text) to service_role;

create or replace function public.ag_charge_cycle_worker_invocation(
  p_cycle_id uuid,
  p_token_hash text
) returns table(authorization_id uuid,user_id uuid,invocation_number integer,max_candidates integer)
language plpgsql security definer set search_path=''
as $$
declare v_auth public.ag_cycle_worker_authorizations%rowtype;
begin
 select * into v_auth from public.ag_cycle_worker_authorizations
 where cycle_id=p_cycle_id and token_hash=p_token_hash for update;
 if not found or v_auth.status <> 'active' then return; end if;
 if v_auth.expires_at <= now() then
  update public.ag_cycle_worker_authorizations set status='expired',updated_at=now() where id=v_auth.id;
  return;
 end if;
 if v_auth.invocation_count >= v_auth.max_invocations then
  update public.ag_cycle_worker_authorizations set status='revoked',updated_at=now() where id=v_auth.id;
  return;
 end if;
 if not exists (
  select 1 from public.ag_daily_cycles c
  join public.portfolios p on p.id=c.portfolio_id and p.user_id=c.user_id
  join public.portfolio_strategy_eras e on e.id=c.strategy_era_id and e.portfolio_id=c.portfolio_id and e.user_id=c.user_id
  where c.id=v_auth.cycle_id and c.user_id=v_auth.user_id and c.status='running'
   and p.type='paper_active' and p.is_real_money=false
   and e.strategy_key='accelerated_growth' and e.execution_mode='paper' and e.ended_at is null
 ) then
  update public.ag_cycle_worker_authorizations set status='revoked',updated_at=now() where id=v_auth.id;
  return;
 end if;
 update public.ag_cycle_worker_authorizations
 set invocation_count=invocation_count+1,last_invoked_at=now(),updated_at=now()
 where id=v_auth.id
 returning id,public.ag_cycle_worker_authorizations.user_id,invocation_count
 into authorization_id,user_id,invocation_number;
 select c.max_candidates into max_candidates from public.ag_daily_cycles c where c.id=v_auth.cycle_id and c.user_id=v_auth.user_id;
 return next;
end $$;
revoke all on function public.ag_charge_cycle_worker_invocation(uuid,text) from public,anon,authenticated;
grant execute on function public.ag_charge_cycle_worker_invocation(uuid,text) to service_role;
