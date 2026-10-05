import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("lib/discovery/accelerated-growth/daily-cycle-work.ts", "utf8");

test("legacy AG persistence cannot be enabled through environment configuration", () => {
  assert.doesNotMatch(source, /AG_ATOMIC_PERSISTENCE_READY/);
  assert.match(source, /function assertAgLegacyPersistenceDisabled\(\): void \{\s*throw new Error\(/);
  const guard = source.indexOf("assertAgLegacyPersistenceDisabled();");
  const firstWrite = source.indexOf("await persistAgResearchWatchlist(");
  assert.ok(guard >= 0 && firstWrite > guard, "guard must precede the first legacy write");
});

test("atomic watchlist adapter remains isolated from active runner", () => {
  const adapter = readFileSync("lib/discovery/accelerated-growth/watchlist-persistence-adapter.ts", "utf8");
  const runner = readFileSync("lib/discovery/accelerated-growth/daily-cycle-work.ts", "utf8");
  assert.match(adapter, /AgAmbiguousWatchWriteError/);
  assert.doesNotMatch(adapter, /createClient|supabase|fetch\(/);
  assert.doesNotMatch(runner, /watchlist-persistence-adapter/);
  assert.match(runner, /assertAgLegacyPersistenceDisabled\(\);/);
});

test("resumable persistence transport has no automatic replay path",()=>{
 const executor=readFileSync("lib/discovery/accelerated-growth/persistence-stage-executor.ts","utf8");
 const transport=readFileSync("lib/discovery/accelerated-growth/persistence-stage-supabase.ts","utf8");
 const recovery=readFileSync("lib/discovery/accelerated-growth/persistence-recovery-contract.ts","utf8");
 assert.doesNotMatch(executor,/retry|setTimeout|setInterval/i);
 assert.doesNotMatch(transport,/retry|setTimeout|setInterval/i);
 assert.doesNotMatch(recovery,/commitDecision|commitWatch|ag_commit_cycle_decision|ag_commit_watch_operation/);
 assert.match(recovery,/COMPLETE_ONLY/);
 assert.match(recovery,/MANUAL_RECONCILIATION/);
});
