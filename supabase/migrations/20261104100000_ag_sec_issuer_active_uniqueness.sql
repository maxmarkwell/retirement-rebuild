-- The one-company SEC verification has its own namespace and concurrency gate.
-- Legacy research versions, Real Portfolio and Paper Long-Term are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_sec_one_active_per_user
ON public.discovery_scan_runs (user_id)
WHERE portfolio_type = 'paper_active'
  AND scoring_version = 'ag-sec-issuer-v1'
  AND status IN ('pending', 'running');
