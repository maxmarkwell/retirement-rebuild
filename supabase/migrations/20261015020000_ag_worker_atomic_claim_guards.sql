-- Atomic prerequisite enforcement for AG worker claims.
-- Replaces the claim RPC only; does not modify any existing cycle or checkpoint rows.
create or replace function public.ag_worker_claim_stage(
  p_cycle_id uuid, p_stage text, p_lease_seconds integer default 120
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_stage public.ag_cycle_stage_checkpoints%rowtype;
  v_cycle public.ag_daily_cycles%rowtype;
  v_stages text[] := array['holding_review','discovery','catalyst_deep_research','committee','persistence','finalized'];
  v_index integer;
  v_prior text;
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 300 then raise exception 'AG_WORKER_INVALID_LEASE'; end if;
  v_index := array_position(v_stages, p_stage);
  if v_index is null then raise exception 'AG_WORKER_INVALID_STAGE'; end if;

  -- Lock the cycle so competing stage claims serialize against the same row.
  select * into v_cycle from public.ag_daily_cycles
    where id=p_cycle_id and status='running' for update;
  if not found then raise exception 'AG_WORKER_CYCLE_NOT_RUNNING'; end if;

  if not exists (
    select 1 from public.portfolios p
    join public.portfolio_strategy_eras e on e.portfolio_id=p.id
    where p.id=v_cycle.portfolio_id and p.user_id=v_cycle.user_id
      and p.type='paper_active' and p.is_real_money=false
      and e.id=v_cycle.strategy_era_id and e.user_id=v_cycle.user_id
      and e.strategy_key='accelerated_growth' and e.execution_mode='paper'
      and e.ended_at is null
  ) then raise exception 'AG_WORKER_PAPER_SCOPE_REQUIRED'; end if;

  if exists (
    select 1 from public.ag_daily_cycles older
    where older.user_id=v_cycle.user_id
      and older.portfolio_id=v_cycle.portfolio_id
      and older.strategy_era_id=v_cycle.strategy_era_id
      and older.status='running' and older.cycle_date<v_cycle.cycle_date
  ) then raise exception 'AG_WORKER_PREVIOUS_CYCLE_REQUIRES_RECONCILIATION'; end if;

  -- Every earlier stage must have committed non-null output.
  -- A preflight read in the application is never the final authority.
  if v_index > 1 then
    foreach v_prior in array v_stages[1:v_index-1] loop
      if not exists (
        select 1 from public.ag_cycle_stage_checkpoints cp
        where cp.cycle_id=p_cycle_id and cp.stage=v_prior
          and cp.status='completed' and cp.output is not null
      ) then raise exception 'AG_WORKER_PREDECESSOR_NOT_DURABLE:%', v_prior; end if;
    end loop;
  end if;

  select * into v_stage from public.ag_cycle_stage_checkpoints
    where cycle_id=p_cycle_id and stage=p_stage for update;
  if found then
    -- No automatic retry or takeover, even when a lease has expired.
    raise exception 'AG_WORKER_EXISTING_STAGE_REQUIRES_RECONCILIATION';
  end if;

  insert into public.ag_cycle_stage_checkpoints
    (cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,
     lease_expires_at,attempt_count,started_at,updated_at)
  values (v_cycle.id,v_cycle.user_id,v_cycle.portfolio_id,v_cycle.strategy_era_id,
    p_stage,'running',v_token,now()+make_interval(secs=>p_lease_seconds),1,now(),now());
  return v_token;
end;
$$;

revoke all on function public.ag_worker_claim_stage(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.ag_worker_claim_stage(uuid,text,integer) to service_role;
