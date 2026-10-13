import { strict as assert } from "node:assert";
import { compareV2ResearchSlots } from "./v2-research-slot-shadow";
import type { V2ResearchCandidate } from "./v2-research-priority";
import type { V2PathAssessment } from "./v2-path-evaluators";
function candidate(symbol: string, origin: V2ResearchCandidate["origin"],
  status: V2PathAssessment["status"], coverage: number): V2ResearchCandidate {
  return { symbol, origin, assessments: [{
    version: "ag-opportunity-v2", path: "TURNAROUND", status, evidenceCoverage: coverage,
    evidenceStrength: null, supportingFacts: [], contradictingFacts: [],
    missingCriticalEvidence: [], economicMechanism: "test", invalidationConditions: [],
  }] };
}
const candidates = [
  candidate("OLD1", "WATCH_REASSESSMENT", "WATCH", 100),
  candidate("OLD2", "WATCH_REASSESSMENT", "WATCH", 90),
  candidate("NEW1", "NEW_DISCOVERY", "QUALIFIED", 85),
  candidate("NEW2", "NEW_DISCOVERY", "QUALIFIED", 80),
  candidate("NEW3", "NEW_DISCOVERY", "WATCH", 100),
];
const base = { pipelineVersion: "ag-opportunity-v2" as const, runId: "shadow_run_001",
  capacity: 3, v1SelectedSymbols: ["OLD1", "OLD2", "NEW1"], candidates };
const result = compareV2ResearchSlots(base);
assert.equal(result.accepted, true);
if (result.accepted) {
  assert.deepEqual(result.v2Selected.map(x => x.symbol), ["NEW1", "NEW2", "NEW3"]);
  assert.deepEqual(result.overlap, ["NEW1"]);
  assert.deepEqual(result.newlySelected, ["NEW2", "NEW3"]);
  assert.deepEqual(result.displacedV1, ["OLD1", "OLD2"]);
  assert.equal(result.v1WatchCount, 2);
  assert.equal(result.v2WatchCount, 0);
  assert.equal(result.v2NewDiscoveryCount, 3);
}
assert.deepEqual(compareV2ResearchSlots({ ...base, candidates: [...candidates].reverse() }), result);
const rejected = (request: typeof base, issue: string) => {
  const value = compareV2ResearchSlots(request);
  assert.equal(value.accepted, false);
  if (!value.accepted) assert.ok(value.issues.includes(issue), issue);
};
rejected({ ...base, pipelineVersion: "ag-opportunity-v1" as typeof base.pipelineVersion },
  "SLOT_SHADOW_INVALID_VERSION");
rejected({ ...base, runId: "bad" }, "SLOT_SHADOW_INVALID_RUN_ID");
rejected({ ...base, capacity: 2 }, "SLOT_SHADOW_V1_EXCEEDS_CAPACITY");
rejected({ ...base, v1SelectedSymbols: ["OLD1", "OLD1"] }, "SLOT_SHADOW_INVALID_V1_SYMBOLS");
rejected({ ...base, v1SelectedSymbols: ["UNKNOWN"] }, "SLOT_SHADOW_MISSING_V1_CANDIDATE");
rejected({ ...base, candidates: [...candidates, candidates[0]] },
  "RESEARCH_INVALID_CANDIDATE:OLD1");

const watchWins = compareV2ResearchSlots({
  ...base, capacity: 1, v1SelectedSymbols: ["OLD1"],
  candidates: [candidate("OLD1", "WATCH_REASSESSMENT", "QUALIFIED", 100),
    candidate("NEW1", "NEW_DISCOVERY", "WATCH", 100)],
});
assert.equal(watchWins.accepted, true);
if (watchWins.accepted) {
  assert.deepEqual(watchWins.v2Selected.map(x => x.symbol), ["OLD1"]);
  assert.equal(watchWins.v2NewDiscoveryCount, 0);
}
const equalPriority = compareV2ResearchSlots({
  ...base, capacity: 1, v1SelectedSymbols: ["OLD1"],
  candidates: [candidate("OLD1", "WATCH_REASSESSMENT", "WATCH", 100),
    candidate("NEW1", "NEW_DISCOVERY", "WATCH", 100)],
});
assert.equal(equalPriority.accepted, true);
if (equalPriority.accepted)
  assert.deepEqual(equalPriority.v2Selected.map(x => x.symbol), ["NEW1"]);
