import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (name) => readFileSync(name, "utf8");

test("isolated AG decision ledger reader uses scoped read RPC only", () => {
  const reader = read("lib/discovery/accelerated-growth/atomic-persistence-ledger-reader.ts");
  const runner = read("lib/discovery/accelerated-growth/daily-cycle-work.ts");
  assert.match(reader, /supabase\.auth\.getUser\(\)/);
  assert.match(reader, /\.rpc\("ag_read_cycle_decision_ledger"/);
  assert.match(reader, /p_cycle_id: query\.cycleId/);
  assert.doesNotMatch(reader, /\.from\("ag_cycle_decision_writes"\)/);
  for (const key of ["user_id", "portfolio_id", "strategy_era_id"]) {
    assert.ok(reader.includes("row." + key));
  }
  assert.doesNotMatch(reader, /\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(runner, /atomic-persistence-ledger-reader/);
  assert.match(runner, /assertAgLegacyPersistenceDisabled\(\);/);
});

test("isolated AG watch recovery reader uses scoped read RPC and cannot mutate or reach active runner", () => {
  const reader = read("lib/discovery/accelerated-growth/watchlist-reconciliation-reader.ts");
  const runner = read("lib/discovery/accelerated-growth/daily-cycle-work.ts");
  assert.match(reader, /supabase\.auth\.getUser\(\)/);
  assert.match(reader, /\.rpc\("ag_read_cycle_watch_ledger"/);
  assert.match(reader, /p_cycle_id:query\.cycleId/);
  assert.doesNotMatch(reader, /\.from\("ag_cycle_watch_writes"\)/);
  for (const key of ["user_id", "portfolio_id", "strategy_era_id"]) {
    assert.ok(reader.includes("row." + key));
  }
  assert.match(reader, /\.rpc\("ag_verify_watch_operation_postcondition",args\)/);
  assert.doesNotMatch(reader, /\.(?:insert|update|upsert|delete)\(/);
  assert.doesNotMatch(reader, /ag_commit_watch_operation/);
  assert.doesNotMatch(runner, /watchlist-reconciliation-reader/);
  assert.match(runner, /assertAgLegacyPersistenceDisabled\(\);/);
});
