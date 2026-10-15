-- Executed after fixture schema and all three AG worker migrations.
-- A failure raises an exception and makes psql exit nonzero.
do $$
declare
  v_cycle uuid := '44444444-4444-4444-8444-444444444444';
  v_token uuid;
  v_output jsonb;
begin
  -- Protected cycle is rejected before any cycle lookup or checkpoint write.
  begin
    perform public.ag_worker_claim_stage('583809c1-7157-4ad4-b343-56acc332a145','holding_review',60);
    raise exception 'TEST_FAILED: protected claim accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: protected claim accepted' then raise; end if;
    if position('AG_WORKER_PROTECTED_CYCLE' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.ag_worker_renew_stage('583809c1-7157-4ad4-b343-56acc332a145','holding_review',gen_random_uuid(),60);
    raise exception 'TEST_FAILED: protected renewal accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: protected renewal accepted' then raise; end if;
    if position('AG_WORKER_PROTECTED_CYCLE' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.ag_worker_complete_stage('583809c1-7157-4ad4-b343-56acc332a145','holding_review',gen_random_uuid(),
      jsonb_build_object('schemaVersion',1,'cycleId','583809c1-7157-4ad4-b343-56acc332a145',
        'stage','holding_review','producedAt',now()::text,'payload',jsonb_build_object('ok',true)));
    raise exception 'TEST_FAILED: protected completion accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: protected completion accepted' then raise; end if;
    if position('AG_WORKER_PROTECTED_CYCLE' in sqlerrm)=0 then raise; end if;
  end;
  -- A later stage cannot bypass a missing predecessor.
  begin
    perform public.ag_worker_claim_stage(v_cycle,'discovery',60);
    raise exception 'TEST_FAILED: missing predecessor was accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: missing predecessor was accepted' then raise; end if;
    if position('AG_WORKER_PREDECESSOR_NOT_DURABLE' in sqlerrm)=0 then raise; end if;
  end;

  v_token := public.ag_worker_claim_stage(v_cycle,'holding_review',60);
  if v_token is null then raise exception 'TEST_FAILED: claim returned null'; end if;
  if public.ag_worker_renew_stage(v_cycle,'holding_review',gen_random_uuid(),60) then
    raise exception 'TEST_FAILED: wrong renewal token accepted';
  end if;
  if not public.ag_worker_renew_stage(v_cycle,'holding_review',v_token,60) then
    raise exception 'TEST_FAILED: valid renewal refused';
  end if;
  begin
    perform public.ag_worker_complete_stage(v_cycle,'holding_review',v_token,
      jsonb_build_object('schemaVersion',1,'cycleId',gen_random_uuid(),
        'stage','holding_review','producedAt',now()::text,'payload',jsonb_build_object('ok',true)));
    raise exception 'TEST_FAILED: wrong output cycle accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: wrong output cycle accepted' then raise; end if;
    if position('AG_WORKER_OUTPUT_INVALID' in sqlerrm)=0 then raise; end if;
  end;
  begin
    perform public.ag_worker_complete_stage(v_cycle,'holding_review',v_token,
      jsonb_build_object('schemaVersion',1,'cycleId',v_cycle,
        'stage','discovery','producedAt',now()::text,'payload',jsonb_build_object('ok',true)));
    raise exception 'TEST_FAILED: wrong output stage accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: wrong output stage accepted' then raise; end if;
    if position('AG_WORKER_OUTPUT_INVALID' in sqlerrm)=0 then raise; end if;
  end;
  if public.ag_worker_complete_stage(v_cycle,'holding_review',gen_random_uuid(),
    jsonb_build_object('schemaVersion',1,'cycleId',v_cycle,'stage','holding_review',
      'producedAt',now()::text,'payload',jsonb_build_object('checked',true))) then
    raise exception 'TEST_FAILED: wrong completion token accepted';
  end if;
  begin
    perform public.ag_worker_complete_stage(v_cycle,'holding_review',v_token,
      jsonb_build_object('schemaVersion',1,'cycleId',v_cycle,'stage','holding_review',
        'producedAt',now()::text,'payload','{}'::jsonb));
    raise exception 'TEST_FAILED: empty output accepted';
  exception when others then
    if sqlerrm = 'TEST_FAILED: empty output accepted' then raise; end if;
    if position('AG_WORKER_OUTPUT_INVALID' in sqlerrm)=0 then raise; end if;
  end;
  v_output := jsonb_build_object('schemaVersion',1,'cycleId',v_cycle,'stage','holding_review',
    'producedAt',now()::text,'payload',jsonb_build_object('checked',true));
  if not public.ag_worker_complete_stage(v_cycle,'holding_review',v_token,v_output) then
    raise exception 'TEST_FAILED: valid completion refused';
  end if;
  if public.ag_worker_complete_stage(v_cycle,'holding_review',v_token,v_output) then
    raise exception 'TEST_FAILED: replayed completion accepted';
  end if;
  begin
    perform public.ag_worker_claim_stage(v_cycle,'holding_review',60);
    raise exception 'TEST_FAILED: completed stage reclaimed';
  exception when others then
    if sqlerrm = 'TEST_FAILED: completed stage reclaimed' then raise; end if;
    if position('AG_WORKER_STAGE_NOT_CLAIMABLE' in sqlerrm)=0 then raise; end if;
  end;
  v_token := public.ag_worker_claim_stage(v_cycle,'discovery',60);
  if v_token is null then raise exception 'TEST_FAILED: successor claim refused'; end if;
  update public.ag_cycle_stage_checkpoints set lease_expires_at=now()-interval '1 second'
    where cycle_id=v_cycle and stage='discovery';
  if public.ag_worker_renew_stage(v_cycle,'discovery',v_token,60) then
    raise exception 'TEST_FAILED: expired lease renewed';
  end if;
  if public.ag_worker_complete_stage(v_cycle,'discovery',v_token,
    jsonb_build_object('schemaVersion',1,'cycleId',v_cycle,'stage','discovery',
      'producedAt',now()::text,'payload',jsonb_build_object('checked',true))) then
    raise exception 'TEST_FAILED: expired lease completed';
  end if;
  begin
    perform public.ag_worker_claim_stage(v_cycle,'discovery',60);
    raise exception 'TEST_FAILED: expired stage reclaimed';
  exception when others then
    if sqlerrm = 'TEST_FAILED: expired stage reclaimed' then raise; end if;
    if position('AG_WORKER_RECONCILIATION_REQUIRED' in sqlerrm)=0 then raise; end if;
  end;
  raise notice 'AG_WORKER_POSTGRES_FIXTURE_PASS';
end $$;
