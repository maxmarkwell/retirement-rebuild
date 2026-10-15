-- Defense in depth: enforce scope and completed predecessor outputs while holding
-- the authoritative cycle row lock. No cycle is created, retried, or reconciled.
-- Existing running legacy cycles are NOT claimed by this migration.
create or replace function public.ag_worker_claim_stage(
  p_cycle_id uuid, p_stage text, p_lease_seconds integer default 120
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_cycle public.ag_daily_cycles%rowtype;
  v_stage public.ag_cycle_stage_checkpoints%rowtype;
  v_predecessor text;
  v_predecessors text[] := array[
    'holding_review','discovery','catalyst_deep_research',
    'committee','persistence','finalized'
  ];
  v_position integer;
  v_output jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 300 then raise exception 'AG_WORKER_INVALID_LEASE'; end if;
  v_position := array_position(v_predecessors,p_stage);
  if v_position is null then raise exception 'AG_WORKER_INVALID_STAGE'; end if;

  select * into v_cycle from public.ag_daily_cycles
    where id=p_cycle_id and status='running' for update;
  if not found then raise exception 'AG_WORKER_CYCLE_NOT_RUNNING'; end if;

  if not exists (
    select 1 from public.portfolios p
    join public.portfolio_strategy_eras e
      on e.portfolio_id=p.id and e.user_id=p.user_id
    where p.id=v_cycle.portfolio_id and p.user_id=v_cycle.user_id
      and p.type='paper_active' and p.is_real_money=false
      and e.id=v_cycle.strategy_era_id and e.strategy_key='accelerated_growth'
      and e.execution_mode='paper' and e.ended_at is null
  ) then raise exception 'AG_WORKER_PAPER_SCOPE_REQUIRED'; end if;

  if exists (
    select 1 from public.ag_daily_cycles older
    where older.user_id=v_cycle.user_id
      and older.portfolio_id=v_cycle.portfolio_id
      and older.strategy_era_id=v_cycle.strategy_era_id
      and older.cycle_date<v_cycle.cycle_date
      and older.status='running'
  ) then raise exception 'AG_WORKER_PREVIOUS_CYCLE_REQUIRES_RECONCILIATION'; end if;

  -- The same cycle-row lock serializes all stage claims for this cycle.
  for v_predecessor in
    select unnest(v_predecessors[1:v_position-1])
  loop
    select s.output into v_output from public.ag_cycle_stage_checkpoints s
      where s.cycle_id=p_cycle_id and s.stage=v_predecessor
        and s.user_id=v_cycle.user_id
        and s.portfolio_id=v_cycle.portfolio_id
        and s.strategy_era_id=v_cycle.strategy_era_id
        and s.status='completed';
    if not found or v_output is null or jsonb_typeof(v_output)<>'object'
      or v_output->>'schemaVersion' is distinct from '1'
      or v_output->>'cycleId' is distinct from p_cycle_id::text
      or v_output->>'stage' is distinct from v_predecessor
      or jsonb_typeof(v_output->'payload') is distinct from 'object'
      or v_output->'payload'='{}'::jsonb
    then raise exception 'AG_WORKER_PREDECESSOR_NOT_DURABLE: %',v_predecessor; end if;
  end loop;

  select * into v_stage from public.ag_cycle_stage_checkpoints
    where cycle_id=p_cycle_id and stage=p_stage for update;
  if found then
    -- Never auto-reclaim, even if the lease expired.
    if v_stage.status in ('running','failed') then
      raise exception 'AG_WORKER_RECONCILIATION_REQUIRED';
    end if;
    raise exception 'AG_WORKER_STAGE_NOT_CLAIMABLE';
  end if;

  insert into public.ag_cycle_stage_checkpoints
    (cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,
     claim_token,lease_expires_at,attempt_count,started_at,updated_at)
  values
    (v_cycle.id,v_cycle.user_id,v_cycle.portfolio_id,v_cycle.strategy_era_id,
     p_stage,'running',v_token,now()+make_interval(secs=>p_lease_seconds),
     1,now(),now());
  return v_token;
end;
$$;

revoke all on function public.ag_worker_claim_stage(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.ag_worker_claim_stage(uuid,text,integer) to service_role;
