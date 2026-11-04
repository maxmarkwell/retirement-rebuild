-- Release 2E: prevent overlapping evidence-reconciliation runs per owner.
-- Only paper_active / ag-sec-facts-v1. No shared portfolio accounting changes.
CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_sec_facts_one_active_per_user
ON public.discovery_scan_runs (user_id)
WHERE portfolio_type = 'paper_active'
  AND scoring_version = 'ag-sec-facts-v1'
  AND status IN ('pending', 'running');
