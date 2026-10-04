-- PROPOSAL ONLY. Do not run until reviewed against the live Supabase schema.
-- Apply AFTER the ag_cycle_stage_checkpoints table in
-- docs/ag-resumable-cycle-checkpoint-design.md has been approved and created.
-- No scheduled job or existing API invokes these functions.

ALTER TABLE public.ag_cycle_stage_checkpoints
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_expires_at timestamptz;

-- Atomic claim: serialize competing requests on the parent cycle row.
-- A timed-out lease is NOT reclaimed automatically. It must be reconciled.
-- Six-minute lease exceeds the existing five-minute Vercel request ceiling;
-- future stage handlers must enforce a shorter execution budget and revisit
-- this value if their platform timeout changes.
CREATE OR REPLACE FUNCTION public.ag_claim_cycle_stage(
  p_cycle_id uuid,
  p_stage text
)
RETURNS TABLE(checkpoint_id uuid, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cycle public.ag_daily_cycles%ROWTYPE;
  v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
  v_previous text;
  v_token uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_stage IS NULL OR p_stage NOT IN ('holding_review','discovery','catalyst_deep_research','committee','persistence','finalized')
  THEN RAISE EXCEPTION 'Invalid AG stage'; END IF;

  SELECT * INTO v_cycle FROM public.ag_daily_cycles
  WHERE id = p_cycle_id AND user_id = auth.uid() AND status = 'running'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle unavailable or not running'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios p
    JOIN public.portfolio_strategy_eras e ON e.portfolio_id = p.id
    WHERE p.id = v_cycle.portfolio_id AND p.user_id = auth.uid()
      AND p.type = 'paper_active' AND p.is_real_money = false
      AND e.id = v_cycle.strategy_era_id AND e.strategy_key = 'accelerated_growth'
      AND e.execution_mode = 'paper' AND e.ended_at IS NULL
  ) THEN RAISE EXCEPTION 'Active paper AG portfolio and era required'; END IF;

  v_previous := CASE p_stage
    WHEN 'discovery' THEN 'holding_review'
    WHEN 'catalyst_deep_research' THEN 'discovery'
    WHEN 'committee' THEN 'catalyst_deep_research'
    WHEN 'persistence' THEN 'committee'
    WHEN 'finalized' THEN 'persistence'
    ELSE NULL END;

  IF v_previous IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ag_cycle_stage_checkpoints
    WHERE cycle_id = p_cycle_id AND stage = v_previous AND status = 'completed'
  ) THEN RAISE EXCEPTION 'Previous AG stage has not completed'; END IF;

  SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
  WHERE cycle_id = p_cycle_id AND stage = p_stage FOR UPDATE;
  IF FOUND AND v_checkpoint.status <> 'pending' THEN
    RAISE EXCEPTION 'Stage already claimed, completed or requires manual review';
  END IF;

  IF FOUND THEN
    UPDATE public.ag_cycle_stage_checkpoints c
    SET status = 'running', attempt_count = attempt_count + 1,
      claim_token = v_token, started_at = now(),
      lease_expires_at = now() + interval '6 minutes', updated_at = now()
    WHERE c.id = v_checkpoint.id RETURNING c.id INTO checkpoint_id;
  ELSE
    INSERT INTO public.ag_cycle_stage_checkpoints
      (cycle_id, user_id, portfolio_id, strategy_era_id, stage, status,
       attempt_count, claim_token, started_at, lease_expires_at)
    VALUES (v_cycle.id, auth.uid(), v_cycle.portfolio_id, v_cycle.strategy_era_id,
            p_stage, 'running', 1, v_token, now(), now() + interval '6 minutes')
    RETURNING id INTO checkpoint_id;
  END IF;
  claim_token := v_token;
  RETURN NEXT;
END;
$$;

-- Completion requires the original claim token. Expired claims cannot finish.
CREATE OR REPLACE FUNCTION public.ag_complete_cycle_stage(
  p_checkpoint_id uuid, p_claim_token uuid, p_output jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR p_output IS NULL THEN
    RAISE EXCEPTION 'Authenticated caller and non-null output required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='committee') THEN
    IF jsonb_typeof(p_output->'persistence_tickers') IS DISTINCT FROM 'array'
       OR jsonb_array_length(CASE
          WHEN jsonb_typeof(p_output->'persistence_tickers')='array'
          THEN p_output->'persistence_tickers' ELSE '[]'::jsonb END)=0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(p_output->'persistence_tickers')='array'
          THEN p_output->'persistence_tickers' ELSE '[]'::jsonb END) AS item
          WHERE jsonb_typeof(item)<>'string'
             OR (item #>> '{}') !~ '^[A-Z][A-Z0-9.-]{0,14}$')
       OR (SELECT count(*) FROM jsonb_array_elements_text(CASE
          WHEN jsonb_typeof(p_output->'persistence_tickers')='array'
          THEN p_output->'persistence_tickers' ELSE '[]'::jsonb END))
          <> (SELECT count(DISTINCT item)
              FROM jsonb_array_elements_text(CASE
              WHEN jsonb_typeof(p_output->'persistence_tickers')='array'
              THEN p_output->'persistence_tickers' ELSE '[]'::jsonb END) AS item)
    THEN RAISE EXCEPTION 'Valid Committee persistence manifest required'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='persistence') THEN
    RAISE EXCEPTION 'Persistence requires ledger-verified completion';
  END IF;
  UPDATE public.ag_cycle_stage_checkpoints c
  SET status='completed', output=p_output, claim_token=NULL,
      lease_expires_at=NULL, completed_at=now(), updated_at=now()
  WHERE c.id=p_checkpoint_id AND c.user_id=auth.uid()
    AND c.status='running' AND c.claim_token=p_claim_token
    AND c.lease_expires_at>now()
    AND EXISTS (SELECT 1 FROM public.ag_daily_cycles d
      WHERE d.id=c.cycle_id AND d.user_id=auth.uid() AND d.status='running');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_claim_cycle_stage(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ag_complete_cycle_stage(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_claim_cycle_stage(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ag_complete_cycle_stage(uuid,uuid,jsonb) TO authenticated;
-- Committee manifest semantics require independent upstream verification.
-- Administrative recovery remains deliberately unimplemented.

-- Defense in depth: completed checkpoint evidence cannot be rewritten by
-- ordinary UPDATEs, including privileged RPC mistakes. Recovery needs a
-- separately reviewed migration/procedure rather than silent mutation.
CREATE OR REPLACE FUNCTION public.ag_protect_completed_checkpoint()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF OLD.status='completed' AND (
   NEW.status IS DISTINCT FROM OLD.status OR
   NEW.output IS DISTINCT FROM OLD.output OR
   NEW.claim_token IS DISTINCT FROM OLD.claim_token OR
   NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR
   NEW.stage IS DISTINCT FROM OLD.stage
 ) THEN RAISE EXCEPTION 'Completed AG checkpoint is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ag_protect_completed_checkpoint_update
BEFORE UPDATE ON public.ag_cycle_stage_checkpoints
FOR EACH ROW EXECUTE FUNCTION public.ag_protect_completed_checkpoint();
