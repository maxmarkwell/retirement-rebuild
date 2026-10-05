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
  -- Authenticate and fence the claim before inspecting caller-provided stage
  -- output. Stale or wrong-token workers return false rather than receiving
  -- validation errors that could reveal checkpoint state.
  IF NOT EXISTS (
    SELECT 1 FROM public.ag_cycle_stage_checkpoints c
    JOIN public.ag_daily_cycles d ON d.id=c.cycle_id
    WHERE c.id=p_checkpoint_id AND c.user_id=auth.uid()
      AND c.status='running' AND c.claim_token=p_claim_token
      AND c.lease_expires_at IS NOT NULL AND c.lease_expires_at>now()
      AND d.user_id=auth.uid() AND d.status='running'
  ) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='committee') THEN
    IF jsonb_typeof(p_output->'persistence_tickers') IS DISTINCT FROM 'array'
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
    -- A ticker-only checkpoint is not durable decision intent. Require the
    -- upstream source set, complete original outputs and the exact canonical
    -- 16-argument payloads to have identical one-to-one ticker membership.
    -- This validates structural consistency, NOT that the caller genuinely
    -- obtained these results from the Committee model.
    IF jsonb_typeof(p_output->'source_symbols') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'source_decisions') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'decision_payloads') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'source_count') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_output->'output_count') IS DISTINCT FROM 'number'
       OR p_output->>'failure_count' IS DISTINCT FROM '0'
    THEN RAISE EXCEPTION 'Full Committee intent evidence required'; END IF;
    IF jsonb_array_length(p_output->'source_symbols') <>
         jsonb_array_length(p_output->'persistence_tickers')
       OR jsonb_array_length(p_output->'source_decisions') <>
         jsonb_array_length(p_output->'persistence_tickers')
       OR jsonb_array_length(p_output->'decision_payloads') <>
         jsonb_array_length(p_output->'persistence_tickers')
       OR p_output->>'source_count' IS DISTINCT FROM
          jsonb_array_length(p_output->'source_symbols')::text
       OR p_output->>'output_count' IS DISTINCT FROM
          jsonb_array_length(p_output->'source_decisions')::text
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'decision_payloads') m
         WHERE jsonb_typeof(m) IS DISTINCT FROM 'object'
           OR jsonb_typeof(m->'ticker') IS DISTINCT FROM 'string'
           OR jsonb_typeof(m->'args') IS DISTINCT FROM 'array'
           OR jsonb_array_length(CASE WHEN jsonb_typeof(m->'args')='array'
             THEN m->'args' ELSE '[]'::jsonb END)<>16
           OR (m->>'ticker') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
           OR NOT ((p_output->'persistence_tickers') ? (m->>'ticker'))
           OR (m->'args'->>1) IS DISTINCT FROM (m->>'ticker')
           OR (m->'args'->>2) IS DISTINCT FROM 'committee'
           OR (m->'args'->>0) IS DISTINCT FROM (
             SELECT cycle_id::text FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id)
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'source_symbols') s
         WHERE jsonb_typeof(s) IS DISTINCT FROM 'string'
           OR NOT ((p_output->'persistence_tickers') ? (s #>> '{}'))
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'source_decisions') d
         WHERE jsonb_typeof(d) IS DISTINCT FROM 'object'
           OR jsonb_typeof(d->'symbol') IS DISTINCT FROM 'string'
           OR NOT ((p_output->'persistence_tickers') ? (d->>'symbol'))
       )
       OR (SELECT count(DISTINCT m->>'ticker')
           FROM jsonb_array_elements(p_output->'decision_payloads') m)
          <> jsonb_array_length(p_output->'decision_payloads')
       OR (SELECT count(DISTINCT s #>> '{}')
           FROM jsonb_array_elements(p_output->'source_symbols') s)
          <> jsonb_array_length(p_output->'source_symbols')
       OR (SELECT count(DISTINCT d->>'symbol')
           FROM jsonb_array_elements(p_output->'source_decisions') d)
          <> jsonb_array_length(p_output->'source_decisions')
    THEN RAISE EXCEPTION 'Committee intent identities or payloads inconsistent'; END IF;

  END IF;
  -- Holding reviews may legitimately have no eligible positions. Still
  -- require an explicit complete empty source/output snapshot rather than
  -- allowing a missing manifest or silently skipping a failed review.
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='holding_review') THEN
    IF jsonb_typeof(p_output->'persistence_tickers') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'source_symbols') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'source_decisions') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'decision_payloads') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'source_count') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_output->'output_count') IS DISTINCT FROM 'number'
       OR p_output->>'failure_count' IS DISTINCT FROM '0'
    THEN RAISE EXCEPTION 'Full holding intent evidence required'; END IF;
    IF jsonb_array_length(p_output->'source_symbols') <>
         jsonb_array_length(p_output->'persistence_tickers')
       OR jsonb_array_length(p_output->'source_decisions') <>
         jsonb_array_length(p_output->'persistence_tickers')
       OR jsonb_array_length(p_output->'decision_payloads') <>
         jsonb_array_length(p_output->'persistence_tickers')
       OR p_output->>'source_count' IS DISTINCT FROM
          jsonb_array_length(p_output->'source_symbols')::text
       OR p_output->>'output_count' IS DISTINCT FROM
          jsonb_array_length(p_output->'source_decisions')::text
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'persistence_tickers') t
         WHERE jsonb_typeof(t) IS DISTINCT FROM 'string'
           OR (t #>> '{}') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'decision_payloads') m
         WHERE jsonb_typeof(m) IS DISTINCT FROM 'object'
           OR jsonb_typeof(m->'ticker') IS DISTINCT FROM 'string'
           OR jsonb_typeof(m->'args') IS DISTINCT FROM 'array'
           OR jsonb_array_length(CASE WHEN jsonb_typeof(m->'args')='array'
             THEN m->'args' ELSE '[]'::jsonb END)<>16
           OR NOT ((p_output->'persistence_tickers') ? (m->>'ticker'))
           OR (m->'args'->>1) IS DISTINCT FROM (m->>'ticker')
           OR (m->'args'->>2) IS DISTINCT FROM 'holding_review'
           OR (m->'args'->>0) IS DISTINCT FROM (
             SELECT cycle_id::text FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id)
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'source_symbols') s
         WHERE jsonb_typeof(s) IS DISTINCT FROM 'string'
           OR NOT ((p_output->'persistence_tickers') ? (s #>> '{}'))
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'source_decisions') d
         WHERE jsonb_typeof(d) IS DISTINCT FROM 'object'
           OR jsonb_typeof(d->'symbol') IS DISTINCT FROM 'string'
           OR NOT ((p_output->'persistence_tickers') ? (d->>'symbol'))
       )
       OR (SELECT count(DISTINCT t #>> '{}')
           FROM jsonb_array_elements(p_output->'persistence_tickers') t)
          <> jsonb_array_length(p_output->'persistence_tickers')
       OR (SELECT count(DISTINCT m->>'ticker')
           FROM jsonb_array_elements(p_output->'decision_payloads') m)
          <> jsonb_array_length(p_output->'decision_payloads')
       OR (SELECT count(DISTINCT s #>> '{}')
           FROM jsonb_array_elements(p_output->'source_symbols') s)
          <> jsonb_array_length(p_output->'source_symbols')
       OR (SELECT count(DISTINCT d->>'symbol')
           FROM jsonb_array_elements(p_output->'source_decisions') d)
          <> jsonb_array_length(p_output->'source_decisions')
    THEN RAISE EXCEPTION 'Holding intent identities or payloads inconsistent'; END IF;
  END IF;
  -- Discovery completion is the durable upstream handoff. Require a complete
  -- successful result plus the watch/source and execution-evidence context
  -- consumed by later requests; never allow a ticker-only resume snapshot.
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='discovery') THEN
    IF jsonb_typeof(p_output->'discovery') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_output->'watch_context') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_output->'watch_context'->'research') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_output->'watch_context'->'committee') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_output->'discovery'->'candidates') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'discovery'->'executionEvidenceInputs') IS DISTINCT FROM 'object'
       OR p_output->'discovery'->>'rateLimited' IS DISTINCT FROM 'false'
       OR p_output->'discovery'->>'stoppedEarly' IS DISTINCT FROM 'false'
       OR jsonb_typeof(p_output->'discovery'->'errors') IS DISTINCT FROM 'array'
       OR jsonb_array_length(CASE WHEN jsonb_typeof(p_output->'discovery'->'errors')='array'
          THEN p_output->'discovery'->'errors' ELSE '[]'::jsonb END)<>0
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'discovery'->'candidates') candidate
         WHERE jsonb_typeof(candidate) IS DISTINCT FROM 'object'
           OR COALESCE(candidate->>'symbol','') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
           OR NOT ((p_output->'discovery'->'executionEvidenceInputs') ? (candidate->>'symbol'))
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(p_output->'watch_context'->'research') watch
         WHERE watch.key !~ '^[A-Z][A-Z0-9.-]{0,14}$'
           OR jsonb_typeof(watch.value) IS DISTINCT FROM 'object'
           OR COALESCE(watch.value->>'rowId','') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(p_output->'watch_context'->'committee') watch
         WHERE watch.key !~ '^[A-Z][A-Z0-9.-]{0,14}$'
           OR jsonb_typeof(watch.value) IS DISTINCT FROM 'string'
           OR (watch.value #>> '{}') !~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       )
    THEN RAISE EXCEPTION 'Full valid Discovery handoff required'; END IF;
  END IF;
  -- Deep-research output is a cross-request Committee input, not only a
  -- watchlist mutation manifest. Require the exact selected set and complete
  -- research provenance to be frozen alongside the mutation plan.
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='catalyst_deep_research') THEN
    IF jsonb_typeof(p_output->'selected_symbols') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'deep_research_results') IS DISTINCT FROM 'array'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'deep_research_results') result
         WHERE jsonb_typeof(result) IS DISTINCT FROM 'object'
           OR jsonb_typeof(result->'symbol') IS DISTINCT FROM 'string'
           OR length(COALESCE(result->>'symbol','')) NOT BETWEEN 1 AND 15
           OR upper(result->>'symbol') IS DISTINCT FROM result->>'symbol'
           OR COALESCE(result->>'researchStatus','') NOT IN ('PROCEED','WATCH','STOP')
           OR jsonb_typeof(result->'confidence') IS DISTINCT FROM 'number'
           OR CASE WHEN jsonb_typeof(result->'confidence')='number'
             THEN (result->>'confidence')::numeric NOT BETWEEN 0 AND 1 ELSE true END
           OR COALESCE(result->>'thesis','')=''
           OR COALESCE(result->>'model','')=''
           OR COALESCE(result->>'promptVersion','')=''
       )
       OR (SELECT count(*) FROM jsonb_array_elements(p_output->'deep_research_results'))
          <> (SELECT count(DISTINCT result->>'symbol')
              FROM jsonb_array_elements(p_output->'deep_research_results') result)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_output->'selected_symbols') selected
         WHERE jsonb_typeof(selected) IS DISTINCT FROM 'string'
           OR length(COALESCE(selected #>> '{}','')) NOT BETWEEN 1 AND 15
           OR upper(selected #>> '{}') IS DISTINCT FROM selected #>> '{}'
       )
    THEN RAISE EXCEPTION 'Full valid deep-research handoff required'; END IF;
  END IF;

  -- Deep-research completion must freeze the exact watchlist mutation plan,
  -- including source row identities and full WATCH upsert payloads. This is a
  -- structural provenance boundary; it does not prove model authenticity.
  IF EXISTS (SELECT 1 FROM public.ag_cycle_stage_checkpoints
             WHERE id=p_checkpoint_id AND stage='catalyst_deep_research') THEN
    IF jsonb_typeof(p_output->'watchlist_intents') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_output->'watchlist_intent_count') IS DISTINCT FROM 'number'
       OR p_output->>'watchlist_intent_count' IS DISTINCT FROM
          jsonb_array_length(CASE
            WHEN jsonb_typeof(p_output->'watchlist_intents')='array'
            THEN p_output->'watchlist_intents' ELSE '[]'::jsonb END)::text
       OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(p_output->'watchlist_intents')='array'
          THEN p_output->'watchlist_intents' ELSE '[]'::jsonb END) item
        WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
          OR jsonb_typeof(item->'stream') IS DISTINCT FROM 'string'
          OR COALESCE(item->>'stream','') NOT IN ('research_watch','committee_watch')
          OR jsonb_typeof(item->'symbol') IS DISTINCT FROM 'string'
          OR COALESCE(item->>'symbol','') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
          OR jsonb_typeof(item->'action') IS DISTINCT FROM 'string'
          OR COALESCE(item->>'action','') NOT IN (
            'upsert_watch','resolve_research','resolve_quantitative','supersede_committee')
          OR NOT (
            (item->>'stream'='research_watch' AND item->>'action' IN (
              'upsert_watch','resolve_research','resolve_quantitative'))
            OR (item->>'stream'='committee_watch'
              AND item->>'action'='supersede_committee'))
          OR (jsonb_typeof(item->'source_row_id') IS DISTINCT FROM 'null'
              AND jsonb_typeof(item->'source_row_id') IS DISTINCT FROM 'string')
          OR (jsonb_typeof(item->'source_row_id')='string'
              AND COALESCE(item->>'source_row_id','') !~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
          OR (item->>'action' IN ('resolve_quantitative','supersede_committee')
              AND item->'source_row_id'='null'::jsonb)
          OR (item->>'action'='resolve_research'
              AND (jsonb_typeof(item->'resolution') IS DISTINCT FROM 'string'
                OR COALESCE(item->>'resolution','') NOT IN ('PROCEED','STOP')))
          OR (item->>'action' IN ('resolve_quantitative','supersede_committee')
              AND (jsonb_typeof(item->'resolution') IS DISTINCT FROM 'string'
                OR COALESCE(item->>'resolution','') NOT IN ('REVIEW','REJECT','INSUFFICIENT_DATA')))
          OR (item->>'action'='upsert_watch' AND (
            jsonb_typeof(item->'outcome') IS DISTINCT FROM 'object'
            OR item->'outcome'->>'symbol' IS DISTINCT FROM item->>'symbol'
            OR item->'outcome'->>'researchStatus' IS DISTINCT FROM 'WATCH'
            OR jsonb_typeof(item->'outcome'->'confidence') IS DISTINCT FROM 'number'
            OR CASE WHEN jsonb_typeof(item->'outcome'->'confidence')='number'
              THEN (item->'outcome'->>'confidence')::numeric NOT BETWEEN 0 AND 1
              ELSE true END
            OR jsonb_typeof(item->'outcome'->'thesis') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'outcome'->'unresolvedQuestions') IS DISTINCT FROM 'array'
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE
                WHEN jsonb_typeof(item->'outcome'->'unresolvedQuestions')='array'
                THEN item->'outcome'->'unresolvedQuestions' ELSE '[]'::jsonb END) q
              WHERE jsonb_typeof(q) IS DISTINCT FROM 'string')
            OR jsonb_typeof(item->'outcome'->'thesisClock') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'outcome'->'invalidation') IS DISTINCT FROM 'array'
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE
                WHEN jsonb_typeof(item->'outcome'->'invalidation')='array'
                THEN item->'outcome'->'invalidation' ELSE '[]'::jsonb END) inv
              WHERE jsonb_typeof(inv) IS DISTINCT FROM 'string')
            OR jsonb_typeof(item->'outcome'->'model') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'outcome'->'promptVersion') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'outcome'->'priorWatchReassessed') IS DISTINCT FROM 'boolean'
            OR NOT (
              item->'outcome'->'companyName'='null'::jsonb
              OR jsonb_typeof(item->'outcome'->'companyName')='string')
            OR item->'outcome'->'priorWatchReassessed' IS DISTINCT FROM
              CASE WHEN item->'source_row_id'='null'::jsonb
                THEN 'false'::jsonb ELSE 'true'::jsonb END
            OR item->'outcome'->'priorWatchRowId' IS DISTINCT FROM item->'source_row_id'
          ))
       )
       OR (SELECT count(*) FROM jsonb_array_elements(CASE
             WHEN jsonb_typeof(p_output->'watchlist_intents')='array'
             THEN p_output->'watchlist_intents' ELSE '[]'::jsonb END))
          <> (SELECT count(DISTINCT (item->>'stream')||':'||(item->>'symbol'))
              FROM jsonb_array_elements(CASE
                WHEN jsonb_typeof(p_output->'watchlist_intents')='array'
                THEN p_output->'watchlist_intents' ELSE '[]'::jsonb END) item)
    THEN RAISE EXCEPTION 'Valid frozen watchlist intent manifest required'; END IF;
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
    AND c.lease_expires_at IS NOT NULL AND c.lease_expires_at > now()
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
 IF TG_OP='DELETE' THEN
   IF OLD.status='completed' THEN
     RAISE EXCEPTION 'Completed AG checkpoint cannot be deleted';
   END IF;
   RETURN OLD;
 END IF;
 IF OLD.status='completed' AND (
   NEW.status IS DISTINCT FROM OLD.status OR
   NEW.output IS DISTINCT FROM OLD.output OR
   NEW.claim_token IS DISTINCT FROM OLD.claim_token OR
   NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR
   NEW.user_id IS DISTINCT FROM OLD.user_id OR
   NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id OR
   NEW.strategy_era_id IS DISTINCT FROM OLD.strategy_era_id OR
   NEW.completed_at IS DISTINCT FROM OLD.completed_at OR
   NEW.stage IS DISTINCT FROM OLD.stage
 ) THEN RAISE EXCEPTION 'Completed AG checkpoint is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ag_protect_completed_checkpoint_update
BEFORE UPDATE OR DELETE ON public.ag_cycle_stage_checkpoints
FOR EACH ROW EXECUTE FUNCTION public.ag_protect_completed_checkpoint();
REVOKE ALL ON FUNCTION public.ag_protect_completed_checkpoint() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ag_protect_completed_checkpoint() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ag_protect_completed_checkpoint() TO service_role;

