-- Disposable constraints for watchlist compatibility + operation ledger.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $agtest$
DECLARE cycle uuid:='44444444-4444-4444-8444-444444444444';
DECLARE source_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
BEGIN
 -- Draft compatibility must accept the legacy writer's detailed provenance.
 INSERT INTO public.ag_research_watchlist(
  id,user_id,portfolio_id,strategy_era_id,ticker,research_status,confidence,
  thesis,model,prompt_version,resolved_at,resolution
 ) VALUES (
  source_id,'11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','WLEDGER','WATCH',0.7,
  'Watch thesis','model','v1',now(),'QUANTITATIVE_REJECT'
 );
 INSERT INTO public.ag_cycle_watch_writes(
  cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
  source_row_id,payload_hash,status,effect,affected_row_id,committed_at
 ) VALUES (
  cycle,'11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'research_watch','WLEDGER','resolve_quantitative',source_id,repeat('a',64),
  'committed','applied',source_id,now()
 );
 BEGIN
  INSERT INTO public.ag_cycle_watch_writes(
   cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
   payload_hash,status,effect,affected_row_id,committed_at
  ) VALUES (
   cycle,'11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333',
   'committee_watch','BADSTREAM','upsert_watch',repeat('b',64),
   'committed','noop',null,now());
  RAISE EXCEPTION 'Invalid stream/action pair accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO public.ag_cycle_watch_writes(
   cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
   payload_hash,status,effect,affected_row_id,committed_at
  ) VALUES (
   cycle,'11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333',
   'committee_watch','NOSOURCE','supersede_committee',repeat('c',64),
   'committed','noop',null,now());
  RAISE EXCEPTION 'Committee supersession without frozen source row accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO public.ag_cycle_watch_writes(
   cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
   payload_hash,status,effect,affected_row_id,committed_at
  ) VALUES (
   cycle,'11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333',
   'research_watch','BADNOOP','resolve_research',repeat('d',64),
   'committed','noop',source_id,now());
  RAISE EXCEPTION 'No-op with affected row identity accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $agtest$;
