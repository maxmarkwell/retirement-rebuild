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


CREATE OR REPLACE FUNCTION public.ag_read_cycle_watch_ledger(p_cycle_id uuid)
RETURNS TABLE(
 cycle_id uuid,stream text,ticker text,action text,source_row_id uuid,
 payload_hash text,status text,effect text,affected_row_id uuid,
 user_id uuid,portfolio_id uuid,strategy_era_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT w.cycle_id,w.stream,w.ticker,w.action,w.source_row_id,w.payload_hash,
        w.status,w.effect,w.affected_row_id,w.user_id,w.portfolio_id,w.strategy_era_id
 FROM public.ag_cycle_watch_writes w
 JOIN public.ag_daily_cycles c ON c.id=w.cycle_id
 WHERE w.cycle_id=p_cycle_id AND w.user_id=auth.uid()
   AND c.user_id=auth.uid()
   AND w.portfolio_id=c.portfolio_id
   AND w.strategy_era_id=c.strategy_era_id;
$$;
REVOKE ALL ON FUNCTION public.ag_read_cycle_watch_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_read_cycle_watch_ledger(uuid) TO authenticated;


-- Completed-output transport for server-side resumable stage execution.
-- Kept separate from the narrow status RPC so status/UI callers never receive
-- research payloads, claim tokens, or errors accidentally.
CREATE OR REPLACE FUNCTION public.ag_read_completed_stage_output(
 p_cycle_id uuid,p_stage text
)
RETURNS TABLE(checkpoint_id uuid,stage text,output jsonb,completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT s.id,s.stage,s.output,s.completed_at
 FROM public.ag_cycle_stage_checkpoints s
 JOIN public.ag_daily_cycles c ON c.id=s.cycle_id
 WHERE s.cycle_id=p_cycle_id
   AND s.stage=p_stage
   AND s.status='completed'
   AND s.output IS NOT NULL
   AND s.user_id=auth.uid()
   AND c.user_id=auth.uid()
   AND s.portfolio_id=c.portfolio_id
   AND s.strategy_era_id=c.strategy_era_id
   AND p_stage IN ('holding_review','discovery','catalyst_deep_research','committee','persistence','finalized');
$$;
REVOKE ALL ON FUNCTION public.ag_read_completed_stage_output(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_read_completed_stage_output(uuid,text) TO authenticated;
