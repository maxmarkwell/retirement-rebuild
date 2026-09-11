-- Retirement Rebuild
-- Decision lifecycle: prevent accidental duplicate Committee runs
-- for the exact same Discovery candidate.
--
-- This is intentionally a trigger rather than a unique index so
-- existing historical duplicates do not block the migration.

create or replace function public.prevent_duplicate_committee_run()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.discovery_candidate_id is not null
     and exists (
       select 1
       from public.ai_committee_runs existing
       where existing.user_id = new.user_id
         and existing.portfolio_id = new.portfolio_id
         and existing.discovery_candidate_id = new.discovery_candidate_id
         and existing.status <> 'failed'
     ) then
    raise exception 'A Committee run already exists for this Discovery candidate.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_committee_run_trigger
on public.ai_committee_runs;

create trigger prevent_duplicate_committee_run_trigger
before insert on public.ai_committee_runs
for each row
execute function public.prevent_duplicate_committee_run();
