-- Validate durable stage output at the database boundary, not just in TypeScript.
-- Replaces only the completion function; no data migrations or cycle modifications.
create or replace function public.ag_worker_complete_stage(
  p_cycle_id uuid, p_stage text, p_token uuid, p_output jsonb
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cycle_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'AG_WORKER_UNAUTHORIZED'; end if;
  if p_cycle_id = '583809c1-7157-4ad4-b343-56acc332a145'::uuid then
    raise exception 'AG_WORKER_PROTECTED_CYCLE';
  end if;
  if p_output is null or jsonb_typeof(p_output) is distinct from 'object'
     or p_output->>'schemaVersion' is distinct from '1'
     or p_output->>'cycleId' is distinct from p_cycle_id::text
     or p_output->>'stage' is distinct from p_stage
     or jsonb_typeof(p_output->'payload') is distinct from 'object'
     or p_output->'payload' is not distinct from '{}'::jsonb
     or jsonb_typeof(p_output->'producedAt') is distinct from 'string'
     or coalesce(length(p_output->>'producedAt'), 0) = 0
  then raise exception 'AG_WORKER_OUTPUT_INVALID'; end if;

  -- Serialize completion against cycle state transitions and competing claims.
  select id into v_cycle_id from public.ag_daily_cycles
    where id=p_cycle_id and status='running' for update;
  if not found then return false; end if;

  update public.ag_cycle_stage_checkpoints
    set status='completed',output=p_output,completed_at=now(),updated_at=now(),
        claim_token=null,lease_expires_at=null
    where cycle_id=p_cycle_id and stage=p_stage and claim_token=p_token
      and status='running' and lease_expires_at>now()
      and exists (select 1 from public.ag_daily_cycles where id=p_cycle_id and status='running');
  return found;
end;
$$;

revoke all on function public.ag_worker_complete_stage(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ag_worker_complete_stage(uuid,text,uuid,jsonb) to service_role;
