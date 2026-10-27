#!/usr/bin/env bash
set -euo pipefail
LOG="$(mktemp)"
pid=""
cleanup(){ if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; rm -f "$LOG"; }
trap cleanup EXIT
STATUS="$(cd .contribution-supabase-ci && ../node_modules/.bin/supabase status -o json)"
URL="$(printf '%s' "$STATUS" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.API_URL||s.api_url')"
ANON="$(printf '%s' "$STATUS" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.ANON_KEY||s.anon_key')"
[[ "$URL" == http://127.0.0.1:* ]] || { echo "Supabase must be localhost"; exit 1; }
SHARED_CONTRIBUTION_POSTING_ENABLED=true NEXT_PUBLIC_SUPABASE_URL="$URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON" npm run dev -- --hostname 127.0.0.1 --port 3029 >"$LOG" 2>&1 &
pid=$!
ready=0
for i in $(seq 1 60); do
  if ! kill -0 "$pid" 2>/dev/null; then cat "$LOG"; exit 1; fi
  if curl -sf -o /dev/null http://127.0.0.1:3029/api/shared-capital/contributions; then ready=1; break; fi
  # Next returns 405 on GET, indicating request reached the endpoint.
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3029/api/shared-capital/contributions || true)"
  if [[ "$code" == 405 ]]; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { cat "$LOG"; echo "Next server failed to become ready"; exit 1; }
node tests/shared-capital-endpoint-http/check.cjs || { cat "$LOG"; exit 1; }
