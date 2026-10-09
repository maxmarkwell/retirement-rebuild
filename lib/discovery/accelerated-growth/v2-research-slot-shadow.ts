import { selectV2ResearchCandidates, type V2ResearchCandidate,
  type V2ResearchPriority } from "./v2-research-priority";

/**
 * Offline research-slot shadow comparison. Does not change daily-cycle
 * scheduling, mutate WATCH records, call AI, or execute transactions.
 */
export type V2ResearchSlotShadowRequest = {
  pipelineVersion: "ag-opportunity-v2";
  runId: string;
  capacity: number;
  v1SelectedSymbols: readonly string[];
  candidates: readonly V2ResearchCandidate[];
};
export type V2ResearchSlotShadowResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; pipelineVersion: "ag-opportunity-v2"; runId: string;
      v1SelectedSymbols: string[]; v2Selected: V2ResearchPriority[];
      overlap: string[]; newlySelected: string[]; displacedV1: string[];
      v1WatchCount: number; v2WatchCount: number; v2NewDiscoveryCount: number };

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/;
export function compareV2ResearchSlots(
  request: V2ResearchSlotShadowRequest,
): V2ResearchSlotShadowResult {
  const issues: string[] = [];
  if (request.pipelineVersion !== "ag-opportunity-v2")
    issues.push("SLOT_SHADOW_INVALID_VERSION");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(request.runId))
    issues.push("SLOT_SHADOW_INVALID_RUN_ID");
  if (!Number.isSafeInteger(request.capacity) || request.capacity < 1 ||
      request.capacity > 100)
    issues.push("SLOT_SHADOW_INVALID_CAPACITY");
  if (request.v1SelectedSymbols.length > request.capacity)
    issues.push("SLOT_SHADOW_V1_EXCEEDS_CAPACITY");
  const v1 = request.v1SelectedSymbols.map(s => s.trim().toUpperCase());
  if (new Set(v1).size !== v1.length || v1.some(s => !SYMBOL.test(s)))
    issues.push("SLOT_SHADOW_INVALID_V1_SYMBOLS");
  const selected = selectV2ResearchCandidates(request.candidates, request.capacity);
  issues.push(...selected.issues);
  const origins = new Map<string, V2ResearchCandidate["origin"]>();
  for (const candidate of request.candidates)
    origins.set(candidate.symbol.trim().toUpperCase(), candidate.origin);
  if (v1.some(symbol => !origins.has(symbol)))
    issues.push("SLOT_SHADOW_MISSING_V1_CANDIDATE");
  if (issues.length) return { accepted: false, issues };
  const v1Set = new Set(v1);
  const v2Set = new Set(selected.selected.map(x => x.symbol));
  return {
    accepted: true, pipelineVersion: "ag-opportunity-v2", runId: request.runId,
    v1SelectedSymbols: v1,
    v2Selected: selected.selected,
    overlap: selected.selected.filter(x => v1Set.has(x.symbol)).map(x => x.symbol),
    newlySelected: selected.selected.filter(x => !v1Set.has(x.symbol)).map(x => x.symbol),
    displacedV1: v1.filter(symbol => !v2Set.has(symbol)),
    v1WatchCount: v1.filter(symbol => origins.get(symbol) === "WATCH_REASSESSMENT").length,
    v2WatchCount: selected.selected.filter(x => x.origin === "WATCH_REASSESSMENT").length,
    v2NewDiscoveryCount: selected.selected.filter(x => x.origin === "NEW_DISCOVERY").length,
  };
}
