import { strict as assert } from "node:assert";
import { compareV2ResearchHistory } from "./v2-research-history-shadow";
import type { V2ResearchCandidate } from "./v2-research-priority";
const candidate = (symbol: string, origin: V2ResearchCandidate["origin"],
  status: "QUALIFIED" | "WATCH", coverage: number): V2ResearchCandidate => ({
  symbol, origin, assessments: [{
    version: "ag-opportunity-v2", path: "CATALYST", status,
    evidenceCoverage: coverage, evidenceStrength: null,
    supportingFacts: [], contradictingFacts: [], missingCriticalEvidence: [],
    economicMechanism: "fixture", invalidationConditions: [],
  }],
});
const first = {
  pipelineVersion: "ag-opportunity-v2" as const, runId: "cycle_001",
  capacity: 2, capturedAt: "2026-08-03T12:00:00Z",
  researchAsOf: "2026-08-02T12:00:00Z",
  v1SelectedSymbols: ["OLD", "NEW"],
  candidates: [candidate("OLD", "WATCH_REASSESSMENT", "WATCH", 80),
    candidate("NEW", "NEW_DISCOVERY", "QUALIFIED", 90),
    candidate("NEXT", "NEW_DISCOVERY", "QUALIFIED", 85)],
};
const second = {
  ...first, runId: "cycle_002",
  capturedAt: "2026-08-04T12:00:00Z",
  researchAsOf: "2026-08-03T12:00:00Z",
  v1SelectedSymbols: ["OLD", "NEXT"],
};
const base = { pipelineVersion: "ag-opportunity-v2" as const,
  cycles: [first, second] };
const result = compareV2ResearchHistory(base);
assert.equal(result.accepted, true);
if (result.accepted) {
  assert.equal(result.cycleCount, 2);
  assert.equal(result.totalV1Slots, 4);
  assert.equal(result.totalV2Slots, 4);
  assert.equal(result.totalOverlap, 2);
  assert.equal(result.totalNewlySelected, 2);
  assert.equal(result.totalDisplacedV1, 2);
  assert.equal(result.totalV1WatchSlots, 2);
  assert.equal(result.totalV2WatchSlots, 0);
  assert.equal(result.totalV2NewDiscoverySlots, 4);
  assert.equal(result.uniqueV1Symbols, 3);
  assert.equal(result.uniqueV2Symbols, 2);
  assert.deepEqual(result.v2PathSlotCounts, { CATALYST: 4 });
  assert.equal(result.cyclesWithNewDiscovery, 2);
  assert.equal(result.cyclesWithWatchReassessment, 0);
  assert.equal(result.cyclesWithNoV2NewDiscovery, 0);
  assert.equal(result.v1RepeatSlots, 1);
  assert.equal(result.v2RepeatSlots, 2);
  assert.deepEqual(result.v1FirstSeenByCycle, [2, 1]);
  assert.deepEqual(result.v2FirstSeenByCycle, [2, 0]);
}
function rejected(cycles: typeof base.cycles, issue: string) {
  const result = compareV2ResearchHistory({ ...base, cycles });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.ok(result.issues.some(x => x.includes(issue)), issue);
}
rejected([], "HISTORY_INVALID_CYCLE_COUNT");
rejected([first, { ...second, runId: "cycle_001" }], "DUPLICATE_RUN_ID");
rejected([second, first], "NONMONOTONIC_ASOF");
rejected([{ ...first, researchAsOf: "2026-08-05T12:00:00Z" }], "LOOKAHEAD");
rejected([{ ...first, capturedAt: "2026-02-30T12:00:00Z" }], "INVALID_TIMESTAMP");
rejected([{ ...first, capturedAt: "not-a-date" }], "INVALID_TIMESTAMP");
rejected([{ ...first, v1SelectedSymbols: ["MISSING"] }], "SLOT_SHADOW_MISSING_V1_CANDIDATE");
rejected([{ ...first, pipelineVersion: "ag-opportunity-v1" as typeof first.pipelineVersion }],
  "SLOT_SHADOW_INVALID_VERSION");

const milliseconds = compareV2ResearchHistory({
  ...base, cycles: [{ ...first, capturedAt: "2026-08-03T12:00:00.1Z",
    researchAsOf: "2026-08-02T12:00:00.12Z" }],
});
assert.equal(milliseconds.accepted, true);

const watchOnly = compareV2ResearchHistory({
  ...base, cycles: [{ ...first, capacity: 1, v1SelectedSymbols: ["OLD"],
    candidates: [candidate("OLD", "WATCH_REASSESSMENT", "QUALIFIED", 100),
      candidate("NEW", "NEW_DISCOVERY", "WATCH", 100)] }],
});
assert.equal(watchOnly.accepted, true);
if (watchOnly.accepted) {
  assert.equal(watchOnly.cyclesWithNoV2NewDiscovery, 1);
  assert.equal(watchOnly.cyclesWithWatchReassessment, 1);
  assert.deepEqual(watchOnly.v2FirstSeenByCycle, [1]);
}
