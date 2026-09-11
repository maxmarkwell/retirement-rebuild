-- Retirement Rebuild
-- Allow exactly one intentional Committee rerun when a WATCH reassessment is ready.
--
-- The duplicate-run guard protects a Discovery candidate from accidental repeat
-- Committee calls. A due reassessment is the one legitimate exception: the
-- system must permit one new non-failed Committee run after the reassessment
-- became ready, even if Discovery has not produced a new candidate row yet.

create or replace function public.prevent_duplicate_committee_run()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  ready_reassessment_triggered_at timestamptz;
begin
  if new.discovery_candidate_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.ai_committee_runs existing
    where existing.user_id = new.user_id
      and existing.portfolio_id = new.portfolio_id
      and existing.discovery_candidate_id = new.discovery_candidate_id
      and existing.status <> 'failed'
  ) then
    return new;
  end if;

  select r.triggered_at
  into ready_reassessment_triggered_at
  from public.investment_reassessments r
  where r.user_id = new.user_id
    and r.portfolio_id = new.portfolio_id
    and upper(r.ticker) = upper(new.ticker)
    and r.status = 'ready'
    and r.triggered_at is not null
  order by r.triggered_at desc
  limit 1;

  if ready_reassessment_triggered_at is not null
     and not exists (
       select 1
       from public.ai_committee_runs rerun
       where rerun.user_id = new.user_id
         and rerun.portfolio_id = new.portfolio_id
         and upper(rerun.ticker) = upper(new.ticker)
         and rerun.status <> 'failed'
         and rerun.run_date >= ready_reassessment_triggered_at
     ) then
    return new;
  end if;

  raise exception 'A Committee run already exists for this Discovery candidate.'
    using errcode = '23505';
end;
$$;
