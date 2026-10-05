-- PROPOSAL ONLY. Read-only recovery evidence boundary.
CREATE OR REPLACE FUNCTION public.ag_read_cycle_decision_ledger(p_cycle_id uuid)
RETURNS TABLE(
 cycle_id uuid,ticker text,status text,investment_decision_id uuid,payload_hash text,
 decision_kind text,user_id uuid,portfolio_id uuid,strategy_era_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT w.cycle_id,w.ticker,w.status,w.investment_decision_id,w.payload_hash,
        w.decision_kind,w.user_id,w.portfolio_id,w.strategy_era_id
 FROM public.ag_cycle_decision_writes w
 JOIN public.ag_daily_cycles c ON c.id=w.cycle_id
 WHERE w.cycle_id=p_cycle_id AND w.user_id=auth.uid()
   AND c.user_id=auth.uid()
   AND w.portfolio_id=c.portfolio_id
   AND w.strategy_era_id=c.strategy_era_id;
$$;
REVOKE ALL ON FUNCTION public.ag_read_cycle_decision_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_read_cycle_decision_ledger(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ag_read_cycle_checkpoint_status(p_cycle_id uuid)
RETURNS TABLE(
 checkpoint_id uuid,stage text,status text,attempt_count integer,
 started_at timestamptz,completed_at timestamptz,lease_expires_at timestamptz,
 updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT s.id,s.stage,s.status,s.attempt_count,s.started_at,s.completed_at,
        s.lease_expires_at,s.updated_at
 FROM public.ag_cycle_stage_checkpoints s
 JOIN public.ag_daily_cycles c ON c.id=s.cycle_id
 WHERE s.cycle_id=p_cycle_id AND s.user_id=auth.uid()
   AND c.user_id=auth.uid()
   AND s.portfolio_id=c.portfolio_id
   AND s.strategy_era_id=c.strategy_era_id;
$$;
REVOKE ALL ON FUNCTION public.ag_read_cycle_checkpoint_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_read_cycle_checkpoint_status(uuid) TO authenticated;
