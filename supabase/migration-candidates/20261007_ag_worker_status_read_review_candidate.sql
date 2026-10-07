-- Additive authenticated read for cycle-owned autonomous worker status.
create or replace function public.ag_read_cycle_worker_authorization(p_cycle_id uuid)
returns table (
  status text,
  expires_at timestamptz,
  max_invocations integer,
  invocation_count integer,
  last_invoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not exists (
    select 1 from public.ag_daily_cycles c
    where c.id = p_cycle_id and c.user_id = auth.uid()
  ) then
    raise exception 'cycle not found';
  end if;
  return query
  select a.status,a.expires_at,a.max_invocations,a.invocation_count,a.last_invoked_at
  from public.ag_cycle_worker_authorizations a
  where a.cycle_id = p_cycle_id and a.user_id = auth.uid()
  limit 1;
end;
$$;
revoke all on function public.ag_read_cycle_worker_authorization(uuid) from public, anon;
grant execute on function public.ag_read_cycle_worker_authorization(uuid) to authenticated, service_role;
