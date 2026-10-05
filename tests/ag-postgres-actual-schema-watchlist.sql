-- Disposable actual-schema watchlist compatibility checks. Never run against production.
-- The actual-schema behavior fixture has already created the owner/cycle/persistence claim.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);

-- Live constraint accepts quantitative terminal resolutions.
INSERT INTO public.ag_research_watchlist(
 id,user_id,portfolio_id,strategy_era_id,ticker,research_status,confidence,thesis,
 unresolved_questions,thesis_clock,invalidation,model,prompt_version,
 first_seen_at,last_seen_at,resolved_at,resolution,created_at,updated_at
) VALUES (
 '11111111-aaaa-4aaa-8aaa-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'QRES','WATCH',0.5,'Resolved quantitative watch',ARRAY[]::text[],'short',
 ARRAY[]::text[],'fixture-model','fixture-v1',now(),now(),now(),
 'QUANTITATIVE_REVIEW',now(),now()
);

-- Live partial unique index permits only one unresolved row per scoped ticker.
INSERT INTO public.ag_research_watchlist(
 user_id,portfolio_id,strategy_era_id,ticker,research_status,confidence,thesis,
 unresolved_questions,thesis_clock,invalidation,model,prompt_version,
 first_seen_at,last_seen_at,created_at,updated_at
) VALUES (
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','UNIQ','WATCH',0.6,'First open watch',
 ARRAY[]::text[],'short',ARRAY[]::text[],'fixture-model','fixture-v1',
 now(),now(),now(),now()
);
DO $$
BEGIN
 BEGIN
  INSERT INTO public.ag_research_watchlist(
   user_id,portfolio_id,strategy_era_id,ticker,research_status,confidence,thesis,
   unresolved_questions,thesis_clock,invalidation,model,prompt_version,
   first_seen_at,last_seen_at,created_at,updated_at
  ) VALUES (
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','UNIQ','WATCH',0.7,'Second open watch',
   ARRAY[]::text[],'short',ARRAY[]::text[],'fixture-model','fixture-v1',
   now(),now(),now(),now()
  );
  RAISE EXCEPTION 'Duplicate unresolved watch unexpectedly accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- Seed a committed watch-ledger row and verify the scoped read boundary.
INSERT INTO public.ag_cycle_watch_writes(
 cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,payload_hash,
 status,effect,committed_at
) VALUES (
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'research_watch','LEDGER','resolve_research',repeat('a',64),'committed','noop',now()
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ag_read_cycle_watch_ledger('dddddddd-dddd-4ddd-8ddd-dddddddddddd')
 WHERE ticker='LEDGER';
 IF n<>1 THEN RAISE EXCEPTION 'Owner watch-ledger RPC did not return expected row'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',false);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.ag_read_cycle_watch_ledger('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 IF n<>0 THEN RAISE EXCEPTION 'Watch-ledger RPC leaked cross-owner rows'; END IF;
END $$;
RESET ROLE;

-- Exact audited-schema atomic watch round trip.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'catalyst_deep_research','completed',
 '{"watchlist_intents":[{"stream":"research_watch","symbol":"ROUNDTRIP","action":"upsert_watch","source_row_id":null,"outcome":{"symbol":"ROUNDTRIP","researchStatus":"WATCH","companyName":"Round Trip Inc","confidence":0.75,"thesis":"Frozen watch thesis","unresolvedQuestions":["Question A"],"thesisClock":"medium","invalidation":["Invalidator A"],"model":"fixture-model","promptVersion":"fixture-v1","priorWatchReassessed":false,"priorWatchRowId":null}}]}'::jsonb
);

DO $$
DECLARE ledger_id uuid; affected uuid; verified boolean; tampered boolean;
BEGIN
 ledger_id := public.ag_commit_watch_operation(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'research_watch','ROUNDTRIP','upsert_watch',NULL,NULL,'Round Trip Inc',0.75,
  'Frozen watch thesis',ARRAY['Question A'],'medium',ARRAY['Invalidator A'],
  'fixture-model','fixture-v1',false
 );
 IF ledger_id IS NULL THEN RAISE EXCEPTION 'Audited watch round trip returned null ledger'; END IF;

 SELECT affected_row_id INTO affected FROM public.ag_cycle_watch_writes WHERE id=ledger_id;
 IF affected IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.ag_research_watchlist
  WHERE id=affected AND ticker='ROUNDTRIP' AND resolved_at IS NULL
   AND research_status='WATCH' AND confidence=0.75
   AND thesis='Frozen watch thesis'
   AND unresolved_questions=ARRAY['Question A']::text[]
   AND thesis_clock='medium' AND invalidation=ARRAY['Invalidator A']::text[]
   AND model='fixture-model' AND prompt_version='fixture-v1'
 ) THEN RAISE EXCEPTION 'Audited watch round trip target row mismatch'; END IF;

 verified := public.ag_verify_watch_operation_postcondition(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','research_watch','ROUNDTRIP','upsert_watch',
  NULL,NULL,'Round Trip Inc',0.75,'Frozen watch thesis',ARRAY['Question A'],'medium',
  ARRAY['Invalidator A'],'fixture-model','fixture-v1',false
 );
 IF verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'Exact watch postcondition was not verified'; END IF;

 tampered := public.ag_verify_watch_operation_postcondition(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','research_watch','ROUNDTRIP','upsert_watch',
  NULL,NULL,'Round Trip Inc',0.76,'Frozen watch thesis',ARRAY['Question A'],'medium',
  ARRAY['Invalidator A'],'fixture-model','fixture-v1',false
 );
 IF tampered IS DISTINCT FROM false THEN RAISE EXCEPTION 'Tampered watch payload verified unexpectedly'; END IF;
END $$;
