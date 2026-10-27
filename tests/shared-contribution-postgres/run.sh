#!/usr/bin/env bash
set -euo pipefail
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -f tests/shared-contribution-postgres/setup.sql
# Fire simultaneous inserts using the same request key; exactly one must win.
for i in $(seq 1 12); do
  (psql -X -v ON_ERROR_STOP=1 -q -c "INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key) VALUES ('race-user','real-a',25,'2026-10-27','concurrent_request_0001');" >/dev/null 2>&1 || true) &
done
wait
count=$(psql -X -At -c "SELECT count(*) FROM contribution_test WHERE user_id='race-user' AND idempotency_key='concurrent_request_0001';")
test "$count" = 1 || { echo "Expected 1 concurrent contribution, got $count"; exit 1; }
if psql -X -v ON_ERROR_STOP=1 -q -c "INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key) VALUES ('user-a','real-a',999,'2026-10-27','deposit_unique_00001');" >/dev/null 2>&1; then
  echo "Conflicting request key was wrongly accepted"; exit 1
fi
if psql -X -v ON_ERROR_STOP=1 -q -c "INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key) VALUES ('user-a','real-a',1,'2026-10-27','invalid!');" >/dev/null 2>&1; then
  echo "Invalid key was accepted"; exit 1
fi
legacy=$(psql -X -At -c "SELECT count(*) FROM contribution_test WHERE user_id='legacy' AND idempotency_key IS NULL;")
test "$legacy" = 2
echo "Isolated PostgreSQL unique-index concurrency fixtures passed"
