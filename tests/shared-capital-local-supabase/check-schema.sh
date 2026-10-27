#!/usr/bin/env bash
set -euo pipefail
# This uses only local Supabase. NEVER run supabase link or db push here.
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF to_regclass('public.portfolios') IS NULL THEN RAISE EXCEPTION 'Missing local portfolios table'; END IF;
 IF to_regclass('public.contributions') IS NULL THEN RAISE EXCEPTION 'Missing local contributions table'; END IF;
 IF to_regclass('public.transactions') IS NULL THEN RAISE EXCEPTION 'Missing local transactions table'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contributions' AND column_name='idempotency_key') THEN
   RAISE EXCEPTION 'Local contribution idempotency migration missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='contributions' AND indexname='contributions_user_idempotency_key_uidx') THEN
   RAISE EXCEPTION 'Local unique contribution index missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contributions' AND column_name='external_deposit_reference') THEN
   RAISE EXCEPTION 'Local external deposit reference migration missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='contributions' AND indexname='contributions_user_external_reference_uidx') THEN
   RAISE EXCEPTION 'Local external reference uniqueness index missing';
 END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.contributions'::regclass) THEN
   RAISE EXCEPTION 'Contribution RLS is not enabled locally';
 END IF;
END $$;
SQL
echo "Local Supabase shared-capital schema readiness passed; no deposits created."
