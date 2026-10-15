do $$
declare
  v_cycle uuid := '55555555-5555-4555-8555-555555555555';
  v_token uuid;
  v_payload jsonb := '{"result":"safe"}'::jsonb;
begin
  insert into public.ag_daily_cycles(id,user_id,portfolio_id,strategy_era_id,cycle_date,status)
    values(v_cycle,'22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333','2026-10-15','running');
  v_token := public.ag_worker_claim_stage(v_cycle,'holding_review',60);
  if not public.ag_worker_put_stage_artifact(v_cycle,'holding_review',v_token,'first',v_payload)
  then raise exception 'TEST_FAILED: valid artifact rejected'; end if;
  if not exists (
    select 1 from public.ag_worker_stage_artifacts
    where cycle_id=v_cycle and stage='holding_review' and artifact_key='first'
      and user_id='22222222-2222-4222-8222-222222222222'::uuid
      and portfolio_id='11111111-1111-4111-8111-111111111111'::uuid
      and strategy_era_id='33333333-3333-4333-8333-333333333333'::uuid
  ) then raise exception 'TEST_FAILED: artifact scope not persisted'; end if;
  if (select count(*) from public.ag_worker_read_stage_artifacts(v_cycle,'holding_review',v_token)) <> 1
  then raise exception 'TEST_FAILED: fenced artifact read failed'; end if;
  if exists (select 1 from public.ag_worker_read_stage_artifacts(v_cycle,'holding_review',gen_random_uuid()))
  then raise exception 'TEST_FAILED: wrong token read artifacts'; end if;
  if public.ag_worker_put_stage_artifact(v_cycle,'holding_review',v_token,'first',v_payload)
  then raise exception 'TEST_FAILED: duplicate artifact accepted'; end if;
  if public.ag_worker_put_stage_artifact(v_cycle,'holding_review',gen_random_uuid(),'wrong_token',v_payload)
  then raise exception 'TEST_FAILED: wrong token accepted'; end if;
  update public.ag_cycle_stage_checkpoints
    set lease_expires_at=now()-interval '1 second'
    where cycle_id=v_cycle and stage='holding_review';
  if exists (select 1 from public.ag_worker_read_stage_artifacts(v_cycle,'holding_review',v_token))
  then raise exception 'TEST_FAILED: expired token read artifacts'; end if;
  if public.ag_worker_put_stage_artifact(v_cycle,'holding_review',v_token,'expired',v_payload)
  then raise exception 'TEST_FAILED: expired token accepted'; end if;
  if exists (select 1 from public.ag_worker_stage_artifacts where cycle_id=v_cycle and artifact_key='expired')
  then raise exception 'TEST_FAILED: expired token mutated artifact table'; end if;
  update public.ag_cycle_stage_checkpoints
    set lease_expires_at=now()+interval '1 minute'
    where cycle_id=v_cycle and stage='holding_review';
  update public.ag_daily_cycles set status='completed' where id=v_cycle;
  if exists (select 1 from public.ag_worker_read_stage_artifacts(v_cycle,'holding_review',v_token))
  then raise exception 'TEST_FAILED: finalized cycle read artifacts'; end if;
  if public.ag_worker_put_stage_artifact(v_cycle,'holding_review',v_token,'finalized',v_payload)
  then raise exception 'TEST_FAILED: finalized cycle accepted'; end if;
  if exists (select 1 from public.ag_worker_stage_artifacts where cycle_id=v_cycle and artifact_key='finalized')
  then raise exception 'TEST_FAILED: finalized cycle mutated artifact table'; end if;
  begin
    perform public.ag_worker_put_stage_artifact(
      '583809c1-7157-4ad4-b343-56acc332a145','holding_review',v_token,'protected',v_payload);
    raise exception 'TEST_FAILED: protected artifact accepted';
  exception when others then
    if sqlerrm='TEST_FAILED: protected artifact accepted' then raise; end if;
    if position('AG_WORKER_PROTECTED_CYCLE' in sqlerrm)=0 then raise; end if;
  end;
  raise notice 'AG_WORKER_FENCED_ARTIFACTS_PASS';
end $$;
