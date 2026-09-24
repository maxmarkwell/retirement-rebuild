-- Accelerated Growth quantitative reassessment can close an unresolved Deep
-- Research WATCH before another Deep Research call is warranted. Preserve that
-- explicit resolution reason instead of collapsing it into a generic STOP.

alter table public.ag_research_watchlist
  drop constraint if exists ag_research_watchlist_resolution_check;

alter table public.ag_research_watchlist
  add constraint ag_research_watchlist_resolution_check
  check (
    resolution is null
    or resolution in (
      'PROCEED',
      'STOP',
      'STALE',
      'QUANTITATIVE_REVIEW',
      'QUANTITATIVE_REJECT',
      'QUANTITATIVE_INSUFFICIENT_DATA'
    )
  );
