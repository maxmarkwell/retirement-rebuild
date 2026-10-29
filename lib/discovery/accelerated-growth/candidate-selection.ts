import type { AgDiscoveryCandidate } from "./discovery";
import type { AgPriorResearchWatch } from "./deep-research";

export type AgCandidateSelection = {
  symbols: string[];
  candidates: AgDiscoveryCandidate[];
};

/**
 * Choose a fixed ordered candidate manifest for one research cycle.
 * The caller must persist this manifest before dispatching detached workers;
 * it must not recompute the selection using changing portfolio state.
 */
export function selectAgResearchCandidates(input: {
  candidates: AgDiscoveryCandidate[];
  reassessSymbols: ReadonlySet<string>;
  priorWatches: ReadonlyMap<string, AgPriorResearchWatch>;
  maxCandidates: number;
}): AgCandidateSelection {
  const limit = Math.max(1, Math.min(Math.trunc(input.maxCandidates || 5), 5));
  const advance = input.candidates.filter(candidate => candidate.score.status === "ADVANCE");
  const watched = advance.filter(candidate => input.reassessSymbols.has(candidate.symbol.toUpperCase()));
  const fresh = advance.filter(candidate => !input.reassessSymbols.has(candidate.symbol.toUpperCase()));

  // Reassess the oldest unresolved WATCHes first, while keeping at least one
  // discovery slot for a new growth opportunity whenever one exists.
  watched.sort((a, b) => {
    const aWatch = input.priorWatches.get(a.symbol.toUpperCase());
    const bWatch = input.priorWatches.get(b.symbol.toUpperCase());
    if (aWatch && bWatch) {
      const age = Date.parse(aWatch.lastSeenAt) - Date.parse(bWatch.lastSeenAt);
      if (Number.isFinite(age) && age !== 0) return age;
    }
    if (aWatch !== undefined) return -1;
    if (bWatch !== undefined) return 1;
    return b.score.total - a.score.total || a.symbol.localeCompare(b.symbol);
  });
  fresh.sort((a, b) => b.score.total - a.score.total || a.symbol.localeCompare(b.symbol));

  const watchSlots = fresh.length > 0 ? Math.max(0, limit - 1) : limit;
  const candidates = [...watched.slice(0, watchSlots), ...fresh].slice(0, limit);
  const symbols = candidates.map(candidate => candidate.symbol.toUpperCase());
  if (new Set(symbols).size !== symbols.length) {
    throw new Error("AG_DUPLICATE_CANDIDATE_SELECTION");
  }
  return { symbols, candidates };
}

/**
 * Fail closed before executing or resuming a cycle. The manifest must be
 * persisted once by the coordinator and compared against all checkpoint rows.
 */
export function assertAgCandidateCheckpointManifest(input: {
  expectedSymbols: readonly string[];
  checkpoints: readonly { symbol: string; status: string }[];
}): void {
  const expected = input.expectedSymbols.map(s => s.toUpperCase());
  if (expected.length > 5 || new Set(expected).size !== expected.length ||
      expected.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s))) {
    throw new Error("AG_CANDIDATE_MANIFEST_INVALID");
  }
  // A checkpoint is authoritative evidence only for a selected symbol. An
  // unexpected or duplicate row must halt continuation before provider calls.
  const actual = input.checkpoints.map(row => row.symbol.toUpperCase());
  if (new Set(actual).size !== actual.length || actual.some(s => !expected.includes(s))) {
    throw new Error("AG_CANDIDATE_MANIFEST_UNEXPECTED_CHECKPOINT");
  }
  if (input.checkpoints.some(row => !["pending", "running", "completed", "needs_manual_review"].includes(row.status))) {
    throw new Error("AG_CANDIDATE_MANIFEST_UNKNOWN_STATUS");
  }
}

/**
 * Verify the durable selection record before running any candidate worker.
 * Never infer the selected set from completed checkpoints: a missing claim
 * must not silently shrink the cycle.
 */
export function assertAgPersistedCandidateSelection(input: {
  expectedSymbols: readonly string[];
  persistedSymbols: readonly string[];
}): void {
  const expected = input.expectedSymbols.map(s => s.toUpperCase());
  const persisted = input.persistedSymbols.map(s => s.toUpperCase());
  if (!expected.length || expected.length > 5 ||
      expected.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) ||
      new Set(expected).size !== expected.length ||
      persisted.length !== expected.length ||
      persisted.some((s, index) => s !== expected[index])) {
    throw new Error("AG_PERSISTED_SELECTION_MISMATCH");
  }
}
