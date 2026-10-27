#!/usr/bin/env bash
set -euo pipefail
PORT=3017
BASE="http://127.0.0.1:$PORT"
LOG="$(mktemp)"
pid=""
cleanup() { if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; rm -f "$LOG"; }
trap cleanup EXIT
start_server() {
  SHARED_CONTRIBUTION_POSTING_ENABLED="$1" npm run dev -- --hostname 127.0.0.1 --port "$PORT" >"$LOG" 2>&1 &
  pid=$!
  ready=0
  for i in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then cat "$LOG"; exit 1; fi
    if curl --silent --output /dev/null "$BASE/api/shared-capital/contributions"; then ready=1; break; fi
    sleep 1
  done
  if [[ "$ready" != 1 ]]; then cat "$LOG"; echo "Server did not start"; exit 1; fi
}
stop_server() { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; pid=""; }
check() {
  expected="$1"; shift
  actual=$(curl --silent --output /dev/null --write-out '%{http_code}' "$@")
  if [[ "$actual" != "$expected" ]]; then echo "Expected HTTP $expected, got $actual"; cat "$LOG"; exit 1; fi
}
# Run only one Next dev server per isolated CI job. Next.js uses a
# repository-wide dev lock even when the ports differ.
case "${SMOKE_MODE:-}" in
  disabled)
    start_server false
    check 503 -X POST "$BASE/api/shared-capital/contributions"
    check 503 -X POST "$BASE/api/shared-capital/contributions" -H "Origin: $BASE" -H 'Content-Type: application/json' -d '{"confirmedExternalDeposit":true,"amount":100,"contributionDate":"2026-10-27","idempotencyKey":"http_smoke_request_0001"}'
    ;;
  guards)
    start_server true
    check 403 -X POST "$BASE/api/shared-capital/contributions" -H 'Content-Type: application/json' -d '{}'
    check 403 -X POST "$BASE/api/shared-capital/contributions" -H 'Origin: https://other.example' -H 'Content-Type: application/json' -d '{}'
    # The application proxy may reject malformed content-type before the route.
    # Either way, an unsupported content-type must never pass to posting.
    check 403 -X POST "$BASE/api/shared-capital/contributions" -H "Origin: $BASE" -H 'Content-Type: text/plain' -d '{}'
    ;;
  *) echo "SMOKE_MODE must be disabled or guards"; exit 2 ;;
esac
echo "Live HTTP ${SMOKE_MODE} smoke tests passed"
