-- Keep at most one current AI Committee decision per user/portfolio/ticker.
--
-- Historical data can contain older AI decisions that are still marked active
-- even though a newer AI Committee decision exists. This migration cleans up
-- those stale rows, then installs an atomic trigger so future inserts
-- automatically supersede any older active AI Committee decision for the same
-- security and portfolio.

-- ---------------------------------------------------------------------------
-- Historical cleanup
-- ---------------------------------------------------------------------------

update public.investment_decisions as older
set status = 'superseded'
where older.source = 'ai_committee'
  and older.status = 'active'
  and exists (
    select 1
    from public.investment_decisions as newer
    where newer.user_id = older.user_id
      and newer.portfolio_id = older.portfolio_id
      and newer.ticker = older.ticker
      and newer.source = 'ai_committee'
      and (
        newer.decision_date > older.decision_date
        or (
          newer.decision_date = older.decision_date
          and newer.created_at > older.created_at
        )
        or (
          newer.decision_date = older.decision_date
          and newer.created_at = older.created_at
          and newer.id > older.id
        )
      )
  );

-- ---------------------------------------------------------------------------
-- Future lifecycle enforcement
-- ---------------------------------------------------------------------------

create or replace function public.supersede_prior_active_ai_decisions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'ai_committee' then
    update public.investment_decisions
    set status = 'superseded'
    where user_id = new.user_id
      and portfolio_id = new.portfolio_id
      and ticker = new.ticker
      and source = 'ai_committee'
      and status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists supersede_prior_active_ai_decisions_before_insert
  on public.investment_decisions;

create trigger supersede_prior_active_ai_decisions_before_insert
before insert on public.investment_decisions
for each row
execute function public.supersede_prior_active_ai_decisions();

-- Defense in depth: after cleanup + trigger installation, prevent more than one
-- active AI Committee decision for a user/portfolio/ticker even if another code
-- path bypasses the normal Committee action.
create unique index if not exists investment_decisions_one_active_ai_per_ticker
  on public.investment_decisions (user_id, portfolio_id, ticker)
  where source = 'ai_committee'
    and status = 'active';
