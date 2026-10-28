#!/usr/bin/env bash
set -euo pipefail
LOG="$(mktemp)"
pid=""
cleanup(){ if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; rm -f "$LOG"; }
trap cleanup EXIT
STATUS="$(cd .contribution-supabase-ci && ../node_modules/.bin/supabase status -o json)"
URL="$(printf '%s' "$STATUS" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.API_URL||s.api_url')"
ANON="$(printf '%s' "$STATUS" | node -pe 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); s.ANON_KEY||s.anon_key')"
[[ "$URL" == http://127.0.0.1:* ]] || { echo "Refusing non-local Supabase"; exit 1; }
SHARED_CONTRIBUTION_POSTING_ENABLED=true SHARED_CONTRIBUTION_UI_ENABLED=true SHARED_CONTRIBUTION_BROWSER_TEST_ENABLED=true NEXT_PUBLIC_SUPABASE_URL="$URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON" npm run dev -- --hostname 0.0.0.0 --port 3029 >"$LOG" 2>&1 &
pid=$!
ready=0
for i in $(seq 1 70); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3029/shared-contribution-browser-test || true)" == "200" ]]; then ready=1; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then cat "$LOG"; exit 1; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { cat "$LOG"; exit 1; }
node tests/shared-contribution-browser/check.cjs || { cat "$LOG"; exit 1; }
