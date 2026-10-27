#!/usr/bin/env bash
set -euo pipefail
# Build a disposable Supabase project with the REAL contribution-idempotency
# migration but fixture base tables. Existing full migrations currently fail
# independently in AG code; this is not a full production schema replay.
ROOT="$PWD"
DIR="$ROOT/.contribution-supabase-ci"
mkdir -p "$DIR/supabase/migrations"
cat > "$DIR/supabase/config.toml" <<'TOML'
project_id = "retirement-contribution-ci"
[db]
major_version = 17
TOML
cat > "$DIR/supabase/migrations/20261001000000_fixture_contribution_base.sql" <<'SQL'
CREATE TABLE public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  is_real_money boolean NOT NULL DEFAULT false
);
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  transaction_type text NOT NULL
);
CREATE TABLE public.contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  amount numeric NOT NULL,
  contribution_date date NOT NULL
);
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contributions" ON public.contributions
  TO authenticated USING ((select auth.uid())=user_id)
  WITH CHECK ((select auth.uid())=user_id);
SQL
cp "$ROOT/supabase/migrations/20261027170000_contribution_idempotency.sql" "$DIR/supabase/migrations/20261027170000_contribution_idempotency.sql"
echo "Fixture initialized with the exact repository contribution migration."
