import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const migration=fs.readFileSync(new URL("../supabase/migration-candidates/20261007_ag_cycle_retry_attempts_candidate.sql",import.meta.url),"utf8");
const orchestrator=fs.readFileSync(new URL("../lib/discovery/accelerated-growth/resumable-cycle-orchestrator.ts",import.meta.url),"utf8");
const status=fs.readFileSync(new URL("../lib/discovery/accelerated-growth/daily-cycle-status.ts",import.meta.url),"utf8");
test("AG retries preserve prior cycle rows and create numbered attempts",()=>{
 assert.match(migration,/attempt_number integer not null default 1/);
 assert.match(migration,/cycle_date,attempt_number/);
 assert.match(orchestrator,/retryableFailed=existing\?\.status==="failed"/);
 assert.match(orchestrator,/attempt_number:\(existing\?\.attempt_number\?\?0\)\+1/);
 assert.doesNotMatch(orchestrator,/update\(\{[\s\S]{0,200}status:"running"[\s\S]{0,200}\}.*status.*failed/);
 assert.match(status,/order\("attempt_number", \{ ascending: false \}\)\.limit\(1\)\.maybeSingle/);
});
