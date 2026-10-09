import { strict as assert } from "node:assert";
import { selectV2ResearchCandidates, type V2ResearchCandidate } from "./v2-research-priority";
import type { V2PathAssessment } from "./v2-path-evaluators";
function assessment(path: V2PathAssessment["path"], status: V2PathAssessment["status"],
  evidenceCoverage: number): V2PathAssessment {
  return { version: "ag-opportunity-v2", path, status, evidenceCoverage,
    evidenceStrength: null, supportingFacts: [], contradictingFacts: [],
    missingCriticalEvidence: [], economicMechanism: "fixture", invalidationConditions: [] };
}
const candidate = (symbol: string, origin: V2ResearchCandidate["origin"],
  path: V2PathAssessment["path"], status: V2PathAssessment["status"],
  coverage: number): V2ResearchCandidate => ({
  symbol, origin, assessments: [assessment(path, status, coverage)],
});
const rows = [
  candidate("AAA", "WATCH_REASSESSMENT", "TURNAROUND", "WATCH", 100),
  candidate("BBB", "NEW_DISCOVERY", "CATALYST", "WATCH", 100),
  candidate("CCC", "NEW_DISCOVERY", "EMERGING_OPPORTUNITY", "QUALIFIED", 75),
  candidate("DDD", "WATCH_REASSESSMENT", "VALUATION_DISLOCATION", "QUALIFIED", 80),
  candidate("EEE", "NEW_DISCOVERY", "ACCELERATING_FUNDAMENTALS", "NOT_QUALIFIED", 100),
];
assert.deepEqual(selectV2ResearchCandidates(rows, 3).selected.map(x => x.symbol),
  ["DDD", "CCC", "BBB"]);
assert.deepEqual(selectV2ResearchCandidates([...rows].reverse(), 3).selected.map(x => x.symbol),
  ["DDD", "CCC", "BBB"]);
assert.deepEqual(selectV2ResearchCandidates(rows, 10).selected.map(x => x.symbol),
  ["DDD", "CCC", "BBB", "AAA"]);
assert.equal(selectV2ResearchCandidates(rows, 0).issues[0], "RESEARCH_INVALID_CAPACITY");
assert.equal(selectV2ResearchCandidates([...rows, rows[0]], 3).selected.length, 0);
assert.equal(selectV2ResearchCandidates([...rows, rows[0]], 3).issues[0],
  "RESEARCH_INVALID_CANDIDATE:AAA");
assert.equal(selectV2ResearchCandidates([
  candidate("BAD!", "NEW_DISCOVERY", "CATALYST", "WATCH", 80),
], 3).selected.length, 0);
assert.equal(selectV2ResearchCandidates([
  candidate("OK", "NEW_DISCOVERY", "CATALYST", "WATCH", Number.NaN),
], 3).selected.length, 0);
assert.deepEqual(selectV2ResearchCandidates([{
  symbol: "MULTI", origin: "NEW_DISCOVERY",
  assessments: [assessment("CATALYST", "WATCH", 60),
    assessment("TURNAROUND", "QUALIFIED", 90)],
}], 1).selected[0].paths, ["CATALYST", "TURNAROUND"]);
