-- Candidate: preserve immutable AG cycle attempts while allowing same-day retry generations.
alter table public.ag_daily_cycles
  add column if not exists attempt_number integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.ag_daily_cycles'::regclass
      and conname='ag_daily_cycles_attempt_number_check'
  ) then
    alter table public.ag_daily_cycles
      add constraint ag_daily_cycles_attempt_number_check check (attempt_number >= 1);
  end if;
end $$;

alter table public.ag_daily_cycles
  drop constraint if exists ag_daily_cycles_user_id_portfolio_id_strategy_era_id_cycle__key;

create unique index if not exists ag_daily_cycles_unique_attempt
  on public.ag_daily_cycles(user_id,portfolio_id,strategy_era_id,cycle_date,attempt_number);
