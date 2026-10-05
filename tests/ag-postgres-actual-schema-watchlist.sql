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
