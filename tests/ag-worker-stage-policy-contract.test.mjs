import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = readFileSync(process.cwd() + "/lib/discovery/accelerated-growth/worker-stage-policy.ts", "utf8");

test("worker policy requires paper-only scope and cross-day reconciliation", () => {
  assert.match(policy, /AG_WORKER_PAPER_SCOPE_REQUIRED/);
  assert.match(policy, /AG_WORKER_PREVIOUS_CYCLE_REQUIRES_RECONCILIATION/);
  assert.match(policy, /AG_WORKER_CYCLE_NOT_RUNNING/);
  assert.match(policy, /scope\.isRealMoney/);
  assert.match(policy, /scope\.executionMode !== "paper"/);
});

test("stage prerequisites fail closed for missing output and prior incomplete work", () => {
  assert.match(policy, /AG_WORKER_PREDECESSOR_NOT_DURABLE/);
  assert.match(policy, /checkpoint\.status !== "completed"/);
  assert.match(policy, /checkpoint\.output === null/);
  assert.match(policy, /AG_WORKER_DUPLICATE_CHECKPOINT/);
  assert.match(policy, /AG_WORKER_EXISTING_STAGE_REQUIRES_RECONCILIATION/);
});

test("lease check rejects expired or absent tokens", () => {
  assert.match(policy, /AG_WORKER_LEASE_NOT_VALID/);
  assert.match(policy, /Date\.parse\(input\.expiresAt\) <= input\.now\.getTime\(\)/);
  assert.match(policy, /!input\.claimToken/);
});

test("policy cannot execute trades or directly mutate the database", () => {
  assert.doesNotMatch(policy, /executeAgPaperBuy|executeAgDailyCycleTransactions|createAdminClient|\.from\(/);
});
