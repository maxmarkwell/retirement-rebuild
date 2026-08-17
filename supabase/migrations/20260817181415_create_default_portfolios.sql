-- Retirement Rebuild
-- Automatically create the four Phase 1 portfolios for each user.

create or replace function public.create_default_portfolios_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portfolios (
    user_id,
    name,
    type,
    starting_capital,
    is_real_money
  )
  values
    (
      new.id,
      'Real Portfolio',
      'real',
      0,
      true
    ),
    (
      new.id,
      'AI Active Portfolio',
      'paper_active',
      10000,
      false
    ),
    (
      new.id,
      'AI Long-Term Portfolio',
      'paper_long_term',
      10000,
      false
    ),
    (
      new.id,
      'Benchmark Portfolio',
      'benchmark',
      10000,
      false
    )
  on conflict (user_id, name) do nothing;

  return new;
end;
$$;

-- Create portfolios automatically for future users.
create trigger create_default_portfolios_after_signup
after insert on auth.users
for each row
execute function public.create_default_portfolios_for_user();

-- Backfill users who already existed before this trigger was created.
insert into public.portfolios (
  user_id,
  name,
  type,
  starting_capital,
  is_real_money
)
select
  u.id,
  p.name,
  p.type::portfolio_type,
  p.starting_capital,
  p.is_real_money
from auth.users u
cross join (
  values
    ('Real Portfolio', 'real', 0::numeric, true),
    ('AI Active Portfolio', 'paper_active', 10000::numeric, false),
    ('AI Long-Term Portfolio', 'paper_long_term', 10000::numeric, false),
    ('Benchmark Portfolio', 'benchmark', 10000::numeric, false)
) as p(name, type, starting_capital, is_real_money)
on conflict (user_id, name) do nothing;