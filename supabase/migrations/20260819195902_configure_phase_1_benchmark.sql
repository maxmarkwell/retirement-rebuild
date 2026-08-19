-- Retirement Rebuild
-- Lock the Phase 1 benchmark to Vanguard S&P 500 ETF (VOO).

insert into public.benchmarks (
  user_id,
  name,
  ticker,
  description,
  active_from,
  reason_selected
)
select
  u.id,
  'Phase 1 S&P 500 Benchmark',
  'VOO',
  'Vanguard S&P 500 ETF used as the passive Phase 1 comparison benchmark.',
  current_date,
  'Selected before the AI investment experiment began. Tracks the S&P 500 with a low 0.03% expense ratio and provides a simple passive U.S. large-cap comparison.'
from auth.users u
where not exists (
  select 1
  from public.benchmarks b
  where b.user_id = u.id
    and b.name = 'Phase 1 S&P 500 Benchmark'
);