-- Prevent two simultaneous Accelerated Growth v2 research scans per owner.
-- Narrowly scoped: leaves existing Real Portfolio and other scan versions untouched.
-- Apply only after reconciling any duplicate active AG v2 scans.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_v2_one_active_per_user
ON public.discovery_scan_runs (user_id)
WHERE portfolio_type = 'paper_active'
  AND scoring_version = 'ag-opportunity-v2'
  AND status IN ('pending', 'running');
