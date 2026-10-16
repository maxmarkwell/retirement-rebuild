-- Run ONLY against a disposable PostgreSQL database, never Supabase production.
-- Minimal schema fixture for the AG lease RPCs. No real user or portfolio data.
create extension if not exists pgcrypto;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create or replace function auth.role() returns text language sql stable as
$$ select current_setting('request.jwt.claim.role',true) $$;
create type public.portfolio_type as enum ('paper_active','paper_long_term','real');
create table public.portfolios (
  id uuid primary key, user_id uuid not null, type public.portfolio_type not null,
  is_real_money boolean not null default false
);
create table public.portfolio_strategy_eras (
  id uuid primary key, user_id uuid not null, portfolio_id uuid not null,
  strategy_key text not null, execution_mode text not null, ended_at timestamptz
);
create table public.ag_daily_cycles (
  id uuid primary key, user_id uuid not null, portfolio_id uuid not null,
  strategy_era_id uuid not null, cycle_date date not null, status text not null
);
create table public.ag_cycle_stage_checkpoints (
  id uuid primary key default gen_random_uuid(), cycle_id uuid not null,
  user_id uuid not null, portfolio_id uuid not null, strategy_era_id uuid not null,
  stage text not null, status text not null, output jsonb,
  claim_token uuid, lease_expires_at timestamptz, attempt_count integer not null default 0,
  started_at timestamptz, updated_at timestamptz, completed_at timestamptz,
  unique(cycle_id,stage)
);
select set_config('request.jwt.claim.role','service_role',false);
insert into public.portfolios values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','paper_active',false);
insert into public.portfolio_strategy_eras values
('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',
 '11111111-1111-4111-8111-111111111111','accelerated_growth','paper',null);
insert into public.ag_daily_cycles values
('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',
 '11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
 '2026-10-16','running');
