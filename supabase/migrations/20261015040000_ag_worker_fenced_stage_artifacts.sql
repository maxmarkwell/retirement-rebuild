-- Staging-only, lease-fenced research artifacts. NOT a replacement for live
-- watchlist/decision writes. No worker or scheduler is activated.
create table if not exists public.ag_worker_stage_artifacts (
  cycle_id uuid not null,
  stage text not null,
  artifact_key text not null,
  payload jsonb not null,
  user_id uuid not null,
  portfolio_id uuid not null,
  strategy_era_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (cycle_id,stage,artifact_key),
  constraint ag_worker_stage_artifacts_payload_object
    check (jsonb_typeof(payload)='object' and payload <> '{}'::jsonb)
);
revoke all on public.ag_worker_stage_artifacts from public, anon, authenticated;
grant select on public.ag_worker_stage_artifacts to service_role;

create or replace function public.ag_worker_put_stage_artifact(
  p_cycle_id uuid, p_stage text, p_token uuid, p_artifact_key text, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle public.ag_daily_cycles%rowtype;
  v_stage public.ag_cycle_stage_checkpoints%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_cycle_id = '583809c1-7157-4ad4-b343-56acc332a145'::uuid then
    raise exception 'AG_WORKER_PROTECTED_CYCLE';
  end if;
  if p_artifact_key is null or length(p_artifact_key) not between 1 and 120
    or p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload = '{}'::jsonb
  then raise exception 'AG_WORKER_ARTIFACT_INVALID'; end if;
  -- Same cycle lock ordering as claim/complete; no check/write race.
  select * into v_cycle from public.ag_daily_cycles
    where id=p_cycle_id and status='running' for update;
  if not found then return false; end if;
  if not exists (
    select 1 from public.portfolios p
    join public.portfolio_strategy_eras e on e.portfolio_id=p.id and e.user_id=p.user_id
    where p.id=v_cycle.portfolio_id and p.user_id=v_cycle.user_id
      and p.type='paper_active' and p.is_real_money=false
      and e.id=v_cycle.strategy_era_id and e.strategy_key='accelerated_growth'
      and e.execution_mode='paper' and e.ended_at is null
  ) then return false; end if;
  if exists (
    select 1 from public.ag_daily_cycles older
    where older.user_id=v_cycle.user_id and older.portfolio_id=v_cycle.portfolio_id
      and older.strategy_era_id=v_cycle.strategy_era_id
      and older.cycle_date<v_cycle.cycle_date and older.status='running'
  ) then return false; end if;
  select * into v_stage from public.ag_cycle_stage_checkpoints
    where cycle_id=p_cycle_id and stage=p_stage for update;
  if not found or v_stage.user_id is distinct from v_cycle.user_id
    or v_stage.portfolio_id is distinct from v_cycle.portfolio_id
    or v_stage.strategy_era_id is distinct from v_cycle.strategy_era_id
    or v_stage.status is distinct from 'running'
    or v_stage.claim_token is distinct from p_token
    or v_stage.lease_expires_at <= clock_timestamp()
    or v_stage.lease_expires_at is null
  then return false; end if;
  -- Immutable insert: replay cannot silently replace a previous artifact.
  insert into public.ag_worker_stage_artifacts
    (cycle_id,stage,artifact_key,payload,user_id,portfolio_id,strategy_era_id)
    values (p_cycle_id,p_stage,p_artifact_key,p_payload,
      v_cycle.user_id,v_cycle.portfolio_id,v_cycle.strategy_era_id)
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.ag_worker_put_stage_artifact(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.ag_worker_put_stage_artifact(uuid,text,uuid,text,jsonb) to service_role;
