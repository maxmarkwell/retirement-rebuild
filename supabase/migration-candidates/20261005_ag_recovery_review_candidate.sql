-- REVIEW CANDIDATE ONLY. DO NOT APPLY WITHOUT EXPLICIT PRODUCTION MIGRATION APPROVAL.
-- Generated from CI-proven AG recovery proposals in dependency order.
-- Keep AG disabled before, during, and after migration until separately authorized.
BEGIN;

-- SOURCE: docs/ag-decision-provenance-schema-proposal.sql

-- PROPOSAL ONLY. DO NOT APPLY WITHOUT EXPLICIT MIGRATION APPROVAL.
-- Live read-only audit on 2026-10-05 confirmed investment_decisions.notes is
-- absent, while existing AG holding provenance and the atomic recovery design
-- require a durable text field. This nullable additive column preserves the
-- current application/draft contract without rewriting historical rows.
ALTER TABLE public.investment_decisions
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.investment_decisions.notes IS
  'Optional durable decision provenance/notes; AG holding review stores model and prompt provenance here.';

-- Deployment requirements:
-- * reconcile Supabase migration history drift before turning this proposal
--   into a numbered migration;
-- * run actual-schema disposable integration and security review first;
-- * applying this column alone does NOT authorize AG persistence/reactivation.


-- Live preflight confirms 20260924190000 already installed the quantitative watchlist constraint; no watchlist DDL is needed here.

-- SOURCE: checkpoint table SQL extracted from design


CREATE TABLE public.ag_cycle_stage_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  strategy_era_id uuid NOT NULL REFERENCES public.portfolio_strategy_eras(id),
  stage text NOT NULL CHECK (stage IN (
    'holding_review', 'discovery', 'catalyst_deep_research',
    'committee', 'persistence', 'finalized'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'needs_manual_review'
  )),
  output jsonb,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ag_checkpoint_unique_cycle_stage UNIQUE (cycle_id, stage),
  CONSTRAINT ag_checkpoint_completed_has_output CHECK (status <> 'completed' OR output IS NOT NULL)
);

CREATE INDEX ag_cycle_stage_checkpoints_portfolio_idx
  ON public.ag_cycle_stage_checkpoints(portfolio_id, cycle_id);

ALTER TABLE public.ag_cycle_stage_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ag_cycle_stage_checkpoints FROM anon, authenticated;
GRANT ALL ON TABLE public.ag_cycle_stage_checkpoints TO service_role;
-- No direct authenticated table access: checkpoint output contains internal
-- recovery evidence. Expose only narrowly scoped SECURITY DEFINER claim,
-- completion, status and reconciliation RPCs after security review.


-- SOURCE: docs/ag-stage-claim-rpc-proposal.sql

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


-- SOURCE: docs/ag-cycle-decision-ledger-proposal.sql

-- DESIGN DRAFT ONLY: DO NOT APPLY TO SUPABASE.
-- Requires schema review, privilege review and integration tests in an isolated DB.
-- This ledger records cycle-scoped intent and prevents concurrent claims.
-- It does NOT by itself make investment_decisions writes atomic.

CREATE TABLE public.ag_cycle_decision_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  strategy_era_id uuid NOT NULL REFERENCES public.portfolio_strategy_eras(id),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  decision_kind text NOT NULL CHECK (decision_kind IN ('holding_review','committee')),
  -- SHA-256 of a canonicalized immutable decision payload; never use a
  -- timestamp or randomly generated key for retry identification.
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','committed','needs_manual_review')),
  investment_decision_id uuid REFERENCES public.investment_decisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CONSTRAINT ag_cycle_decision_write_unique UNIQUE (cycle_id, ticker),
  CONSTRAINT ag_cycle_decision_write_commit_consistency CHECK (
    (status = 'committed' AND investment_decision_id IS NOT NULL AND committed_at IS NOT NULL)
    OR (status <> 'committed' AND investment_decision_id IS NULL AND committed_at IS NULL)
  )
);

CREATE INDEX ag_cycle_decision_writes_portfolio_idx
  ON public.ag_cycle_decision_writes(portfolio_id, created_at DESC);

ALTER TABLE public.ag_cycle_decision_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ag_cycle_decision_writes FROM anon, authenticated;
GRANT ALL ON TABLE public.ag_cycle_decision_writes TO service_role;
-- No direct authenticated table access. Reviewed SECURITY DEFINER RPCs are the
-- only authenticated read/write boundary for recovery evidence.

-- IMPLEMENTATION REQUIREMENTS FOR THE SEPARATE DRAFT ATOMIC RPC:
-- 1. Authenticate auth.uid(); lock ag_daily_cycles row FOR UPDATE.
-- 2. Confirm cycle is running and belongs to caller's active, non-real-money
--    paper AG portfolio and exact strategy era. Lock persistence checkpoint.
-- 3. Validate checkpoint claim token and lease. Refuse if interrupted or
--    already completed unless a verified committed ledger entry is returned.
-- 4. Lock the ledger key (cycle_id,ticker) using INSERT ... ON CONFLICT and
--    SELECT FOR UPDATE. Same key + different payload_hash MUST fail closed.
-- 5. Lock existing active ai_committee decision(s) for the same ticker and
--    active era. Multiple active rows require manual reconciliation.
-- 6. Preserve same-cycle idempotency via the committed ledger. For a new
--    cycle, supersede an existing active decision and INSERT a fresh immutable
--    snapshot even when its decision type matches; never attach a new payload
--    hash to an old decision row. Mark ledger committed IN ONE transaction.
-- 7. Validate all fields server-side; never blindly INSERT client JSON.
-- 8. If any step fails, roll back the entire transaction. A network timeout
--    after COMMIT requires a read-only ledger check, never blind retry.
-- 9. Do not create transactions. Transaction execution stays disabled.
-- 10. Watchlist mutations and other decision writes need their own equivalent
--     atomic/idempotent treatment before the persistence stage is enabled.


-- SOURCE: docs/ag-watchlist-ledger-proposal.sql

-- DESIGN DRAFT ONLY. DO NOT APPLY TO SUPABASE.
-- Durable retry evidence for watchlist mutations. The operation RPC must derive
-- payload_hash server-side and mutate target row + ledger in one transaction.
CREATE TABLE public.ag_cycle_watch_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  strategy_era_id uuid NOT NULL REFERENCES public.portfolio_strategy_eras(id),
  stream text NOT NULL CHECK (stream IN ('research_watch','committee_watch')),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  action text NOT NULL CHECK (action IN (
    'upsert_watch','resolve_research','resolve_quantitative','supersede_committee'
  )),
  source_row_id uuid,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','committed','needs_manual_review')),
  effect text CHECK (effect IS NULL OR effect IN ('applied','noop')),
  affected_row_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CONSTRAINT ag_cycle_watch_write_unique UNIQUE (cycle_id,stream,ticker),
  CONSTRAINT ag_cycle_watch_write_action_stream CHECK (
    (stream='research_watch' AND action IN (
      'upsert_watch','resolve_research','resolve_quantitative'))
    OR (stream='committee_watch' AND action='supersede_committee')
  ),
  CONSTRAINT ag_cycle_watch_write_source_required CHECK (
    (action IN ('resolve_quantitative','supersede_committee') AND source_row_id IS NOT NULL)
    OR action IN ('upsert_watch','resolve_research')
  ),
  CONSTRAINT ag_cycle_watch_write_commit_consistency CHECK (
    (status='committed' AND committed_at IS NOT NULL AND effect IS NOT NULL
      AND ((effect='applied' AND affected_row_id IS NOT NULL)
        OR (effect='noop' AND affected_row_id IS NULL)))
    OR (status<>'committed' AND committed_at IS NULL
      AND effect IS NULL AND affected_row_id IS NULL)
  )
);
CREATE INDEX ag_cycle_watch_writes_portfolio_idx
  ON public.ag_cycle_watch_writes(portfolio_id,created_at DESC);
ALTER TABLE public.ag_cycle_watch_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ag_cycle_watch_writes FROM anon, authenticated;
GRANT ALL ON TABLE public.ag_cycle_watch_writes TO service_role;
-- No direct authenticated table access. Reviewed SECURITY DEFINER RPCs are the
-- only authenticated read/write boundary for recovery evidence.


-- SOURCE: docs/ag-recovery-read-rpc-proposal.sql

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


-- SOURCE: docs/ag-atomic-watchlist-rpc-draft.sql

-- DRAFT ONLY. DO NOT APPLY WITHOUT LIVE-SCHEMA / SECURITY REVIEW.
-- One operation per transaction. Same-cycle identical retry returns the ledger
-- id; conflicting retry, stale source identity, newer-cycle evidence, or an
-- ambiguous prior state fails closed.
CREATE OR REPLACE FUNCTION public.ag_commit_watch_operation(
 p_cycle_id uuid,p_claim_token uuid,p_stream text,p_ticker text,p_action text,
 p_source_row_id uuid,p_resolution text,p_company_name text,p_confidence numeric,
 p_thesis text,p_unresolved_questions text[],p_thesis_clock text,
 p_invalidation text[],p_model text,p_prompt_version text,
 p_prior_watch_reassessed boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_cycle public.ag_daily_cycles%ROWTYPE;
 v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
 v_ledger public.ag_cycle_watch_writes%ROWTYPE;
 v_watch public.ag_research_watchlist%ROWTYPE;
 v_decision public.investment_decisions%ROWTYPE;
 v_payload_hash text; v_affected uuid; v_effect text; v_now timestamptz:=now();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_ticker IS NULL OR p_ticker !~ '^[A-Z][A-Z0-9.-]{0,14}$'
   OR p_stream NOT IN ('research_watch','committee_watch')
   OR p_action NOT IN ('upsert_watch','resolve_research','resolve_quantitative','supersede_committee')
   OR (p_stream='research_watch' AND p_action NOT IN ('upsert_watch','resolve_research','resolve_quantitative'))
   OR (p_stream='committee_watch' AND p_action<>'supersede_committee')
   OR (p_action IN ('resolve_quantitative','supersede_committee') AND p_source_row_id IS NULL)
 THEN RAISE EXCEPTION 'Invalid AG watch operation'; END IF;
 IF p_action='upsert_watch' AND (
   p_resolution IS NOT NULL OR p_confidence IS NULL OR p_confidence<0 OR p_confidence>1
   OR p_thesis IS NULL OR length(trim(p_thesis))=0
   OR p_unresolved_questions IS NULL OR p_thesis_clock IS NULL
   OR length(trim(p_thesis_clock))=0 OR p_invalidation IS NULL
   OR p_model IS NULL OR length(trim(p_model))=0
   OR p_prompt_version IS NULL OR length(trim(p_prompt_version))=0
   OR p_prior_watch_reassessed IS DISTINCT FROM (p_source_row_id IS NOT NULL)
 ) THEN RAISE EXCEPTION 'Invalid AG watch upsert payload'; END IF;
 IF p_action='resolve_research' AND (
   p_resolution NOT IN ('PROCEED','STOP')
   OR p_prior_watch_reassessed IS DISTINCT FROM (p_source_row_id IS NOT NULL)
 ) THEN RAISE EXCEPTION 'Invalid AG research resolution'; END IF;
 IF p_action IN ('resolve_quantitative','supersede_committee')
    AND (p_resolution NOT IN ('REVIEW','REJECT','INSUFFICIENT_DATA')
      OR p_prior_watch_reassessed IS DISTINCT FROM false)
 THEN RAISE EXCEPTION 'Invalid AG quantitative resolution'; END IF;
 IF p_action<>'upsert_watch' AND (
   p_company_name IS NOT NULL OR p_confidence IS NOT NULL OR p_thesis IS NOT NULL
   OR p_unresolved_questions IS NOT NULL OR p_thesis_clock IS NOT NULL
   OR p_invalidation IS NOT NULL OR p_model IS NOT NULL OR p_prompt_version IS NOT NULL
 ) THEN RAISE EXCEPTION 'Non-upsert watch payload contains unexpected fields'; END IF;

 SELECT * INTO v_cycle FROM public.ag_daily_cycles
 WHERE id=p_cycle_id AND user_id=auth.uid() AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AG cycle unavailable'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.portfolios p JOIN public.portfolio_strategy_eras e ON e.portfolio_id=p.id
  WHERE p.id=v_cycle.portfolio_id AND p.user_id=auth.uid()
   AND p.type='paper_active' AND p.is_real_money=false
   AND e.id=v_cycle.strategy_era_id AND e.strategy_key='accelerated_growth'
   AND e.execution_mode='paper' AND e.ended_at IS NULL
 ) THEN RAISE EXCEPTION 'Active paper AG portfolio and era required'; END IF;
 SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
 WHERE cycle_id=p_cycle_id AND stage='persistence' FOR UPDATE;
 IF NOT FOUND OR v_checkpoint.status<>'running'
   OR v_checkpoint.user_id IS DISTINCT FROM v_cycle.user_id
   OR v_checkpoint.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
   OR v_checkpoint.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
   OR v_checkpoint.claim_token IS DISTINCT FROM p_claim_token
   OR v_checkpoint.lease_expires_at IS NULL OR v_checkpoint.lease_expires_at<=now()
 THEN RAISE EXCEPTION 'Valid persistence stage claim required'; END IF;

 -- Require the exact operation identity to have been frozen upstream. This is
 -- a membership fence only; full watch payload provenance still needs a
 -- dedicated verifier before release.
 IF NOT EXISTS (
  SELECT 1 FROM public.ag_cycle_stage_checkpoints c,
       LATERAL jsonb_array_elements(c.output->'watchlist_intents') AS intent(entry)
  WHERE c.cycle_id=p_cycle_id AND c.stage='catalyst_deep_research'
   AND c.status='completed' AND c.user_id=v_cycle.user_id
   AND c.portfolio_id=v_cycle.portfolio_id AND c.strategy_era_id=v_cycle.strategy_era_id
   AND jsonb_typeof(c.output->'watchlist_intents')='array'
   AND entry->>'stream'=p_stream AND entry->>'symbol'=p_ticker AND entry->>'action'=p_action
   AND ((p_source_row_id IS NULL AND entry->'source_row_id'='null'::jsonb)
     OR entry->>'source_row_id'=p_source_row_id::text)
   AND (
    (p_action='upsert_watch'
      AND jsonb_typeof(entry->'outcome')='object'
      AND entry->'outcome'->>'symbol'=p_ticker
      AND entry->'outcome'->>'researchStatus'='WATCH'
      AND entry->'outcome'->'companyName' IS NOT DISTINCT FROM
          COALESCE(to_jsonb(p_company_name),'null'::jsonb)
      AND entry->'outcome'->'confidence' IS NOT DISTINCT FROM to_jsonb(p_confidence)
      AND entry->'outcome'->'thesis' IS NOT DISTINCT FROM to_jsonb(p_thesis)
      AND entry->'outcome'->'unresolvedQuestions' IS NOT DISTINCT FROM to_jsonb(p_unresolved_questions)
      AND entry->'outcome'->'thesisClock' IS NOT DISTINCT FROM to_jsonb(p_thesis_clock)
      AND entry->'outcome'->'invalidation' IS NOT DISTINCT FROM to_jsonb(p_invalidation)
      AND entry->'outcome'->'model' IS NOT DISTINCT FROM to_jsonb(p_model)
      AND entry->'outcome'->'promptVersion' IS NOT DISTINCT FROM to_jsonb(p_prompt_version)
      AND entry->'outcome'->'priorWatchReassessed' IS NOT DISTINCT FROM
          to_jsonb(p_prior_watch_reassessed)
      AND entry->'outcome'->'priorWatchRowId' IS NOT DISTINCT FROM
          COALESCE(to_jsonb(p_source_row_id::text),'null'::jsonb))
    OR
    (p_action<>'upsert_watch' AND entry->>'resolution'=p_resolution)
   )
 ) THEN RAISE EXCEPTION 'Watch operation or frozen payload absent from completed research manifest'; END IF;

 v_payload_hash:=encode(extensions.digest(convert_to(jsonb_build_array(
  p_cycle_id,p_stream,p_ticker,p_action,p_source_row_id,p_resolution,
  p_company_name,p_confidence,p_thesis,p_unresolved_questions,p_thesis_clock,
  p_invalidation,p_model,p_prompt_version,p_prior_watch_reassessed)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO public.ag_cycle_watch_writes(
  cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
  source_row_id,payload_hash
 ) VALUES (
  p_cycle_id,auth.uid(),v_cycle.portfolio_id,v_cycle.strategy_era_id,p_stream,
  p_ticker,p_action,p_source_row_id,v_payload_hash
 ) ON CONFLICT (cycle_id,stream,ticker) DO NOTHING;
 SELECT * INTO v_ledger FROM public.ag_cycle_watch_writes
 WHERE cycle_id=p_cycle_id AND stream=p_stream AND ticker=p_ticker FOR UPDATE;
 IF v_ledger.user_id IS DISTINCT FROM v_cycle.user_id
   OR v_ledger.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
   OR v_ledger.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
   OR v_ledger.action IS DISTINCT FROM p_action
   OR v_ledger.source_row_id IS DISTINCT FROM p_source_row_id
   OR v_ledger.payload_hash IS DISTINCT FROM v_payload_hash
 THEN RAISE EXCEPTION 'Conflicting payload for AG watch operation'; END IF;
 IF v_ledger.status='committed' THEN RETURN v_ledger.id; END IF;
 IF v_ledger.status<>'pending' THEN RAISE EXCEPTION 'AG watch operation requires manual reconciliation'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(
  v_cycle.portfolio_id::text||':'||p_stream||':'||p_ticker,0));
 IF EXISTS (
  SELECT 1 FROM public.ag_cycle_watch_writes newer
  JOIN public.ag_daily_cycles d ON d.id=newer.cycle_id
  WHERE newer.portfolio_id=v_cycle.portfolio_id
   AND newer.strategy_era_id=v_cycle.strategy_era_id
   AND newer.stream=p_stream AND newer.ticker=p_ticker
   AND newer.status='committed' AND newer.cycle_id<>p_cycle_id
   AND d.cycle_date>v_cycle.cycle_date
 ) THEN RAISE EXCEPTION 'Newer AG cycle already committed this watch operation'; END IF;

 IF p_stream='research_watch' THEN
  IF p_source_row_id IS NOT NULL THEN
   SELECT * INTO v_watch FROM public.ag_research_watchlist
   WHERE id=p_source_row_id AND user_id=auth.uid()
    AND portfolio_id=v_cycle.portfolio_id AND strategy_era_id=v_cycle.strategy_era_id
    AND ticker=p_ticker FOR UPDATE;
   IF NOT FOUND OR v_watch.resolved_at IS NOT NULL
   THEN RAISE EXCEPTION 'Frozen research watch source row unavailable'; END IF;
  ELSIF EXISTS (
   SELECT 1 FROM public.ag_research_watchlist
   WHERE user_id=auth.uid() AND portfolio_id=v_cycle.portfolio_id
    AND strategy_era_id=v_cycle.strategy_era_id AND ticker=p_ticker
    AND resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'Open research watch exists but frozen source identity is absent'; END IF;

  IF p_action='upsert_watch' THEN
   IF p_source_row_id IS NULL THEN
    INSERT INTO public.ag_research_watchlist(
     user_id,portfolio_id,strategy_era_id,ticker,company_name,research_status,
     confidence,thesis,unresolved_questions,thesis_clock,invalidation,model,
     prompt_version,first_seen_at,last_seen_at,created_at,updated_at
    ) VALUES (
     auth.uid(),v_cycle.portfolio_id,v_cycle.strategy_era_id,p_ticker,p_company_name,
     'WATCH',p_confidence,p_thesis,p_unresolved_questions,p_thesis_clock,
     p_invalidation,p_model,p_prompt_version,v_now,v_now,v_now,v_now
    ) RETURNING id INTO v_affected;
   ELSE
    UPDATE public.ag_research_watchlist SET
     company_name=COALESCE(p_company_name,company_name),research_status='WATCH',
     confidence=p_confidence,thesis=p_thesis,
     unresolved_questions=p_unresolved_questions,thesis_clock=p_thesis_clock,
     invalidation=p_invalidation,model=p_model,prompt_version=p_prompt_version,
     last_seen_at=v_now,updated_at=v_now
    WHERE id=p_source_row_id RETURNING id INTO v_affected;
   END IF;
   v_effect:='applied';
  ELSIF p_source_row_id IS NULL THEN
   -- New PROCEED/STOP candidates had no prior research-watch row in the legacy
   -- flow. Record that intentional no-op durably.
   v_effect:='noop'; v_affected:=NULL;
  ELSE
   UPDATE public.ag_research_watchlist SET resolved_at=v_now,
    resolution=CASE WHEN p_action='resolve_quantitative'
      THEN 'QUANTITATIVE_'||p_resolution ELSE p_resolution END,
    last_seen_at=v_now,updated_at=v_now
   WHERE id=p_source_row_id RETURNING id INTO v_affected;
   IF v_affected IS NULL THEN RAISE EXCEPTION 'Frozen research watch update failed'; END IF;
   v_effect:='applied';
  END IF;
 ELSE
  SELECT * INTO v_decision FROM public.investment_decisions
  WHERE id=p_source_row_id AND user_id=auth.uid()
   AND portfolio_id=v_cycle.portfolio_id AND ticker=p_ticker
   AND source='ai_committee' AND decision_type='watch' AND status='active'
   AND created_at >= (SELECT inception_at FROM public.portfolio_strategy_eras
                      WHERE id=v_cycle.strategy_era_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Frozen Committee WATCH source row unavailable'; END IF;
  UPDATE public.investment_decisions SET status='superseded'
  WHERE id=p_source_row_id AND status='active' RETURNING id INTO v_affected;
  IF v_affected IS NULL THEN RAISE EXCEPTION 'Frozen Committee WATCH supersession failed'; END IF;
  v_effect:='applied';
 END IF;

 UPDATE public.ag_cycle_watch_writes SET status='committed',effect=v_effect,
  affected_row_id=v_affected,committed_at=v_now WHERE id=v_ledger.id;
 RETURN v_ledger.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_commit_watch_operation(
 uuid,uuid,text,text,text,uuid,text,text,numeric,text,text[],text,text[],text,text,boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_commit_watch_operation(
 uuid,uuid,text,text,text,uuid,text,text,numeric,text,text[],text,text[],text,text,boolean
) TO authenticated;


-- Read-only timeout reconciliation. This function never claims a stage and
-- never mutates or replays an operation. It recomputes the server-side digest,
-- verifies the committed ledger row, rejects evidence superseded by a newer
-- cycle, and checks the actual target-row postcondition.
CREATE OR REPLACE FUNCTION public.ag_verify_watch_operation_postcondition(
 p_cycle_id uuid,p_stream text,p_ticker text,p_action text,
 p_source_row_id uuid,p_resolution text,p_company_name text,p_confidence numeric,
 p_thesis text,p_unresolved_questions text[],p_thesis_clock text,
 p_invalidation text[],p_model text,p_prompt_version text,
 p_prior_watch_reassessed boolean
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_cycle public.ag_daily_cycles%ROWTYPE;
 v_ledger public.ag_cycle_watch_writes%ROWTYPE;
 v_watch public.ag_research_watchlist%ROWTYPE;
 v_decision public.investment_decisions%ROWTYPE;
 v_payload_hash text;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_cycle FROM public.ag_daily_cycles
 WHERE id=p_cycle_id AND user_id=auth.uid();
 IF NOT FOUND THEN RETURN false; END IF;

 v_payload_hash:=encode(extensions.digest(convert_to(jsonb_build_array(
  p_cycle_id,p_stream,p_ticker,p_action,p_source_row_id,p_resolution,
  p_company_name,p_confidence,p_thesis,p_unresolved_questions,p_thesis_clock,
  p_invalidation,p_model,p_prompt_version,p_prior_watch_reassessed)::text,'UTF8'),'sha256'),'hex');

 SELECT * INTO v_ledger FROM public.ag_cycle_watch_writes
 WHERE cycle_id=p_cycle_id AND user_id=auth.uid()
  AND portfolio_id=v_cycle.portfolio_id
  AND strategy_era_id=v_cycle.strategy_era_id
  AND stream=p_stream AND ticker=p_ticker;
 IF NOT FOUND OR v_ledger.status<>'committed'
   OR v_ledger.action IS DISTINCT FROM p_action
   OR v_ledger.source_row_id IS DISTINCT FROM p_source_row_id
   OR v_ledger.payload_hash IS DISTINCT FROM v_payload_hash
   OR v_ledger.committed_at IS NULL
 THEN RETURN false; END IF;

 -- Once a newer cycle has committed the same stream/ticker, an old operation's
 -- mutable target may no longer equal its historical postcondition. Do not use
 -- stale evidence to authorize recovery.
 IF EXISTS (
  SELECT 1 FROM public.ag_cycle_watch_writes newer
  JOIN public.ag_daily_cycles d ON d.id=newer.cycle_id
  WHERE newer.portfolio_id=v_cycle.portfolio_id
   AND newer.strategy_era_id=v_cycle.strategy_era_id
   AND newer.stream=p_stream AND newer.ticker=p_ticker
   AND newer.status='committed' AND newer.cycle_id<>p_cycle_id
   AND d.cycle_date>v_cycle.cycle_date
 ) THEN RETURN false; END IF;

 IF v_ledger.effect='noop' THEN
  IF p_stream<>'research_watch' OR p_action<>'resolve_research'
    OR p_source_row_id IS NOT NULL OR v_ledger.affected_row_id IS NOT NULL
  THEN RETURN false; END IF;
  -- A row created after this commit does not disprove the historical no-op.
  RETURN NOT EXISTS (
   SELECT 1 FROM public.ag_research_watchlist w
   WHERE w.user_id=auth.uid() AND w.portfolio_id=v_cycle.portfolio_id
    AND w.strategy_era_id=v_cycle.strategy_era_id AND w.ticker=p_ticker
    AND w.resolved_at IS NULL AND w.created_at<=v_ledger.committed_at
  );
 END IF;
 IF v_ledger.effect<>'applied' OR v_ledger.affected_row_id IS NULL
 THEN RETURN false; END IF;

 IF p_stream='research_watch' THEN
  SELECT * INTO v_watch FROM public.ag_research_watchlist
  WHERE id=v_ledger.affected_row_id AND user_id=auth.uid()
   AND portfolio_id=v_cycle.portfolio_id
   AND strategy_era_id=v_cycle.strategy_era_id AND ticker=p_ticker;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_action='upsert_watch' THEN
   RETURN v_watch.research_status='WATCH'
    AND v_watch.resolved_at IS NULL AND v_watch.resolution IS NULL
    AND v_watch.confidence IS NOT DISTINCT FROM p_confidence
    AND v_watch.thesis IS NOT DISTINCT FROM p_thesis
    AND v_watch.unresolved_questions IS NOT DISTINCT FROM p_unresolved_questions
    AND v_watch.thesis_clock IS NOT DISTINCT FROM p_thesis_clock
    AND v_watch.invalidation IS NOT DISTINCT FROM p_invalidation
    AND v_watch.model IS NOT DISTINCT FROM p_model
    AND v_watch.prompt_version IS NOT DISTINCT FROM p_prompt_version
    AND (p_company_name IS NULL OR v_watch.company_name IS NOT DISTINCT FROM p_company_name)
    AND v_watch.last_seen_at IS NOT DISTINCT FROM v_ledger.committed_at
    AND v_watch.updated_at IS NOT DISTINCT FROM v_ledger.committed_at
    AND (p_source_row_id IS NULL OR v_watch.id=p_source_row_id);
  END IF;
  IF p_action IN ('resolve_research','resolve_quantitative') THEN
   RETURN v_watch.id IS NOT DISTINCT FROM p_source_row_id
    AND v_watch.resolved_at IS NOT DISTINCT FROM v_ledger.committed_at
    AND v_watch.updated_at IS NOT DISTINCT FROM v_ledger.committed_at
    AND v_watch.resolution IS NOT DISTINCT FROM
      (CASE WHEN p_action='resolve_quantitative'
        THEN 'QUANTITATIVE_'||p_resolution ELSE p_resolution END);
  END IF;
  RETURN false;
 END IF;

 IF p_stream='committee_watch' AND p_action='supersede_committee' THEN
  SELECT * INTO v_decision FROM public.investment_decisions
  WHERE id=v_ledger.affected_row_id AND user_id=auth.uid()
   AND portfolio_id=v_cycle.portfolio_id AND ticker=p_ticker;
  RETURN FOUND
   AND v_decision.id IS NOT DISTINCT FROM p_source_row_id
   AND v_decision.source='ai_committee'
   AND v_decision.decision_type='watch'
   AND v_decision.status='superseded'
   AND v_decision.created_at >= (
    SELECT inception_at FROM public.portfolio_strategy_eras
    WHERE id=v_cycle.strategy_era_id
   );
 END IF;
 RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_verify_watch_operation_postcondition(
 uuid,text,text,text,uuid,text,text,numeric,text,text[],text,text[],text,text,boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_verify_watch_operation_postcondition(
 uuid,text,text,text,uuid,text,text,numeric,text,text[],text,text[],text,text,boolean
) TO authenticated;


-- Aggregate persistence-stage verifier. Reads only the completed frozen
-- deep-research manifest and committed watch ledger; it never replays writes.
CREATE OR REPLACE FUNCTION public.ag_verify_cycle_watch_manifest(p_cycle_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $agwatchmanifest$
DECLARE v_manifest jsonb; v_item jsonb; v_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT c.output->'watchlist_intents' INTO v_manifest
 FROM public.ag_cycle_stage_checkpoints c
 JOIN public.ag_daily_cycles d ON d.id=c.cycle_id
 WHERE c.cycle_id=p_cycle_id AND c.stage='catalyst_deep_research'
   AND c.status='completed' AND c.user_id=auth.uid() AND d.user_id=auth.uid();
 IF jsonb_typeof(v_manifest) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 SELECT count(*) INTO v_count FROM public.ag_cycle_watch_writes
 WHERE cycle_id=p_cycle_id;
 IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_manifest)
 LOOP
  IF NOT public.ag_verify_watch_operation_postcondition(
   p_cycle_id,v_item->>'stream',v_item->>'symbol',v_item->>'action',
   CASE WHEN jsonb_typeof(v_item->'source_row_id')='string'
     THEN (v_item->>'source_row_id')::uuid ELSE NULL END,
   v_item->>'resolution',v_item->'outcome'->>'companyName',
   CASE WHEN jsonb_typeof(v_item->'outcome'->'confidence')='number'
     THEN (v_item->'outcome'->>'confidence')::numeric ELSE NULL END,
   v_item->'outcome'->>'thesis',
   CASE WHEN jsonb_typeof(v_item->'outcome'->'unresolvedQuestions')='array'
     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'outcome'->'unresolvedQuestions')) ELSE NULL END,
   v_item->'outcome'->>'thesisClock',
   CASE WHEN jsonb_typeof(v_item->'outcome'->'invalidation')='array'
     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'outcome'->'invalidation')) ELSE NULL END,
   v_item->'outcome'->>'model',v_item->'outcome'->>'promptVersion',
   CASE WHEN jsonb_typeof(v_item->'outcome'->'priorWatchReassessed')='boolean'
     THEN (v_item->'outcome'->>'priorWatchReassessed')::boolean
     ELSE false END
  ) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$agwatchmanifest$;
REVOKE ALL ON FUNCTION public.ag_verify_cycle_watch_manifest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_verify_cycle_watch_manifest(uuid) TO authenticated;


-- SOURCE: docs/ag-atomic-decision-rpc-draft.sql

-- DRAFT ONLY. DO NOT APPLY WITHOUT LIVE-SCHEMA AND SECURITY REVIEW.
-- Requires docs/ag-resumable-cycle-checkpoint-design.md checkpoint schema,
-- docs/ag-stage-claim-rpc-proposal.sql and
-- docs/ag-cycle-decision-ledger-proposal.sql first.
-- One invocation is one PostgreSQL transaction: any exception rolls back
-- supersession, insertion and ledger update together.

CREATE OR REPLACE FUNCTION public.ag_commit_cycle_decision(
  p_cycle_id uuid,
  p_claim_token uuid,
  p_ticker text,
  p_kind text,
  p_decision_type text,
  p_thesis text,
  p_confidence numeric,
  p_thesis_clock text,
  p_bull_case text,
  p_bear_case text,
  p_monitoring text,
  p_invalidation text,
  p_notes text,
  p_ag_thesis_valid boolean DEFAULT NULL,
  p_ag_liquidity_eligible boolean DEFAULT NULL,
  p_ag_evidence_version text DEFAULT NULL,
  p_ag_theme_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cycle public.ag_daily_cycles%ROWTYPE;
  v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
  v_ledger public.ag_cycle_decision_writes%ROWTYPE;
  v_existing public.investment_decisions%ROWTYPE;
  v_existing_count integer;
  v_decision_id uuid;
  v_payload_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  -- Compute retry identity exclusively from validated RPC arguments inside
  -- PostgreSQL. The caller cannot spoof a digest or disagree on JSON encoding.
  -- Exact argument values (including optional NULLs) are immutable per key.
  v_payload_hash := encode(extensions.digest(
    convert_to(jsonb_build_array(p_cycle_id,p_ticker,p_kind,p_decision_type,
      p_thesis,p_confidence,p_thesis_clock,p_bull_case,p_bear_case,
      p_monitoring,p_invalidation,p_notes,p_ag_thesis_valid,
      p_ag_liquidity_eligible,p_ag_evidence_version,p_ag_theme_key)::text,'UTF8'),
    'sha256'),'hex');
  IF p_ticker IS NULL OR p_ticker !~ '^[A-Z][A-Z0-9.-]{0,14}$'
     OR p_kind IS NULL OR p_kind NOT IN ('holding_review','committee')
     OR p_decision_type IS NULL OR p_decision_type NOT IN ('buy','hold','sell','watch','avoid')
     OR p_thesis IS NULL OR length(trim(p_thesis)) = 0
     OR p_thesis_clock IS NULL OR length(trim(p_thesis_clock)) = 0
     OR p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 100
  THEN RAISE EXCEPTION 'Invalid AG decision input'; END IF;
  IF (p_kind = 'holding_review' AND p_decision_type NOT IN ('hold','sell'))
     OR (p_kind = 'committee' AND p_decision_type NOT IN ('buy','watch','avoid'))
  THEN RAISE EXCEPTION 'Decision type incompatible with AG decision kind'; END IF;

  SELECT * INTO v_cycle FROM public.ag_daily_cycles
  WHERE id = p_cycle_id AND user_id = auth.uid() AND status = 'running'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AG cycle unavailable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios p
    JOIN public.portfolio_strategy_eras e ON e.portfolio_id = p.id
    WHERE p.id = v_cycle.portfolio_id AND p.user_id = auth.uid()
      AND p.type = 'paper_active' AND p.is_real_money = false
      AND e.id = v_cycle.strategy_era_id
      AND e.strategy_key = 'accelerated_growth'
      AND e.execution_mode = 'paper' AND e.ended_at IS NULL
  ) THEN RAISE EXCEPTION 'Active paper AG portfolio and era required'; END IF;

  SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
  WHERE cycle_id = p_cycle_id AND stage = 'persistence'
  FOR UPDATE;
  IF NOT FOUND OR v_checkpoint.status <> 'running'
     OR v_checkpoint.user_id IS DISTINCT FROM v_cycle.user_id
     OR v_checkpoint.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
     OR v_checkpoint.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
     OR v_checkpoint.claim_token IS DISTINCT FROM p_claim_token
     OR v_checkpoint.lease_expires_at IS NULL
     OR v_checkpoint.lease_expires_at <= now()
  THEN RAISE EXCEPTION 'Valid persistence stage claim required'; END IF;

  -- Fail closed before any ledger or decision write if Committee intent
  -- does not contain this ticker. A ticker list is not payload proof.
  IF p_kind = 'committee' AND NOT EXISTS (
    SELECT 1 FROM public.ag_cycle_stage_checkpoints committee
    WHERE committee.cycle_id=p_cycle_id AND committee.stage='committee'
      AND committee.status='completed'
      AND committee.user_id=v_cycle.user_id
      AND committee.portfolio_id=v_cycle.portfolio_id
      AND committee.strategy_era_id=v_cycle.strategy_era_id
      AND jsonb_typeof(committee.output->'persistence_tickers')='array'
      AND (committee.output->'persistence_tickers') ? p_ticker
  ) THEN
    RAISE EXCEPTION 'Committee ticker absent from completed persistence manifest';
  END IF;

  -- Holding reviews require independently completed holding-stage intent too.
  -- This is a ticker membership fence, not yet full payload provenance.
  IF p_kind = 'holding_review' AND NOT EXISTS (
    SELECT 1 FROM public.ag_cycle_stage_checkpoints holding
    WHERE holding.cycle_id=p_cycle_id AND holding.stage='holding_review'
      AND holding.status='completed'
      AND holding.user_id=v_cycle.user_id
      AND holding.portfolio_id=v_cycle.portfolio_id
      AND holding.strategy_era_id=v_cycle.strategy_era_id
      AND jsonb_typeof(holding.output->'persistence_tickers')='array'
      AND (holding.output->'persistence_tickers') ? p_ticker
  ) THEN
    RAISE EXCEPTION 'Holding ticker absent from completed persistence manifest';
  END IF;

  INSERT INTO public.ag_cycle_decision_writes
    (cycle_id,user_id,portfolio_id,strategy_era_id,ticker,decision_kind,payload_hash)
  VALUES
    (p_cycle_id,auth.uid(),v_cycle.portfolio_id,v_cycle.strategy_era_id,
     p_ticker,p_kind,v_payload_hash)
  ON CONFLICT (cycle_id,ticker) DO NOTHING;
  SELECT * INTO v_ledger FROM public.ag_cycle_decision_writes
  WHERE cycle_id = p_cycle_id AND ticker = p_ticker FOR UPDATE;
  IF v_ledger.user_id IS DISTINCT FROM v_cycle.user_id
     OR v_ledger.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
     OR v_ledger.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
     OR v_ledger.payload_hash IS DISTINCT FROM v_payload_hash
     OR v_ledger.decision_kind IS DISTINCT FROM p_kind
  THEN RAISE EXCEPTION 'Conflicting payload for AG cycle ticker'; END IF;
  IF v_ledger.status = 'committed' THEN
    IF v_ledger.investment_decision_id IS NULL THEN
      RAISE EXCEPTION 'Committed AG ledger missing decision ID; manual reconciliation required';
    END IF;
    RETURN v_ledger.investment_decision_id;
  END IF;
  IF v_ledger.status <> 'pending' THEN
    RAISE EXCEPTION 'AG decision requires manual reconciliation';
  END IF;

  -- Serialize writes across different cycles targeting the same portfolio
  -- and ticker, not merely concurrent writes within one cycle.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cycle.portfolio_id::text || ':' || p_ticker, 0));

  -- Fencing: a later cycle that has already committed this ticker wins.
  -- Locking alone cannot prevent an older delayed cycle from overwriting it.
  IF EXISTS (
    SELECT 1 FROM public.ag_cycle_decision_writes newer
    JOIN public.ag_daily_cycles newer_cycle ON newer_cycle.id = newer.cycle_id
    WHERE newer.portfolio_id = v_cycle.portfolio_id
      AND newer.strategy_era_id = v_cycle.strategy_era_id
      AND newer.ticker = p_ticker AND newer.status = 'committed'
      AND newer.cycle_id <> p_cycle_id
      AND newer_cycle.cycle_date > v_cycle.cycle_date
  ) THEN
    RAISE EXCEPTION 'Newer AG cycle already committed this ticker; manual reconciliation required';
  END IF;

  -- The live schema has a unique partial index allowing only one active
  -- ai_committee decision per user/portfolio/ticker across all eras. Never
  -- discover a pre-era conflict only at INSERT, and never silently supersede
  -- a decision outside this cycle's strategy era.
  IF EXISTS (
    SELECT 1 FROM public.investment_decisions
    WHERE user_id = v_cycle.user_id
      AND portfolio_id = v_cycle.portfolio_id AND ticker = p_ticker
      AND source = 'ai_committee' AND status = 'active'
      AND created_at < (
        SELECT inception_at FROM public.portfolio_strategy_eras
        WHERE id = v_cycle.strategy_era_id
      )
  ) THEN
    RAISE EXCEPTION 'Pre-era active AI decision requires manual reconciliation';
  END IF;

  SELECT count(*) INTO v_existing_count FROM public.investment_decisions
  WHERE user_id = v_cycle.user_id
    AND portfolio_id = v_cycle.portfolio_id AND ticker = p_ticker
    AND source = 'ai_committee' AND status = 'active'
    AND created_at >= (
      SELECT inception_at FROM public.portfolio_strategy_eras
      WHERE id = v_cycle.strategy_era_id
    );
  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'Multiple active AG decisions require reconciliation';
  END IF;
  SELECT * INTO v_existing FROM public.investment_decisions
  WHERE portfolio_id = v_cycle.portfolio_id AND ticker = p_ticker
    AND source = 'ai_committee' AND status = 'active'
    AND created_at >= (
      SELECT inception_at FROM public.portfolio_strategy_eras
      WHERE id = v_cycle.strategy_era_id
    ) FOR UPDATE;

  -- A new cycle always records a fresh immutable decision snapshot.
  -- Reusing a same-type row while hashing new arguments would claim that
  -- old content represents the new payload. Same-cycle retries are already
  -- idempotent via the committed ledger above.
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.investment_decisions SET status = 'superseded'
    WHERE id = v_existing.id AND status = 'active';
  END IF;
  INSERT INTO public.investment_decisions (
    user_id,portfolio_id,transaction_id,ticker,decision_type,decision_date,
    source,status,thesis,confidence_score,expected_holding_period,
    bull_case,bear_case,primary_risks,reassessment_conditions,exit_conditions,
    recommended_quantity,recommended_allocation,notes,
    ag_thesis_valid,ag_liquidity_eligible,ag_evidence_version,ag_theme_key
  ) VALUES (
    auth.uid(),v_cycle.portfolio_id,NULL,p_ticker,p_decision_type,now(),
    'ai_committee','active',p_thesis,p_confidence,p_thesis_clock,
    p_bull_case,p_bear_case,p_bear_case,p_monitoring,p_invalidation,
    NULL,NULL,p_notes,
    CASE WHEN p_kind = 'committee' THEN p_ag_thesis_valid ELSE NULL END,
    CASE WHEN p_kind = 'committee' THEN p_ag_liquidity_eligible ELSE NULL END,
    CASE WHEN p_kind = 'committee' THEN p_ag_evidence_version ELSE NULL END,
    CASE WHEN p_kind = 'committee' THEN p_ag_theme_key ELSE NULL END
  ) RETURNING id INTO v_decision_id;

  UPDATE public.ag_cycle_decision_writes
  SET status = 'committed',investment_decision_id = v_decision_id,committed_at = now()
  WHERE id = v_ledger.id;
  RETURN v_decision_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ag_commit_cycle_decision(
  uuid,uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,text,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_commit_cycle_decision(
  uuid,uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,text,text
) TO authenticated;

-- Committee and holding ticker-membership gates are implemented, but the manifests
-- must still be independently derived from complete upstream intent and
-- verified against full payloads. Holding-review intent needs its own
-- immutable manifest and combined batch coverage before activation.
-- BLOCKERS BEFORE APPROVAL:
-- * Live audit confirmed pgcrypto is installed in extensions; use extensions.digest().
-- * Hashes are computed server-side; test digest availability and deterministic
--   serialization using an isolated PostgreSQL instance.
-- * CRITICAL SCHEMA DRIFT: the committed create_investment_decisions migration
--   does NOT define investment_decisions.notes, although the current holding
--   pipeline and this draft INSERT use it. Inspect the isolated/live catalog
--   read-only; locate any later/manual ALTER before testing or approving.
--   Live audit confirmed notes is absent. See ag-decision-provenance-schema-proposal.sql;\n--   do not silently drop holding-review provenance.
-- * Confirm actual decision_type enum/constraints and confidence scale.
-- * Verify committee ag_* field semantics and lifecycle parity against live
--   schema and tests, including new-cycle same-type replacement and same-cycle retry reuse.
-- * Verify stage lease behavior on long-running writes and timeout-after-commit.
-- * Same-day competing cycles need explicit reconciliation/fencing; never
--   infer chronological order from random UUIDs.
-- * Validate advisory lock key collision risk and lock ordering with other
--   portfolio writers; consider a dedicated per-portfolio lock table.
-- * Add tests for conflicting payload, duplicate concurrent call, rollback
--   on failed INSERT, expired claim, and cross-user/real-money access.
-- * Do not enable the API or apply this proposal until those are resolved.


-- SOURCE: docs/ag-committee-payload-verification-proposal.sql

-- PROPOSAL ONLY. Read-only, server-side comparison of a frozen Committee
-- payload manifest against committed per-ticker ledger digests.
-- WIRED TO DRAFT COMPLETION; NOT WIRED TO THE ACTIVE RUNNER. A matching digest does not
-- prove the upstream Committee produced the manifest; independent upstream
-- capture/validation remains a release blocker.
--
-- Completed Committee output additionally needs decision_payloads:
-- [{"ticker":"XYZ","args":[cycle_uuid,ticker,kind,decision_type,thesis,
-- confidence,thesis_clock,bull_case,bear_case,monitoring,invalidation,
-- notes,ag_thesis_valid,ag_liquidity_eligible,ag_evidence_version,
-- ag_theme_key]}].
-- args MUST equal PostgreSQL jsonb_build_array of the typed RPC arguments
-- in precisely the order used by ag_commit_cycle_decision. The database,
-- not the client, calculates the digest from this stored canonical array.
CREATE OR REPLACE FUNCTION public.ag_verify_committee_payload_manifest(
  p_cycle_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cycle public.ag_daily_cycles%ROWTYPE;
  v_manifest jsonb;
  v_tickers jsonb;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_cycle FROM public.ag_daily_cycles
  WHERE id=p_cycle_id AND user_id=auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios p
    JOIN public.portfolio_strategy_eras e ON e.portfolio_id=p.id
    WHERE p.id=v_cycle.portfolio_id AND p.user_id=auth.uid()
      AND p.type='paper_active' AND p.is_real_money=false
      AND e.id=v_cycle.strategy_era_id AND e.ended_at IS NULL
      AND e.strategy_key='accelerated_growth' AND e.execution_mode='paper'
  ) THEN RETURN false; END IF;
  SELECT c.output->'decision_payloads',c.output->'persistence_tickers'
  INTO v_manifest,v_tickers FROM public.ag_cycle_stage_checkpoints c
  WHERE c.cycle_id=p_cycle_id AND c.stage='committee' AND c.status='completed'
    AND c.user_id=v_cycle.user_id AND c.portfolio_id=v_cycle.portfolio_id
    AND c.strategy_era_id=v_cycle.strategy_era_id;
  IF jsonb_typeof(v_manifest) IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_tickers) IS DISTINCT FROM 'array'
  THEN RETURN false; END IF;
  IF jsonb_array_length(v_manifest)<>jsonb_array_length(v_tickers)
  THEN RETURN false; END IF;
  -- Reject malformed, duplicate, missing or out-of-scope entries. A
  -- manifest cannot silently omit a ledger row or duplicate one ticker.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) AS m(entry)
    WHERE jsonb_typeof(m.entry) IS DISTINCT FROM 'object'
       OR jsonb_typeof(m.entry->'ticker') IS DISTINCT FROM 'string'
       OR (m.entry->>'ticker') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
       OR jsonb_typeof(m.entry->'args') IS DISTINCT FROM 'array'
       OR jsonb_array_length(CASE WHEN jsonb_typeof(m.entry->'args')='array'
          THEN m.entry->'args' ELSE '[]'::jsonb END)<>16
       OR NOT (v_tickers ? (m.entry->>'ticker'))
       OR (m.entry->'args'->>0) IS DISTINCT FROM p_cycle_id::text
       OR (m.entry->'args'->>1) IS DISTINCT FROM (m.entry->>'ticker')
       OR (m.entry->'args'->>2) IS DISTINCT FROM 'committee'
  ) THEN RETURN false; END IF;
  SELECT count(DISTINCT m.entry->>'ticker') INTO v_count
  FROM jsonb_array_elements(v_manifest) AS m(entry);
  IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM public.ag_cycle_decision_writes
  WHERE cycle_id=p_cycle_id AND decision_kind='committee';
  IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) AS m(entry)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ag_cycle_decision_writes w
      JOIN public.investment_decisions d ON d.id=w.investment_decision_id
      WHERE w.cycle_id=p_cycle_id AND w.ticker=m.entry->>'ticker'
        AND w.user_id=v_cycle.user_id
        AND w.portfolio_id=v_cycle.portfolio_id
        AND w.strategy_era_id=v_cycle.strategy_era_id
        AND w.decision_kind='committee' AND w.status='committed'
        AND w.payload_hash=encode(extensions.digest(
          convert_to((m.entry->'args')::text,'UTF8'),'sha256'),'hex')
        AND d.user_id=w.user_id AND d.portfolio_id=w.portfolio_id
        AND d.ticker=w.ticker AND d.status='active'
        AND d.source='ai_committee'
        -- A matching ledger hash is insufficient if the linked decision
        -- row has subsequently diverged from the frozen Committee payload.
        AND d.decision_type IS NOT DISTINCT FROM (m.entry->'args'->>3)
        AND d.thesis IS NOT DISTINCT FROM (m.entry->'args'->>4)
        AND d.confidence_score IS NOT DISTINCT FROM
          ((m.entry->'args'->>5)::numeric)
        AND d.expected_holding_period IS NOT DISTINCT FROM (m.entry->'args'->>6)
        AND d.bull_case IS NOT DISTINCT FROM (m.entry->'args'->>7)
        AND d.bear_case IS NOT DISTINCT FROM (m.entry->'args'->>8)
        AND d.primary_risks IS NOT DISTINCT FROM (m.entry->'args'->>8)
        AND d.reassessment_conditions IS NOT DISTINCT FROM (m.entry->'args'->>9)
        AND d.exit_conditions IS NOT DISTINCT FROM (m.entry->'args'->>10)
        AND d.notes IS NOT DISTINCT FROM (m.entry->'args'->>11)
        AND d.ag_thesis_valid IS NOT DISTINCT FROM
          ((m.entry->'args'->>12)::boolean)
        AND d.ag_liquidity_eligible IS NOT DISTINCT FROM
          ((m.entry->'args'->>13)::boolean)
        AND d.ag_evidence_version IS NOT DISTINCT FROM (m.entry->'args'->>14)
        AND d.ag_theme_key IS NOT DISTINCT FROM (m.entry->'args'->>15)
    )
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_verify_committee_payload_manifest(uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_verify_committee_payload_manifest(uuid)
 TO authenticated;
-- RELEASE BLOCKERS: upstream Committee provenance and completeness,
-- typed argument normalization, immutable manifest capture at completion,
-- actual-schema review and combined holding-review parity.


-- SOURCE: docs/ag-holding-payload-verification-proposal.sql

-- DRAFT ONLY: holding-review counterpart to Committee payload verifier.
-- Full typed args and linked row fields must match frozen completed holding
-- intent. Empty completed holding batches are valid only with zero holding
-- ledger rows. Caller-provided checkpoint provenance remains unverified.
CREATE OR REPLACE FUNCTION public.ag_verify_holding_payload_manifest(
  p_cycle_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cycle public.ag_daily_cycles%ROWTYPE;
  v_manifest jsonb;
  v_tickers jsonb;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_cycle FROM public.ag_daily_cycles
  WHERE id=p_cycle_id AND user_id=auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios p
    JOIN public.portfolio_strategy_eras e ON e.portfolio_id=p.id
    WHERE p.id=v_cycle.portfolio_id AND p.user_id=auth.uid()
      AND p.type='paper_active' AND p.is_real_money=false
      AND e.id=v_cycle.strategy_era_id AND e.ended_at IS NULL
      AND e.strategy_key='accelerated_growth' AND e.execution_mode='paper'
  ) THEN RETURN false; END IF;
  SELECT c.output->'decision_payloads',c.output->'persistence_tickers'
  INTO v_manifest,v_tickers FROM public.ag_cycle_stage_checkpoints c
  WHERE c.cycle_id=p_cycle_id AND c.stage='holding_review' AND c.status='completed'
    AND c.user_id=v_cycle.user_id AND c.portfolio_id=v_cycle.portfolio_id
    AND c.strategy_era_id=v_cycle.strategy_era_id;
  IF jsonb_typeof(v_manifest) IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_tickers) IS DISTINCT FROM 'array'
  THEN RETURN false; END IF;
  IF jsonb_array_length(v_manifest)<>jsonb_array_length(v_tickers)
  THEN RETURN false; END IF;
  -- Reject malformed, duplicate, missing or out-of-scope entries. A
  -- manifest cannot silently omit a ledger row or duplicate one ticker.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) AS m(entry)
    WHERE jsonb_typeof(m.entry) IS DISTINCT FROM 'object'
       OR jsonb_typeof(m.entry->'ticker') IS DISTINCT FROM 'string'
       OR (m.entry->>'ticker') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
       OR jsonb_typeof(m.entry->'args') IS DISTINCT FROM 'array'
       OR jsonb_array_length(CASE WHEN jsonb_typeof(m.entry->'args')='array'
          THEN m.entry->'args' ELSE '[]'::jsonb END)<>16
       OR NOT (v_tickers ? (m.entry->>'ticker'))
       OR (m.entry->'args'->>0) IS DISTINCT FROM p_cycle_id::text
       OR (m.entry->'args'->>1) IS DISTINCT FROM (m.entry->>'ticker')
       OR (m.entry->'args'->>2) IS DISTINCT FROM 'holding_review'
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) m(entry)
    WHERE m.entry->'args'->12 IS DISTINCT FROM 'null'::jsonb
       OR m.entry->'args'->13 IS DISTINCT FROM 'null'::jsonb
       OR m.entry->'args'->14 IS DISTINCT FROM 'null'::jsonb
       OR m.entry->'args'->15 IS DISTINCT FROM 'null'::jsonb
  ) THEN RETURN false; END IF;
  SELECT count(DISTINCT m.entry->>'ticker') INTO v_count
  FROM jsonb_array_elements(v_manifest) AS m(entry);
  IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM public.ag_cycle_decision_writes
  WHERE cycle_id=p_cycle_id AND decision_kind='holding_review';
  IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) AS m(entry)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ag_cycle_decision_writes w
      JOIN public.investment_decisions d ON d.id=w.investment_decision_id
      WHERE w.cycle_id=p_cycle_id AND w.ticker=m.entry->>'ticker'
        AND w.user_id=v_cycle.user_id
        AND w.portfolio_id=v_cycle.portfolio_id
        AND w.strategy_era_id=v_cycle.strategy_era_id
        AND w.decision_kind='holding_review' AND w.status='committed'
        AND w.payload_hash=encode(extensions.digest(
          convert_to((m.entry->'args')::text,'UTF8'),'sha256'),'hex')
        AND d.user_id=w.user_id AND d.portfolio_id=w.portfolio_id
        AND d.ticker=w.ticker AND d.status='active'
        AND d.source='ai_committee'
        -- A matching ledger hash is insufficient if the linked decision
        -- row has subsequently diverged from the frozen Committee payload.
        AND d.decision_type IS NOT DISTINCT FROM (m.entry->'args'->>3)
        AND d.thesis IS NOT DISTINCT FROM (m.entry->'args'->>4)
        AND d.confidence_score IS NOT DISTINCT FROM
          ((m.entry->'args'->>5)::numeric)
        AND d.expected_holding_period IS NOT DISTINCT FROM (m.entry->'args'->>6)
        AND d.bull_case IS NOT DISTINCT FROM (m.entry->'args'->>7)
        AND d.bear_case IS NOT DISTINCT FROM (m.entry->'args'->>8)
        AND d.primary_risks IS NOT DISTINCT FROM (m.entry->'args'->>8)
        AND d.reassessment_conditions IS NOT DISTINCT FROM (m.entry->'args'->>9)
        AND d.exit_conditions IS NOT DISTINCT FROM (m.entry->'args'->>10)
        AND d.notes IS NOT DISTINCT FROM (m.entry->'args'->>11)
        AND d.ag_thesis_valid IS NULL
        AND d.ag_liquidity_eligible IS NULL
        AND d.ag_evidence_version IS NULL
        AND d.ag_theme_key IS NULL
    )
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_verify_holding_payload_manifest(uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_verify_holding_payload_manifest(uuid)
 TO authenticated;



-- SOURCE: docs/ag-persistence-completion-rpc-proposal.sql

-- PROPOSAL ONLY. Apply only after stage, ledger and decision drafts have been
-- approved and the live schema has been independently verified.
-- Persistence completion is atomic with exact combined committed-ledger
-- coverage. Caller supplies the expected union; completion verifies both
-- frozen Committee and holding payload hashes and linked decision fields
-- while holding the persistence checkpoint lock. Upstream provenance and
-- watchlist recovery is verified from the frozen deep-research manifest before completion.
-- RELEASE BLOCKER: Committee checkpoint output must be independently validated
-- and immutable after completion. Matching its manifest is necessary but not
-- sufficient to prove the Committee planned the complete decision batch.
CREATE OR REPLACE FUNCTION public.ag_complete_persistence_stage(
  p_checkpoint_id uuid, p_claim_token uuid, p_expected_tickers text[]
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
        v_count integer;
        v_manifest jsonb;
        v_holding_manifest jsonb;
        v_committee_count integer;
        v_holding_count integer;
BEGIN
 IF auth.uid() IS NULL OR p_expected_tickers IS NULL OR
    EXISTS (SELECT 1 FROM unnest(p_expected_tickers) t
            WHERE t IS NULL OR t !~ '^[A-Z][A-Z0-9.-]{0,14}$') OR
    cardinality(p_expected_tickers) <>
      (SELECT count(DISTINCT t) FROM unnest(p_expected_tickers) t)
 THEN RAISE EXCEPTION 'Valid unique expected tickers required'; END IF;

 SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
 WHERE id=p_checkpoint_id AND user_id=auth.uid() AND stage='persistence'
   AND status='running' AND claim_token=p_claim_token
   AND lease_expires_at > now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.ag_daily_cycles d
   JOIN public.portfolios p ON p.id=d.portfolio_id
   JOIN public.portfolio_strategy_eras e ON e.id=d.strategy_era_id
   WHERE d.id=v_checkpoint.cycle_id AND d.user_id=auth.uid()
     AND d.status='running' AND p.id=v_checkpoint.portfolio_id
     AND p.user_id=auth.uid() AND p.type='paper_active'
     AND p.is_real_money=false AND e.id=v_checkpoint.strategy_era_id
     AND e.portfolio_id=p.id AND e.ended_at IS NULL
     AND e.strategy_key='accelerated_growth' AND e.execution_mode='paper'
 ) THEN RETURN false; END IF;
 -- The expected union must include every completed Committee ticker.
 -- The source manifests must be validated and frozen at stage completion;
 -- membership alone is not proof that upstream output is complete.
 SELECT c.output->'persistence_tickers' INTO v_manifest
 FROM public.ag_cycle_stage_checkpoints c
 WHERE c.cycle_id=v_checkpoint.cycle_id AND c.stage='committee'
   AND c.status='completed' AND c.user_id=v_checkpoint.user_id
   AND c.portfolio_id=v_checkpoint.portfolio_id
   AND c.strategy_era_id=v_checkpoint.strategy_era_id;
 IF v_manifest IS NULL OR jsonb_typeof(v_manifest)<>'array' OR
    jsonb_array_length(v_manifest)>cardinality(p_expected_tickers) OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_manifest) element
      WHERE jsonb_typeof(element)<>'string' OR
        NOT ((element #>> '{}')=ANY(p_expected_tickers))
    )
 THEN RETURN false; END IF;
 -- A complete AG cycle must also have an explicit completed holding stage,
 -- including the legitimate empty batch. The union is disjoint and exact.
 SELECT h.output->'persistence_tickers' INTO v_holding_manifest
 FROM public.ag_cycle_stage_checkpoints h
 WHERE h.cycle_id=v_checkpoint.cycle_id AND h.stage='holding_review'
   AND h.status='completed' AND h.user_id=v_checkpoint.user_id
   AND h.portfolio_id=v_checkpoint.portfolio_id
   AND h.strategy_era_id=v_checkpoint.strategy_era_id;
 IF jsonb_typeof(v_holding_manifest) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_manifest)+jsonb_array_length(v_holding_manifest)
       <> cardinality(p_expected_tickers)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_holding_manifest) element
      WHERE jsonb_typeof(element)<>'string'
        OR NOT ((element #>> '{}')=ANY(p_expected_tickers))
        OR v_manifest ? (element #>> '{}')
    )
 THEN RETURN false; END IF;
 SELECT count(*) INTO v_committee_count FROM public.ag_cycle_decision_writes
 WHERE cycle_id=v_checkpoint.cycle_id AND decision_kind='committee';
 SELECT count(*) INTO v_holding_count FROM public.ag_cycle_decision_writes
 WHERE cycle_id=v_checkpoint.cycle_id AND decision_kind='holding_review';
 IF v_committee_count<>jsonb_array_length(v_manifest)
    OR v_holding_count<>jsonb_array_length(v_holding_manifest)
 THEN RETURN false; END IF;
 -- Count every row for the cycle, not just the caller's expected subset.
 SELECT count(*) INTO v_count FROM public.ag_cycle_decision_writes w
 WHERE w.cycle_id=v_checkpoint.cycle_id;
 IF v_count <> cardinality(p_expected_tickers) OR EXISTS (
   SELECT 1 FROM public.ag_cycle_decision_writes w
   WHERE w.cycle_id=v_checkpoint.cycle_id
     AND (w.user_id<>v_checkpoint.user_id OR
          w.portfolio_id<>v_checkpoint.portfolio_id OR
          w.strategy_era_id<>v_checkpoint.strategy_era_id OR
          w.decision_kind NOT IN ('committee','holding_review') OR
          w.status<>'committed' OR w.investment_decision_id IS NULL OR
          w.payload_hash !~ '^[a-f0-9]{64}$' OR
          NOT (w.ticker=ANY(p_expected_tickers)) OR
          NOT EXISTS (
            SELECT 1 FROM public.investment_decisions d
            WHERE d.id=w.investment_decision_id AND
              d.user_id=w.user_id AND d.portfolio_id=w.portfolio_id AND
              d.ticker=w.ticker AND d.status='active' AND
              d.source='ai_committee' AND d.created_at >= (
                SELECT e.inception_at FROM public.portfolio_strategy_eras e
                WHERE e.id=w.strategy_era_id AND e.portfolio_id=w.portfolio_id
              )
          ))
 ) THEN RETURN false; END IF;
 -- Both verifiers check full frozen typed argument arrays against the
 -- server-derived ledger digests and their linked decision content.
 -- All decision RPCs acquire this same persistence checkpoint FOR UPDATE,
 -- preventing writes from racing between verification and completion.
 IF NOT public.ag_verify_committee_payload_manifest(v_checkpoint.cycle_id)
    OR NOT public.ag_verify_holding_payload_manifest(v_checkpoint.cycle_id)
    OR NOT public.ag_verify_cycle_watch_manifest(v_checkpoint.cycle_id)
 THEN RETURN false; END IF;
 UPDATE public.ag_cycle_stage_checkpoints SET status='completed',
   claim_token=NULL, lease_expires_at=NULL, completed_at=now(),
   output=jsonb_build_object('ledger_coverage_verified',true,
      'committee_payload_hashes_verified',true,
      'holding_payload_hashes_verified',true,
      'watch_postconditions_verified',true,
      'expected_tickers',to_jsonb(p_expected_tickers)),
   updated_at=now() WHERE id=v_checkpoint.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_complete_persistence_stage(uuid,uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_complete_persistence_stage(uuid,uuid,text[]) TO authenticated;
-- The combined manifest check covers both decision kinds and an explicit
-- empty holding stage. It does NOT prove upstream model provenance or actual-schema compatibility. Do not enable
-- automatic recovery or active daily-runner integration on this basis.


COMMIT;
