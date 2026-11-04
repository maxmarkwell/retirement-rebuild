-- Release 2C: isolate live vendor-evidence capture from all existing AG research.
-- Uses existing owner-scoped discovery_scan_runs and never touches portfolio accounting.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_evidence_one_active_per_user
ON public.discovery_scan_runs (user_id)
WHERE portfolio_type = 'paper_active'
  AND scoring_version = 'ag-evidence-capture-v1'
  AND status IN ('pending', 'running');
