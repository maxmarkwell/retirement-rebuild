-- Ported unchanged from the AG selection-audit branch after live duplicate-scan verification.
-- Restricts one active AG v2 scan per authenticated owner.
-- Explicitly excludes Real Portfolio, Paper Long-Term, and other scan versions.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_v2_one_active_per_user
ON public.discovery_scan_runs (user_id)
WHERE portfolio_type = 'paper_active'
  AND scoring_version = 'ag-opportunity-v2'
  AND status IN ('pending', 'running');
