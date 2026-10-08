-- Candidate: narrow authenticated recovery for failed autonomous AG cycles.
create or replace function public.ag_recover_cycle_to_failed(
 p_cycle_id uuid,
 p_reason text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
 c public.ag_daily_cycles%rowtype;
 has_review boolean := false;
 has_expired_lease boolean := false;
 has_bad_worker boolean := false;
 reason_text text;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into c from public.ag_daily_cycles
 where id=p_cycle_id and user_id=auth.uid()
 for update;
 if c.id is null then raise exception 'cycle not found'; end if;
 if c.status <> 'running' then raise exception 'cycle is not running'; end if;

 select exists(
  select 1 from public.ag_cycle_stage_checkpoints s
  where s.cycle_id=p_cycle_id and s.status='needs_manual_review'
 ) into has_review;

 select exists(
  select 1 from public.ag_cycle_stage_checkpoints s
  where s.cycle_id=p_cycle_id and s.status='running'
    and s.lease_expires_at is not null and s.lease_expires_at < now()
 ) into has_expired_lease;

 select exists(
  select 1 from public.ag_cycle_worker_authorizations a
  where a.cycle_id=p_cycle_id and a.user_id=auth.uid()
    and (
      a.status in ('revoked','expired') or
      (a.status='active' and a.expires_at <= now()) or
      (a.status='active' and a.invocation_count >= a.max_invocations)
    )
 ) into has_bad_worker;

 if not (has_review or has_expired_lease or has_bad_worker) then
  raise exception 'cycle has no manual-recovery evidence';
 end if;

 -- Reject ambiguous durability state rather than falsely declaring recovery safe.
 if exists (select 1 from public.ag_cycle_stage_checkpoints s where s.cycle_id=p_cycle_id and s.stage in ('persistence','finalized'))
    or exists (select 1 from public.ag_cycle_decision_writes w where w.cycle_id=p_cycle_id)
    or exists (select 1 from public.ag_cycle_watch_writes w where w.cycle_id=p_cycle_id) then
  raise exception 'cycle durability evidence exists; reconciliation required';
 end if;
 if exists (select 1 from public.ag_cycle_worker_authorizations a where a.cycle_id=p_cycle_id and a.status='active' and a.expires_at>now()) then
  raise exception 'cycle worker remains authorized';
 end if;

 reason_text=left(coalesce(nullif(trim(p_reason),''),'Manual recovery after autonomous AG failure.'),500);

 update public.ag_cycle_stage_checkpoints
 set status='needs_manual_review',
     error_message=coalesce(error_message,reason_text),
     lease_expires_at=null,
     updated_at=now()
 where cycle_id=p_cycle_id and status='running';

 update public.ag_daily_cycles
 set status='failed',
     failure_message=reason_text,
     completed_at=coalesce(completed_at,now()),
     updated_at=now()
 where id=p_cycle_id and status='running';

 return found;
end;
$$;
revoke all on function public.ag_recover_cycle_to_failed(uuid,text) from public,anon;
grant execute on function public.ag_recover_cycle_to_failed(uuid,text) to authenticated,service_role;
