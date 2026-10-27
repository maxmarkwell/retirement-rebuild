#!/usr/bin/env bash
set -euo pipefail
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -f tests/shared-contribution-rls/setup.sql
# Simulate an authenticated second user attempting to insert under another user ID.
if psql -X -v ON_ERROR_STOP=1 -q -c "BEGIN; SET LOCAL ROLE contribution_app; SELECT set_config('app.test_user_id','user-b',true); INSERT INTO contribution_rls_test(user_id,portfolio_id,amount,contribution_date,idempotency_key) VALUES ('user-a','real-a',100,'2026-10-27','foreign_owner_0001'); COMMIT;" >/dev/null 2>&1; then
  echo "RLS unexpectedly allowed cross-user contribution"; exit 1
fi
count=$(psql -X -At -c "SELECT count(*) FROM contribution_rls_test;")
test "$count" = 1 || { echo "Cross-user rejected write changed row count"; exit 1; }
echo "Isolated PostgreSQL RLS ownership checks passed"
