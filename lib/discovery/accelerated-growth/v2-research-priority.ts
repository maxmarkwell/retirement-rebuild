import type { V2PathAssessment } from "./v2-path-evaluators";

/**
 * Pure ordering of research opportunities, not a BUY ranking or portfolio rule.
 * No per-path quotas; WATCH reassessments cannot automatically occupy all slots.
 */
export type V2ResearchCandidate = {
  symbol: string;
  origin: "NEW_DISCOVERY" | "WATCH_REASSESSMENT";
  assessments: readonly V2PathAssessment[];
};
export type V2ResearchPriority = {
  symbol: string;
  origin: V2ResearchCandidate["origin"];
  strongestStatus: "QUALIFIED" | "WATCH";
  paths: string[];
  evidenceCoverage: number;
};
export type V2ResearchSelection = { selected: V2ResearchPriority[]; issues: string[] };
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/;
export function selectV2ResearchCandidates(
  candidates: readonly V2ResearchCandidate[],
  maxResearch: number,
): V2ResearchSelection {
  const issues: string[] = [];
  if (!Number.isSafeInteger(maxResearch) || maxResearch < 1 || maxResearch > 100)
    return { selected: [], issues: ["RESEARCH_INVALID_CAPACITY"] };
  if (candidates.length > 2000) return { selected: [], issues: ["RESEARCH_TOO_MANY_CANDIDATES"] };
  const seen = new Set<string>();
  const eligible: V2ResearchPriority[] = [];
  for (const candidate of candidates) {
    const symbol = candidate.symbol.trim().toUpperCase();
    if (!SYMBOL.test(symbol) || seen.has(symbol) ||
        !["NEW_DISCOVERY", "WATCH_REASSESSMENT"].includes(candidate.origin)) {
      issues.push("RESEARCH_INVALID_CANDIDATE:" + symbol);
      continue;
    }
    seen.add(symbol);
    if (!candidate.assessments.length ||
        candidate.assessments.some(a => a.version !== "ag-opportunity-v2" ||
          !Number.isFinite(a.evidenceCoverage) || a.evidenceCoverage < 0 ||
          a.evidenceCoverage > 100)) {
      issues.push("RESEARCH_INVALID_ASSESSMENT:" + symbol);
      continue;
    }
    const relevant = candidate.assessments.filter(a =>
      a.status === "QUALIFIED" || a.status === "WATCH");
    if (!relevant.length) continue;
    const strongestStatus = relevant.some(a => a.status === "QUALIFIED") ? "QUALIFIED" : "WATCH";
    const coverage = Math.max(...relevant.filter(a => a.status === strongestStatus)
      .map(a => a.evidenceCoverage));
    eligible.push({ symbol, origin: candidate.origin, strongestStatus,
      paths: [...new Set(relevant.map(a => a.path))].sort(), evidenceCoverage: coverage });
  }
  if (issues.length) return { selected: [], issues };
  eligible.sort((a, b) =>
    Number(b.strongestStatus === "QUALIFIED") - Number(a.strongestStatus === "QUALIFIED") ||
    b.evidenceCoverage - a.evidenceCoverage ||
    Number(b.origin === "NEW_DISCOVERY") - Number(a.origin === "NEW_DISCOVERY") ||
    a.symbol.localeCompare(b.symbol));
  return { selected: eligible.slice(0, maxResearch), issues: [] };
}
