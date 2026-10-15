import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const output = readFileSync(root + "/lib/discovery/accelerated-growth/worker-stage-output.ts", "utf8");
const store = readFileSync(root + "/lib/discovery/accelerated-growth/worker-stage-store.ts", "utf8");

test("stage output includes a version and cycle-stage identity", () => {
  assert.match(output, /AG_WORKER_OUTPUT_VERSION = 1/);
  assert.match(output, /value\.cycleId !== expected\.cycleId/);
  assert.match(output, /value\.stage !== expected\.stage/);
  assert.match(output, /AG_WORKER_OUTPUT_IDENTITY_MISMATCH/);
});

test("output requires timestamp and nonempty JSON-compatible payload", () => {
  assert.match(output, /AG_WORKER_OUTPUT_TIMESTAMP_INVALID/);
  assert.match(output, /Object\.keys\(value\.payload\)\.length === 0/);
  assert.match(output, /JSON\.stringify\(value\)/);
});

test("checkpoint completion validates the output before database RPC", () => {
  const validation = store.indexOf("validateAgWorkerStageOutput(input.output");
  const rpc = store.indexOf('admin.rpc("ag_worker_complete_stage"');
  assert.ok(validation >= 0 && rpc > validation);
  assert.match(store, /p_output: validatedOutput/);
});
