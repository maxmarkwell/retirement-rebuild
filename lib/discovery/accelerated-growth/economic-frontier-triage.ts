/**
 * Charter-aligned cheap economic triage for a supplied, date-consistent set
 * of opportunity hypotheses. This is NOT market-universe discovery.
 *
 * No arbitrary path quotas, composite scores, manufactured BUYs, or share sizing.
 * Pareto layers preserve important risk/reward trade-offs rather than flatten
 * incomparable businesses into false-precision scores.
 */
import {
  AG_ECONOMICS_KERNEL_VERSION,
  type AgEconomicsResult,
  type OpportunityPath,
} from "./economics-kernel";

export const AG_ECONOMIC_FRONTIER_VERSION = "ag-economic-frontier-v1";
export type EconomicCandidate = {
  hypothesisId: string;
  symbol: string;
  path: OpportunityPath;
  evidenceNotes: string;
  counterEvidence: string;
  realizationMechanism: string;
  scenarioAssumptionsRef: string;
  economics: AgEconomicsResult | null;
};
export type EconomicTriagePolicy = {
  asOf: string;
  maxQuoteAgeDays: number;
};
export type TriageEntry = {
  hypothesisId: string;
  symbol: string;
  path: OpportunityPath;
  researchStatus: "FRONTIER_RESEARCH" | "DOMINATED_RESEARCH" | "EVIDENCE_REQUIRED";
  reason: string;
  frontierTier: number | null;
  dominatedBy: string[];
  dominates: string[];
  adverseAnnualizedReturn: number | null;
  baseAnnualizedReturn: number | null;
  favorableAnnualizedReturn: number | null;
  priceUsd: number | null;
  assumptionRef: string | null;
};
export type EconomicTriage = {
  version: typeof AG_ECONOMIC_FRONTIER_VERSION;
  asOf: string;
  policy: EconomicTriagePolicy;
  candidatesSeen: number;
  hypothesesCompared: number;
  hypothesesWithEvidenceGaps: number;
  pathCoverage: Record<OpportunityPath, number>;
  distinctSymbolsSeen: number;
  frontiers: string[][];
  entries: TriageEntry[];
  decisionsIssued: 0;
  tradesEnabled: false;
  limitations: string[];
};

const paths: OpportunityPath[] = [
  "accelerating_fundamentals", "emerging_opportunity", "turnaround",
  "catalyst_driven", "valuation_dislocation",
];
const meaningful = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length >= 12 && v.trim().length <= 1000;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const date = (v: unknown) => typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
const dayMs = 86400000;
const returns = (e: AgEconomicsResult) => [
  e.outcomes.adverse.annualizedReturn,
  e.outcomes.base.annualizedReturn,
  e.outcomes.favorable.annualizedReturn,
] as const;
function dominates(a: AgEconomicsResult, b: AgEconomicsResult) {
  const ar = returns(a), br = returns(b);
  const eps = 1e-10;
  return ar.every((v, i) => v >= br[i] - eps) &&
    ar.some((v, i) => v > br[i] + eps);
}
function evidenceGap(c: EconomicCandidate, policy: EconomicTriagePolicy): string | null {
  const e = c.economics;
  if (!meaningful(c.evidenceNotes) || !meaningful(c.counterEvidence) ||
      !meaningful(c.realizationMechanism) || !meaningful(c.scenarioAssumptionsRef))
    return "UNSUPPORTED_THESIS_OR_ASSUMPTION_PROVENANCE";
  if (!e || e.version !== AG_ECONOMICS_KERNEL_VERSION ||
      e.resultType !== "SCENARIO_ECONOMICS_ONLY" ||
      e.recommendation !== null || e.executionEnabled !== false ||
      e.positionSizingEnabled !== false || e.symbol !== c.symbol ||
      e.thesisPath !== c.path || e.asOf !== policy.asOf)
    return "MISSING_OR_MISMATCHED_SCENARIO_ECONOMICS";
  if (!finite(e.priceUsd) || e.priceUsd <= 0 ||
      !Number.isInteger(e.horizonYears) || e.horizonYears < 1 ||
      !meaningful(e.evidence?.quoteEvidenceRef) ||
      !meaningful(e.evidence?.reconciledFactsRef) ||
      !e.outcomes || !e.outcomes.adverse || !e.outcomes.base || !e.outcomes.favorable)
    return "INCOMPLETE_PRICE_OR_SOURCE_EVIDENCE";
  const quoteMs = Date.parse(e.evidence.quoteCapturedAt);
  const cutoff = Date.parse(policy.asOf + "T23:59:59.999Z");
  if (!Number.isFinite(quoteMs) || quoteMs > cutoff ||
      cutoff - quoteMs > policy.maxQuoteAgeDays * dayMs)
    return "MISSING_FUTURE_OR_STALE_PRICE";
  for (const name of ["adverse","base","favorable"] as const) {
    const v = e.outcomes[name];
    if (v.scenario !== name || !finite(v.impliedPriceUsd) ||
        v.impliedPriceUsd < 0 || !finite(v.simpleReturn) ||
        !finite(v.annualizedReturn) ||
        Math.abs(v.simpleReturn - (v.impliedPriceUsd / e.priceUsd - 1)) > 1e-8 ||
        Math.abs(v.annualizedReturn -
          (Math.pow(v.impliedPriceUsd / e.priceUsd, 1 / e.horizonYears)-1)) > 1e-8)
      return "INVALID_OR_INCONSISTENT_SCENARIO_RETURNS";
  }
  if (!(e.outcomes.adverse.impliedPriceUsd < e.outcomes.base.impliedPriceUsd &&
      e.outcomes.base.impliedPriceUsd < e.outcomes.favorable.impliedPriceUsd))
    return "UNORDERED_SCENARIOS";
  return null;
}

export function triageAgEconomicHypotheses(
  candidates: EconomicCandidate[],
  policy: EconomicTriagePolicy,
): EconomicTriage {
  if (!policy || !date(policy.asOf) || !Number.isInteger(policy.maxQuoteAgeDays) ||
      policy.maxQuoteAgeDays < 0 || policy.maxQuoteAgeDays > 30 ||
      !Array.isArray(candidates) || candidates.length === 0 || candidates.length > 5000)
    throw new Error("AG_TRIAGE_INVALID_SCOPE");
  const seenIds = new Set<string>();
  const seenPathSymbol = new Set<string>();
  const pathCoverage = Object.fromEntries(paths.map(p => [p, 0])) as Record<OpportunityPath, number>;
  const entries: TriageEntry[] = [];
  const ready = new Map<string, AgEconomicsResult>();
  for (const c of candidates) {
    if (!c || !meaningful(c.hypothesisId) ||
        !/^[A-Z][A-Z0-9.-]{0,14}$/.test(c.symbol) ||
        !paths.includes(c.path) || seenIds.has(c.hypothesisId) ||
        seenPathSymbol.has(c.symbol + "|" + c.path))
      throw new Error("AG_TRIAGE_INVALID_OR_DUPLICATE_CANDIDATE");
    seenIds.add(c.hypothesisId);
    seenPathSymbol.add(c.symbol + "|" + c.path);
    pathCoverage[c.path]++;
    const gap = evidenceGap(c,policy);
    if (!gap && c.economics) ready.set(c.hypothesisId,c.economics);
    const result = gap ? null : c.economics;
    entries.push({
      hypothesisId:c.hypothesisId,symbol:c.symbol,path:c.path,
      researchStatus:gap?"EVIDENCE_REQUIRED":"FRONTIER_RESEARCH",
      reason:gap ?? "PARETO_SCREEN_PENDING",
      frontierTier:null,dominatedBy:[],dominates:[],
      adverseAnnualizedReturn:result?.outcomes.adverse.annualizedReturn ?? null,
      baseAnnualizedReturn:result?.outcomes.base.annualizedReturn ?? null,
      favorableAnnualizedReturn:result?.outcomes.favorable.annualizedReturn ?? null,
      priceUsd:result?.priceUsd ?? null,
      assumptionRef:gap?null:c.scenarioAssumptionsRef,
    });
  }
  const byId = new Map(entries.map(e=>[e.hypothesisId,e]));
  const pending = new Set(ready.keys());
  const frontiers: string[][] = [];
  let tier = 1;
  while (pending.size) {
    const frontier = [...pending].filter(id => {
      const candidate=ready.get(id)!;
      return ![...pending].some(other=>other!==id && dominates(ready.get(other)!,candidate));
    });
    if (frontier.length===0) throw new Error("AG_TRIAGE_UNRESOLVED_DOMINANCE");
    for (const id of frontier) {
      const entry=byId.get(id)!;
      entry.frontierTier=tier;
      entry.researchStatus=tier===1?"FRONTIER_RESEARCH":"DOMINATED_RESEARCH";
      entry.reason=tier===1?"NON_DOMINATED_RESEARCH_HYPOTHESIS":"ECONOMICALLY_DOMINATED_HYPOTHESIS";
      entry.dominatedBy=[...ready.keys()].filter(other=>
        other!==id && dominates(ready.get(other)!,ready.get(id)!));
      entry.dominates=[...ready.keys()].filter(other=>
        other!==id && dominates(ready.get(id)!,ready.get(other)!));
      pending.delete(id);
    }
    frontiers.push(frontier);
    tier++;
  }
  return {
    version:AG_ECONOMIC_FRONTIER_VERSION,asOf:policy.asOf,policy,
    candidatesSeen:candidates.length,hypothesesCompared:ready.size,
    hypothesesWithEvidenceGaps:candidates.length-ready.size,
    pathCoverage,distinctSymbolsSeen:new Set(candidates.map(c=>c.symbol)).size,
    frontiers,entries,decisionsIssued:0,tradesEnabled:false,
    limitations:[
      "A Pareto frontier identifies non-dominated conditional return cases, NOT good investments or BUY recommendations.",
      "All economics depend on independently supported, dated analyst assumptions; no scenario probabilities or hidden composite weights are supplied.",
      "Incomparable hypotheses remain on the same tier; no quotas, alphabetical stock sampling, or forced rankings are used.",
      "Single-hypothesis price sensitivity can be evaluated only when its business assumptions are held fixed across snapshots.",
      "This function screens supplied hypotheses only; it does not discover, search, or validate a broad market universe.",
    ],
  };
}
