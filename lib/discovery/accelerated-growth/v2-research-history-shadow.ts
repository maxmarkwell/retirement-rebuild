import { compareV2ResearchSlots, type V2ResearchSlotShadowRequest,
  type V2ResearchSlotShadowResult } from "./v2-research-slot-shadow";

/**
 * Pure multi-cycle comparison of already-captured v1 selections and v2
 * candidate assessments. No claims of returns, causal lift, or live readiness.
 */
export type V2ResearchHistoryRequest = {
  pipelineVersion: "ag-opportunity-v2";
  cycles: readonly (V2ResearchSlotShadowRequest & {
    capturedAt: string;
    researchAsOf: string;
  })[];
};
export type V2ResearchHistoryResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; pipelineVersion: "ag-opportunity-v2";
      cycleCount: number; totalV1Slots: number; totalV2Slots: number;
      totalOverlap: number; totalNewlySelected: number; totalDisplacedV1: number;
      totalV1WatchSlots: number; totalV2WatchSlots: number;
      totalV2NewDiscoverySlots: number;
      uniqueV1Symbols: number; uniqueV2Symbols: number;
      v2PathSlotCounts: Record<string, number>;
      cyclesWithNewDiscovery: number; cyclesWithWatchReassessment: number;
      v1RepeatSlots: number; v2RepeatSlots: number;
      v1FirstSeenByCycle: number[]; v2FirstSeenByCycle: number[];
      cyclesWithNoV2NewDiscovery: number;
      cycles: Extract<V2ResearchSlotShadowResult, { accepted: true }>[] };

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function validTimestamp(value: string): boolean {
  if (!TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  const canonical = value.replace(/\.(\d{1,3})Z$/, (_, ms: string) =>
    "." + ms.padEnd(3, "0") + "Z").replace(/\.000Z$/, "Z");
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString().replace(/\.000Z$/, "Z") === canonical;
}
export function compareV2ResearchHistory(
  request: V2ResearchHistoryRequest,
): V2ResearchHistoryResult {
  const issues: string[] = [];
  if (request.pipelineVersion !== "ag-opportunity-v2")
    issues.push("HISTORY_INVALID_VERSION");
  if (!request.cycles.length || request.cycles.length > 100)
    issues.push("HISTORY_INVALID_CYCLE_COUNT");
  const ids = new Set<string>();
  const accepted: Extract<V2ResearchSlotShadowResult, { accepted: true }>[] = [];
  let previousAsOf = -Infinity;
  for (const [index, cycle] of request.cycles.entries()) {
    const prefix = "HISTORY_CYCLE_" + index + ":";
    if (ids.has(cycle.runId)) issues.push(prefix + "DUPLICATE_RUN_ID");
    ids.add(cycle.runId);
    if (!validTimestamp(cycle.capturedAt) || !validTimestamp(cycle.researchAsOf))
      issues.push(prefix + "INVALID_TIMESTAMP");
    else {
      const captured = Date.parse(cycle.capturedAt);
      const asOf = Date.parse(cycle.researchAsOf);
      if (asOf > captured) issues.push(prefix + "LOOKAHEAD");
      if (asOf <= previousAsOf) issues.push(prefix + "NONMONOTONIC_ASOF");
      previousAsOf = asOf;
    }
    const result = compareV2ResearchSlots(cycle);
    if (!result.accepted) issues.push(...result.issues.map(x => prefix + x));
    else accepted.push(result);
  }
  if (issues.length) return { accepted: false, issues };
  const v1Seen = new Set<string>();
  const v2Seen = new Set<string>();
  const v1FirstSeenByCycle: number[] = [];
  const v2FirstSeenByCycle: number[] = [];
  let v1RepeatSlots = 0;
  let v2RepeatSlots = 0;
  for (const cycle of accepted) {
    let v1First = 0;
    let v2First = 0;
    for (const symbol of cycle.v1SelectedSymbols) {
      if (v1Seen.has(symbol)) v1RepeatSlots++;
      else { v1Seen.add(symbol); v1First++; }
    }
    for (const candidate of cycle.v2Selected) {
      if (v2Seen.has(candidate.symbol)) v2RepeatSlots++;
      else { v2Seen.add(candidate.symbol); v2First++; }
    }
    v1FirstSeenByCycle.push(v1First);
    v2FirstSeenByCycle.push(v2First);
  }
  const sum = (fn: (cycle: (typeof accepted)[number]) => number) =>
    accepted.reduce((total, cycle) => total + fn(cycle), 0);
  return {
    accepted: true, pipelineVersion: "ag-opportunity-v2",
    cycleCount: accepted.length,
    totalV1Slots: sum(c => c.v1SelectedSymbols.length),
    totalV2Slots: sum(c => c.v2Selected.length),
    totalOverlap: sum(c => c.overlap.length),
    totalNewlySelected: sum(c => c.newlySelected.length),
    totalDisplacedV1: sum(c => c.displacedV1.length),
    totalV1WatchSlots: sum(c => c.v1WatchCount),
    totalV2WatchSlots: sum(c => c.v2WatchCount),
    totalV2NewDiscoverySlots: sum(c => c.v2NewDiscoveryCount),
    uniqueV1Symbols: new Set(accepted.flatMap(c => c.v1SelectedSymbols)).size,
    uniqueV2Symbols: new Set(accepted.flatMap(c => c.v2Selected.map(x => x.symbol))).size,
    v2PathSlotCounts: accepted.flatMap(c => c.v2Selected).reduce<Record<string, number>>(
      (counts, candidate) => {
        for (const path of candidate.paths) counts[path] = (counts[path] ?? 0) + 1;
        return counts;
      }, {}),
    cyclesWithNewDiscovery: accepted.filter(c => c.v2NewDiscoveryCount > 0).length,
    cyclesWithWatchReassessment: accepted.filter(c => c.v2WatchCount > 0).length,
    cyclesWithNoV2NewDiscovery: accepted.filter(c => c.v2NewDiscoveryCount === 0).length,
    v1RepeatSlots, v2RepeatSlots, v1FirstSeenByCycle, v2FirstSeenByCycle,
    cycles: accepted,
  };
}
