-- Server-only primitives for future AG worker orchestration.
-- Not connected to any scheduled worker or browser route in this migration.
-- Only service_role can execute; no client-side or authenticated RPC grants.
create or replace function public.ag_worker_claim_stage(
  p_cycle_id uuid, p_stage text, p_lease_seconds integer default 120
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_stage public.ag_cycle_stage_checkpoints%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_cycle_id = '583809c1-7157-4ad4-b343-56acc332a145'::uuid then
    raise exception 'AG_WORKER_PROTECTED_CYCLE';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 300 then raise exception 'AG_WORKER_INVALID_LEASE'; end if;
  if p_stage not in ('holding_review','discovery','catalyst_deep_research','committee','persistence','finalized')
    then raise exception 'AG_WORKER_INVALID_STAGE'; end if;
  -- Serialize claims against the authoritative cycle row, including absent checkpoint rows.
  perform 1 from public.ag_daily_cycles where id=p_cycle_id and status='running' for update;
  if not found then raise exception 'AG_WORKER_CYCLE_NOT_RUNNING'; end if;
  select * into v_stage from public.ag_cycle_stage_checkpoints
    where cycle_id=p_cycle_id and stage=p_stage for update;
  if found then
    if v_stage.status in ('completed','needs_manual_review')
       or (v_stage.status='running' and v_stage.lease_expires_at is not null and v_stage.lease_expires_at > now())
       or (v_stage.status='running' and v_stage.lease_expires_at is null)
    then raise exception 'AG_WORKER_STAGE_NOT_CLAIMABLE'; end if;
    -- Never automatically take over expired or failed work. Reconciliation must
    -- explicitly authorize recovery through a separate audited workflow.
    if v_stage.status in ('running','failed') then raise exception 'AG_WORKER_RECONCILIATION_REQUIRED'; end if;
    update public.ag_cycle_stage_checkpoints
       set status='running', claim_token=v_token, lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
           attempt_count=attempt_count+1, started_at=now(), updated_at=now()
     where id=v_stage.id;
  else
    insert into public.ag_cycle_stage_checkpoints
      (cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at,attempt_count,started_at,updated_at)
    select id,user_id,portfolio_id,strategy_era_id,p_stage,'running',v_token,
           now()+make_interval(secs=>p_lease_seconds),1,now(),now()
    from public.ag_daily_cycles where id=p_cycle_id;
  end if;
  return v_token;
end;
$$;

create or replace function public.ag_worker_renew_stage(
  p_cycle_id uuid, p_stage text, p_token uuid, p_lease_seconds integer default 120
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_cycle_id = '583809c1-7157-4ad4-b343-56acc332a145'::uuid then
    raise exception 'AG_WORKER_PROTECTED_CYCLE';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 300 then raise exception 'AG_WORKER_INVALID_LEASE'; end if;
  update public.ag_cycle_stage_checkpoints
    set lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
    where cycle_id=p_cycle_id and stage=p_stage and claim_token=p_token
      and status='running' and lease_expires_at>now()
      and exists (select 1 from public.ag_daily_cycles where id=p_cycle_id and status='running');
  return found;
end;
$$;

create or replace function public.ag_worker_complete_stage(
  p_cycle_id uuid, p_stage text, p_token uuid, p_output jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_cycle_id = '583809c1-7157-4ad4-b343-56acc332a145'::uuid then
    raise exception 'AG_WORKER_PROTECTED_CYCLE';
  end if;
  if p_output is null then raise exception 'AG_WORKER_OUTPUT_REQUIRED'; end if;
  update public.ag_cycle_stage_checkpoints
    set status='completed',output=p_output,completed_at=now(),updated_at=now(),
        claim_token=null,lease_expires_at=null
    where cycle_id=p_cycle_id and stage=p_stage and claim_token=p_token
      and status='running' and lease_expires_at>now()
      and exists (select 1 from public.ag_daily_cycles where id=p_cycle_id and status='running');
  return found;
end;
$$;

revoke all on function public.ag_worker_claim_stage(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.ag_worker_renew_stage(uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.ag_worker_complete_stage(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ag_worker_claim_stage(uuid,text,integer) to service_role;
grant execute on function public.ag_worker_renew_stage(uuid,text,uuid,integer) to service_role;
grant execute on function public.ag_worker_complete_stage(uuid,text,uuid,jsonb) to service_role;
