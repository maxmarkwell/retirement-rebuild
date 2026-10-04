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
