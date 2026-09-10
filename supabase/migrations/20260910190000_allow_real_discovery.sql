-- Allow Discovery V2 to persist and process Real Portfolio runs.

alter table public.stock_discovery_candidates
  drop constraint if exists stock_discovery_candidates_portfolio_type_check;

alter table public.stock_discovery_candidates
  add constraint stock_discovery_candidates_portfolio_type_check
  check (portfolio_type in ('paper_active', 'paper_long_term', 'real'));

-- discovery_scan_runs was introduced after the original checked-in discovery migrations.
-- Guard this change so environments without the table can still apply the migration cleanly.
do $$
begin
  if to_regclass('public.discovery_scan_runs') is not null then
    alter table public.discovery_scan_runs
      drop constraint if exists discovery_scan_runs_portfolio_type_check;

    alter table public.discovery_scan_runs
      add constraint discovery_scan_runs_portfolio_type_check
      check (portfolio_type in ('paper_active', 'paper_long_term', 'real'));
  end if;
end
$$;