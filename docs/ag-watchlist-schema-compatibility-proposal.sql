-- DRAFT ONLY. DO NOT APPLY WITHOUT READ-ONLY LIVE CATALOG AUDIT.
-- The checked-in 20260922100000 migration permits only PROCEED/STOP/STALE,
-- while the existing application writes these quantitative provenance values.
-- This proposal preserves that provenance rather than silently mapping it.
ALTER TABLE public.ag_research_watchlist
  DROP CONSTRAINT ag_research_watchlist_resolution_check;
ALTER TABLE public.ag_research_watchlist
  ADD CONSTRAINT ag_research_watchlist_resolution_check CHECK (
    resolution IS NULL OR resolution IN (
      'PROCEED','STOP','STALE',
      'QUANTITATIVE_REVIEW','QUANTITATIVE_REJECT',
      'QUANTITATIVE_INSUFFICIENT_DATA'
    )
  );
