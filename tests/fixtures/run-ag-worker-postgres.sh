#!/usr/bin/env bash
set -euo pipefail
# Requires Docker. Creates an ephemeral local PostgreSQL instance with synthetic data.
# Never reads Supabase credentials and never connects to a remote database.
cd "$(dirname "$0")/../.."
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for isolated AG PostgreSQL tests." >&2
  exit 2
fi
name="ag-worker-test-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$name" -e POSTGRES_PASSWORD=local_only -e POSTGRES_DB=ag_worker_test postgres:16-alpine >/dev/null
ready=0
for attempt in $(seq 1 45); do
  if docker exec "$name" pg_isready -U postgres -d ag_worker_test >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then echo "PostgreSQL did not start" >&2; exit 1; fi
run_sql() {
  docker exec -i "$name" psql -X -v ON_ERROR_STOP=1 -U postgres -d ag_worker_test
}
run_sql < tests/fixtures/ag-worker-postgres-schema.sql
run_sql < supabase/migrations/20261015010000_ag_worker_stage_leases.sql
run_sql < supabase/migrations/20261015020000_ag_worker_atomic_claim_guards.sql
run_sql < supabase/migrations/20261015030000_ag_worker_output_identity_guards.sql
# Race two independent connections before the sequential assertions claim the stage.
bash tests/fixtures/ag-worker-concurrent-claims.sh "$name"
# Clear only synthetic checkpoints in this disposable test database.
echo "truncate public.ag_cycle_stage_checkpoints;" | run_sql
# Session-local JWT role mock must be set in the SAME session as assertions.
{ echo "select set_config('request.jwt.claim.role','service_role',false);"; cat tests/fixtures/ag-worker-postgres-assertions.sql; } | run_sql
echo "AG worker isolated PostgreSQL assertions passed"
