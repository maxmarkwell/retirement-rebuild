-- Research artifacts are staging-only; no live watchlist or decision writes.
-- Fenced read requires an active lease and returns only artifacts from this cycle/stage.
create or replace function public.ag_worker_read_stage_artifacts(
  p_cycle_id uuid, p_stage text, p_token uuid
) returns table(artifact_key text, payload jsonb)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.ag_daily_cycles%rowtype;
  v_checkpoint public.ag_cycle_stage_checkpoints%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_cycle_id='583809c1-7157-4ad4-b343-56acc332a145'::uuid then
    raise exception 'AG_WORKER_PROTECTED_CYCLE';
  end if;
  select * into v_cycle from public.ag_daily_cycles
    where id=p_cycle_id and status='running' for update;
  if not found then return; end if;
  if not exists (
    select 1 from public.portfolios p
    join public.portfolio_strategy_eras e on e.portfolio_id=p.id and e.user_id=p.user_id
    where p.id=v_cycle.portfolio_id and p.user_id=v_cycle.user_id
      and p.type='paper_active' and p.is_real_money=false
      and e.id=v_cycle.strategy_era_id and e.strategy_key='accelerated_growth'
      and e.execution_mode='paper' and e.ended_at is null
  ) then return; end if;
  if exists (
    select 1 from public.ag_daily_cycles older
    where older.user_id=v_cycle.user_id and older.portfolio_id=v_cycle.portfolio_id
      and older.strategy_era_id=v_cycle.strategy_era_id
      and older.cycle_date<v_cycle.cycle_date and older.status='running'
  ) then return; end if;
  select * into v_checkpoint from public.ag_cycle_stage_checkpoints s
    where s.cycle_id=p_cycle_id and s.stage=p_stage for update;
  if not found or v_checkpoint.status is distinct from 'running'
    or v_checkpoint.claim_token is distinct from p_token
    or v_checkpoint.lease_expires_at is null
    or v_checkpoint.lease_expires_at <= clock_timestamp()
    or v_checkpoint.user_id is distinct from v_cycle.user_id
    or v_checkpoint.portfolio_id is distinct from v_cycle.portfolio_id
    or v_checkpoint.strategy_era_id is distinct from v_cycle.strategy_era_id
  then return; end if;
  return query
    select a.artifact_key,a.payload from public.ag_worker_stage_artifacts a
    where a.cycle_id=p_cycle_id and a.stage=p_stage
      and a.user_id=v_cycle.user_id and a.portfolio_id=v_cycle.portfolio_id
      and a.strategy_era_id=v_cycle.strategy_era_id
    order by a.artifact_key;
end;
$$;
revoke all on function public.ag_worker_read_stage_artifacts(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.ag_worker_read_stage_artifacts(uuid,text,uuid) to service_role;
