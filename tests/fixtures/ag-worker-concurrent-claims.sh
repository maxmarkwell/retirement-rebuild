#!/usr/bin/env bash
set -euo pipefail
# Two independent database sessions contend for the same synthetic stage.
: "${1:?disposable Docker container name required}"
container="$1"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/claim.sql" <<'SQL'
\set ON_ERROR_STOP on
select set_config('request.jwt.claim.role','service_role',false);
select public.ag_worker_claim_stage('44444444-4444-4444-8444-444444444444'::uuid,'holding_review',60);
SQL
docker exec -i "$container" psql -X -A -t -U postgres -d ag_worker_test < "$tmp/claim.sql" > "$tmp/one.out" 2> "$tmp/one.err" &
one=$!
docker exec -i "$container" psql -X -A -t -U postgres -d ag_worker_test < "$tmp/claim.sql" > "$tmp/two.out" 2> "$tmp/two.err" &
two=$!
status_one=0; wait "$one" || status_one=$?
status_two=0; wait "$two" || status_two=$?
if [[ "$status_one" == 0 && "$status_two" != 0 ]]; then
  grep -q 'AG_WORKER_RECONCILIATION_REQUIRED' "$tmp/two.err"
elif [[ "$status_two" == 0 && "$status_one" != 0 ]]; then
  grep -q 'AG_WORKER_RECONCILIATION_REQUIRED' "$tmp/one.err"
else
  echo "Expected exactly one claim success; statuses: $status_one / $status_two" >&2
  cat "$tmp/one.err" "$tmp/two.err" >&2
  exit 1
fi
echo "AG_WORKER_CONCURRENT_CLAIM_PASS"
