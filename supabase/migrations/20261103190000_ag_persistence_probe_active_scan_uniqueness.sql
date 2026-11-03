-- Release 2B: isolated, deterministic production persistence exercise.
-- AG paper-only; excludes old AG v2, Real Portfolio, and Paper Long-Term.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_probe_one_active_per_user
ON public.discovery_scan_runs (user_id)
WHERE portfolio_type = 'paper_active'
  AND scoring_version = 'ag-persistence-probe-v1'
  AND status IN ('pending', 'running');
