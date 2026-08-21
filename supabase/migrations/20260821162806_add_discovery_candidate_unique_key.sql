alter table public.stock_discovery_candidates
add constraint stock_discovery_candidates_daily_unique
unique (
  user_id,
  portfolio_type,
  ticker,
  discovery_date
);