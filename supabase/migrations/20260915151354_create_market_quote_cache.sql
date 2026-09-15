create table if not exists public.market_quote_cache (
  ticker text primary key,
  price numeric not null,
  previous_close numeric,
  quote_timestamp timestamptz,
  fetched_at timestamptz not null default now(),
  provider text not null default 'twelve_data',

  constraint market_quote_cache_ticker_not_blank
    check (length(trim(ticker)) > 0),

  constraint market_quote_cache_price_positive
    check (price > 0)
);

create index if not exists
  market_quote_cache_fetched_at_idx
on public.market_quote_cache (fetched_at);

alter table public.market_quote_cache
  enable row level security;

comment on table public.market_quote_cache is
  'Persistent latest market quotes used by automated portfolio valuation.';

comment on column public.market_quote_cache.fetched_at is
  'Time Retirement Rebuild successfully obtained this quote from the market-data provider.';