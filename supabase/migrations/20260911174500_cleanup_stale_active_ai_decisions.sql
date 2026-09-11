-- Clean up historical AI Committee decisions that remain active
-- even though a newer AI Committee decision exists for the same
-- user, portfolio, and ticker.
--
-- This is intentionally broader than the earlier cleanup that only
-- de-duplicated rows within the active set. An older active decision
-- is no longer current once any newer AI Committee decision exists,
-- regardless of whether the newer decision is active, executed,
-- closed, or superseded.

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
      and newer.created_at > older.created_at
  );
