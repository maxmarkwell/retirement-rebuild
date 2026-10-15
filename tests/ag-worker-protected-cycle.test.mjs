import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const protectedId = "583809c1-7157-4ad4-b343-56acc332a145";
test("all worker SQL entrypoints reject the protected legacy cycle", () => {
  for (const path of [
    "supabase/migrations/20261015010000_ag_worker_stage_leases.sql",
    "supabase/migrations/20261015020000_ag_worker_atomic_claim_guards.sql",
    "supabase/migrations/20261015030000_ag_worker_output_identity_guards.sql",
  ]) {
    const sql = readFileSync(path, "utf8");
    const functions = [...sql.matchAll(/create or replace function public\.(ag_worker_(?:claim|renew|complete)_stage)\([\s\S]*?\n\$\$;/g)];
    assert.ok(functions.length > 0, path);
    for (const match of functions) {
      assert.ok(match[0].includes(protectedId), match[1]);
      assert.ok(match[0].includes("AG_WORKER_PROTECTED_CYCLE"), match[1]);
    }
  }
});
test("worker TypeScript guards run before admin client creation", () => {
  for (const path of [
    "lib/discovery/accelerated-growth/worker-stage-store.ts",
    "lib/discovery/accelerated-growth/worker-stage-preflight.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.ok(source.includes('from "./worker-protected-cycle"'));
    assert.ok(source.includes("assertAgWorkerCycleNotProtected(input.cycleId);"));
  }
});
