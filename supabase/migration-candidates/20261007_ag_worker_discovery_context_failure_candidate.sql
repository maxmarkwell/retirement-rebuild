-- Candidate: cycle-scoped reads/failure recording for autonomous AG research.
create or replace function public.ag_worker_read_discovery_context(
 p_authorization_id uuid,p_cycle_id uuid,p_token_hash text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare c public.ag_daily_cycles%rowtype; era_inception timestamptz; result jsonb;
begin
 perform public.ag_bind_cycle_worker_identity(p_authorization_id,p_cycle_id,p_token_hash);
 select * into c from public.ag_daily_cycles where id=p_cycle_id;
 if c.id is null then raise exception 'cycle not found'; end if;
 if not exists(select 1 from public.portfolios p where p.id=c.portfolio_id and p.user_id=c.user_id and p.type='paper_active' and p.is_real_money=false)
 then raise exception 'cycle paper AG portfolio invalid'; end if;
 select e.inception_at into era_inception from public.portfolio_strategy_eras e
 where e.id=c.strategy_era_id and e.portfolio_id=c.portfolio_id and e.user_id=c.user_id
 and e.strategy_key='accelerated_growth' and e.execution_mode='paper' and e.ended_at is null;
 if era_inception is null then raise exception 'cycle paper AG era invalid'; end if;
 select jsonb_build_object(
  'portfolioId',c.portfolio_id,'strategyEraId',c.strategy_era_id,'eraInceptionAt',era_inception,
  'researchWatches',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select w.id,w.ticker,w.confidence,w.thesis,w.unresolved_questions,w.thesis_clock,w.first_seen_at,w.last_seen_at
   from public.ag_research_watchlist w where w.user_id=c.user_id and w.portfolio_id=c.portfolio_id
   and w.strategy_era_id=c.strategy_era_id and w.resolved_at is null order by w.last_seen_at asc limit 5
  ) x),'[]'::jsonb),
  'committeeWatches',coalesce((select jsonb_agg(to_jsonb(y)) from (
   select d.id,d.ticker from public.investment_decisions d where d.user_id=c.user_id and d.portfolio_id=c.portfolio_id
   and d.source='ai_committee' and d.decision_type='watch' and d.status='active' and d.created_at>=era_inception
  ) y),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.ag_worker_read_discovery_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ag_worker_read_discovery_context(uuid,uuid,text) to service_role;

create or replace function public.ag_worker_mark_cycle_stage_needs_review(
 p_authorization_id uuid,p_cycle_id uuid,p_token_hash text,p_checkpoint_id uuid,p_error_message text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare changed integer;
begin
 perform public.ag_bind_cycle_worker_identity(p_authorization_id,p_cycle_id,p_token_hash);
 update public.ag_cycle_stage_checkpoints s
 set status='needs_manual_review',
     error_message=left(coalesce(nullif(trim(p_error_message),''),'autonomous worker stage failed'),500),
     lease_expires_at=null,updated_at=now()
 where s.id=p_checkpoint_id and s.cycle_id=p_cycle_id and s.status='running';
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.ag_worker_mark_cycle_stage_needs_review(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ag_worker_mark_cycle_stage_needs_review(uuid,uuid,text,uuid,text) to service_role;
