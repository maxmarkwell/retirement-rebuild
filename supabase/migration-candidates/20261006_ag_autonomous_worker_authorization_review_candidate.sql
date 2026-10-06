-- REVIEW CANDIDATE ONLY. DO NOT APPLY WITHOUT EXPLICIT PRODUCTION DDL APPROVAL.
-- Authorizes bounded server-side continuation of one paper AG cycle.
create table if not exists public.ag_cycle_worker_authorizations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.ag_daily_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','consumed','revoked','expired')),
  expires_at timestamptz not null,
  max_invocations integer not null default 32 check (max_invocations between 1 and 64),
  invocation_count integer not null default 0 check (invocation_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_invoked_at timestamptz,
  check (expires_at > created_at)
);

alter table public.ag_cycle_worker_authorizations enable row level security;
revoke all on table public.ag_cycle_worker_authorizations from public, anon, authenticated;
grant select, insert, update on table public.ag_cycle_worker_authorizations to service_role;

create index if not exists ag_cycle_worker_authorizations_active_idx
on public.ag_cycle_worker_authorizations(cycle_id,status,expires_at);

-- Worker authorizations are server-only capabilities. Browser/authenticated
-- clients never receive table access; the initiating route will create the
-- capability through a narrowly scoped authenticated RPC in a later candidate.
