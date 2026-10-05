BEGIN;
CREATE TABLE public.ag_cycle_symbol_checkpoints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
 parent_stage text NOT NULL CHECK (parent_stage IN ('catalyst_deep_research','committee')),
 symbol text NOT NULL CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','needs_manual_review')),
 output jsonb,
 claim_token uuid,
 lease_expires_at timestamptz,
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
 started_at timestamptz, completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ag_symbol_checkpoint_unique UNIQUE(cycle_id,parent_stage,symbol),
 CONSTRAINT ag_symbol_completed_output CHECK(status<>'completed' OR output IS NOT NULL)
);
CREATE INDEX ag_cycle_symbol_checkpoints_cycle_stage_idx ON public.ag_cycle_symbol_checkpoints(cycle_id,parent_stage,status);
ALTER TABLE public.ag_cycle_symbol_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ag_cycle_symbol_checkpoints FROM anon,authenticated;
GRANT ALL ON TABLE public.ag_cycle_symbol_checkpoints TO service_role;

CREATE FUNCTION public.ag_protect_completed_symbol_checkpoint() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.status='completed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Completed AG symbol checkpoint is immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ag_protect_completed_symbol_checkpoint() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ag_protect_completed_symbol_checkpoint() TO service_role;
CREATE TRIGGER ag_symbol_checkpoint_immutable BEFORE UPDATE OR DELETE ON public.ag_cycle_symbol_checkpoints
FOR EACH ROW EXECUTE FUNCTION public.ag_protect_completed_symbol_checkpoint();

CREATE FUNCTION public.ag_claim_cycle_symbol(p_cycle_id uuid,p_parent_stage text,p_symbol text)
RETURNS TABLE(checkpoint_id uuid,claim_token uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cycle public.ag_daily_cycles%ROWTYPE; v_parent public.ag_cycle_stage_checkpoints%ROWTYPE;
 v_row public.ag_cycle_symbol_checkpoints%ROWTYPE; v_token uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_parent_stage NOT IN ('catalyst_deep_research','committee') OR p_symbol !~ '^[A-Z][A-Z0-9.-]{0,14}$' THEN RAISE EXCEPTION 'Invalid AG symbol work identity'; END IF;
 SELECT * INTO v_cycle FROM public.ag_daily_cycles WHERE id=p_cycle_id AND user_id=auth.uid() AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cycle unavailable or not running'; END IF;
 SELECT * INTO v_parent FROM public.ag_cycle_stage_checkpoints WHERE cycle_id=p_cycle_id AND stage=p_parent_stage AND status='running' FOR UPDATE;
 IF NOT FOUND OR v_parent.user_id<>auth.uid() OR v_parent.lease_expires_at IS NULL OR v_parent.lease_expires_at<=now() THEN RAISE EXCEPTION 'Valid running parent AG stage claim required'; END IF;
 -- Each bounded child request renews the still-valid parent lease. This permits
 -- multi-request fan-out without allowing an expired/stale parent to revive.
 UPDATE public.ag_cycle_stage_checkpoints SET lease_expires_at=now()+interval '6 minutes',updated_at=now()
 WHERE id=v_parent.id AND status='running' AND lease_expires_at>now();
 SELECT * INTO v_row FROM public.ag_cycle_symbol_checkpoints WHERE cycle_id=p_cycle_id AND parent_stage=p_parent_stage AND symbol=p_symbol FOR UPDATE;
 IF FOUND AND v_row.status<>'pending' THEN RAISE EXCEPTION 'AG symbol work already claimed, completed or requires review'; END IF;
 IF FOUND THEN
  UPDATE public.ag_cycle_symbol_checkpoints SET status='running',claim_token=v_token,lease_expires_at=now()+interval '4 minutes',attempt_count=attempt_count+1,started_at=now(),updated_at=now()
  WHERE id=v_row.id RETURNING id INTO checkpoint_id;
 ELSE
  INSERT INTO public.ag_cycle_symbol_checkpoints(cycle_id,parent_stage,symbol,status,claim_token,lease_expires_at,attempt_count,started_at)
  VALUES(p_cycle_id,p_parent_stage,p_symbol,'running',v_token,now()+interval '4 minutes',1,now()) RETURNING id INTO checkpoint_id;
 END IF;
 claim_token:=v_token; RETURN NEXT;
END $$;

CREATE FUNCTION public.ag_complete_cycle_symbol(p_checkpoint_id uuid,p_claim_token uuid,p_output jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
 IF auth.uid() IS NULL OR p_output IS NULL THEN RAISE EXCEPTION 'Authenticated caller and output required'; END IF;
 UPDATE public.ag_cycle_symbol_checkpoints s SET status='completed',output=p_output,completed_at=now(),updated_at=now()
 FROM public.ag_daily_cycles d,public.ag_cycle_stage_checkpoints p
 WHERE s.id=p_checkpoint_id AND s.claim_token=p_claim_token AND s.status='running' AND s.lease_expires_at>now()
 AND d.id=s.cycle_id AND d.user_id=auth.uid() AND d.status='running'
 AND p.cycle_id=s.cycle_id AND p.stage=s.parent_stage AND p.status='running' AND p.user_id=auth.uid() AND p.lease_expires_at>now()
 AND p_output->>'symbol'=s.symbol;
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count=1;
END $$;

CREATE FUNCTION public.ag_read_cycle_symbol_checkpoints(p_cycle_id uuid,p_parent_stage text)
RETURNS TABLE(symbol text,status text,output jsonb) LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
 SELECT s.symbol,s.status,s.output FROM public.ag_cycle_symbol_checkpoints s JOIN public.ag_daily_cycles d ON d.id=s.cycle_id
 WHERE s.cycle_id=p_cycle_id AND s.parent_stage=p_parent_stage AND d.user_id=auth.uid()
 ORDER BY s.symbol
$$;

REVOKE ALL ON FUNCTION public.ag_claim_cycle_symbol(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ag_complete_cycle_symbol(uuid,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ag_read_cycle_symbol_checkpoints(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ag_claim_cycle_symbol(uuid,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ag_complete_cycle_symbol(uuid,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ag_read_cycle_symbol_checkpoints(uuid,text) TO authenticated,service_role;
COMMIT;
