-- Disposable Postgres only: exercise grants and RLS as the restricted app role.
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.ag_cycle_decision_writes TO authenticated;
-- SECURITY DEFINER RPC must be callable, but direct ledger mutation forbidden.
GRANT EXECUTE ON FUNCTION public.ag_commit_cycle_decision(
 uuid,uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,text,text
) TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE visible integer; result_id uuid;
BEGIN
 SELECT count(*) INTO visible FROM public.ag_cycle_decision_writes
 WHERE cycle_id='44444444-4444-4444-8444-444444444444';
 IF visible = 0 THEN RAISE EXCEPTION 'Owner cannot read ledger'; END IF;
 BEGIN
  INSERT INTO public.ag_cycle_decision_writes(
    cycle_id,user_id,portfolio_id,strategy_era_id,ticker,decision_kind,payload_hash
  ) VALUES (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'ILLEGAL','committee',repeat('a',64)
  );
  RAISE EXCEPTION 'Restricted role unexpectedly inserted ledger';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 result_id := public.ag_commit_cycle_decision(
   '44444444-4444-4444-8444-444444444444',
   '55555555-5555-4555-8555-555555555555',
   'ROLECHECK','committee','watch','Restricted role test',75,'short',
   null,null,null,null,null
 );
 IF result_id IS NULL THEN RAISE EXCEPTION 'Restricted role RPC returned null'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $$
DECLARE visible integer;
BEGIN
 SELECT count(*) INTO visible FROM public.ag_cycle_decision_writes;
 IF visible <> 0 THEN RAISE EXCEPTION 'RLS leaked another owners ledger'; END IF;
END $$;
RESET ROLE;
