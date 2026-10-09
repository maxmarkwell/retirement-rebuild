-- REVIEW CANDIDATE ONLY. DO NOT APPLY WITHOUT EXPLICIT PRODUCTION DDL APPROVAL.
create or replace function public.ag_finalize_daily_cycle(
  p_checkpoint_id uuid,
  p_claim_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkpoint public.ag_cycle_stage_checkpoints%rowtype;
  v_cycle public.ag_daily_cycles%rowtype;
  v_persistence public.ag_cycle_stage_checkpoints%rowtype;
  v_persisted_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_checkpoint
  from public.ag_cycle_stage_checkpoints
  where id=p_checkpoint_id and user_id=auth.uid() and stage='finalized'
    and status='running' and claim_token=p_claim_token
    and lease_expires_at > now()
  for update;
  if not found then return false; end if;

  select * into v_cycle from public.ag_daily_cycles
  where id=v_checkpoint.cycle_id and user_id=auth.uid()
  for update;
  if not found or v_cycle.status <> 'running'
    or v_cycle.portfolio_id <> v_checkpoint.portfolio_id
    or v_cycle.strategy_era_id <> v_checkpoint.strategy_era_id
  then return false; end if;

  if not exists (
    select 1 from public.portfolios p
    join public.portfolio_strategy_eras e on e.id=v_cycle.strategy_era_id
    where p.id=v_cycle.portfolio_id and p.user_id=auth.uid()
      and p.type='paper_active' and p.is_real_money=false
      and e.portfolio_id=p.id and e.strategy_key='accelerated_growth'
      and e.execution_mode='paper' and e.ended_at is null
  ) then return false; end if;

  select * into v_persistence
  from public.ag_cycle_stage_checkpoints
  where cycle_id=v_cycle.id and user_id=v_cycle.user_id
    and portfolio_id=v_cycle.portfolio_id and strategy_era_id=v_cycle.strategy_era_id
    and stage='persistence' and status='completed'
  for update;
  if not found
    or jsonb_typeof(v_persistence.output) is distinct from 'object'
    or (v_persistence.output->>'ledger_coverage_verified')::boolean is distinct from true
    or (v_persistence.output->>'committee_payload_hashes_verified')::boolean is distinct from true
    or (v_persistence.output->>'holding_payload_hashes_verified')::boolean is distinct from true
    or (v_persistence.output->>'watch_postconditions_verified')::boolean is distinct from true
    or jsonb_typeof(v_persistence.output->'expected_tickers') is distinct from 'array'
  then return false; end if;

  if not public.ag_verify_committee_payload_manifest(v_cycle.id)
     or not public.ag_verify_holding_payload_manifest(v_cycle.id)
     or not public.ag_verify_cycle_watch_manifest(v_cycle.id)
  then return false; end if;

  select count(*) into v_persisted_count
  from public.ag_cycle_decision_writes
  where cycle_id=v_cycle.id and status='committed';

  update public.ag_daily_cycles
  set status='completed', completed_at=now(), failure_message=null,
      persisted_decision_count=v_persisted_count, updated_at=now()
  where id=v_cycle.id and user_id=auth.uid() and status='running';
  if not found then return false; end if;

  update public.ag_cycle_stage_checkpoints
  set status='completed', claim_token=null, lease_expires_at=null,
      completed_at=now(),
      output=jsonb_build_object(
        'persistence_checkpoint_id',v_persistence.id,
        'postconditions_reverified',true,
        'persisted_decision_count',v_persisted_count
      ),
      updated_at=now()
  where id=v_checkpoint.id and status='running' and claim_token=p_claim_token;
  if not found then raise exception 'AG finalization checkpoint completion failed'; end if;

  return true;
end;
$$;

revoke all on function public.ag_finalize_daily_cycle(uuid,uuid) from public;
revoke all on function public.ag_finalize_daily_cycle(uuid,uuid) from anon;
grant execute on function public.ag_finalize_daily_cycle(uuid,uuid) to authenticated;
grant execute on function public.ag_finalize_daily_cycle(uuid,uuid) to service_role;
