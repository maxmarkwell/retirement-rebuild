-- Assert the deliberately failed migration candidate rolled back all of its
-- changes while preserving setup that existed before BEGIN.
DO $agrollback$
DECLARE resolution_def text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='investment_decisions' AND column_name='notes'
  ) THEN RAISE EXCEPTION 'Failed candidate left investment_decisions.notes behind'; END IF;

  SELECT pg_get_constraintdef(c.oid) INTO resolution_def
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='ag_research_watchlist'
    AND c.conname='ag_research_watchlist_resolution_check';
  IF resolution_def IS NULL OR resolution_def LIKE '%QUANTITATIVE_REVIEW%'
  THEN RAISE EXCEPTION 'Failed candidate left watchlist constraint mutation behind'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ag_cycle_stage_checkpoints'
      AND column_name='id'
  ) THEN RAISE EXCEPTION 'Preexisting conflict table disappeared'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ag_cycle_stage_checkpoints'
      AND column_name='cycle_id'
  ) THEN RAISE EXCEPTION 'Failed candidate partially altered conflict table'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='ag_claim_cycle_stage'
  ) THEN RAISE EXCEPTION 'Failed candidate left recovery functions behind'; END IF;
END $agrollback$;
