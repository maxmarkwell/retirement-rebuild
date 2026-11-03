/**
 * Accelerated Growth opportunity qualification v2.
 * Discovery evidence is not an Investment Committee recommendation.
 * Each independent path can qualify a candidate; no category receives a quota.
 */
export const AG_OPPORTUNITY_PATHS = [
  "ACCELERATING_FUNDAMENTALS",
  "EMERGING_OPPORTUNITY",
  "TURNAROUND",
  "CATALYST_DRIVEN",
  "VALUATION_DISLOCATION",
] as const;

export type AgOpportunityPath = (typeof AG_OPPORTUNITY_PATHS)[number];
export type AgEvidenceAssessment = {
  path: AgOpportunityPath;
  /** A verifiable fact, not a projected return or unsupported narrative. */
  evidence: string[];
  sourceUrls: string[];
  economicMechanism: string;
  counterEvidence: string[];
  invalidation: string[];
  evidenceHorizon: string;
  /** Independently assessed on a 0–100 scale; missing evidence is not neutral. */
  strength: number | null;
  coverage: number | null;
  significance: number | null;
  urgency: number | null;
  uncertainty: number | null;
};

export type AgOpportunityQualification = {
  symbol: string;
  version: "ag-opportunity-v2";
  status: "QUALIFIED" | "REVIEW" | "INSUFFICIENT_EVIDENCE";
  qualifiedPaths: AgOpportunityPath[];
  strongestPath: AgOpportunityPath | null;
  rankingScore: number | null;
  assessments: AgEvidenceAssessment[];
};

function validScore(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}
function meaningful(value: string) { return value.trim().length >= 12; }
function validSource(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && u.hostname.includes("."); }
  catch { return false; }
}
function sufficient(a: AgEvidenceAssessment) {
  return a.evidence.some(meaningful) &&
    a.sourceUrls.some(validSource) &&
    meaningful(a.economicMechanism) &&
    a.counterEvidence.some(meaningful) &&
    a.invalidation.some(meaningful) &&
    meaningful(a.evidenceHorizon) &&
    validScore(a.strength) && validScore(a.coverage) &&
    validScore(a.significance) && validScore(a.urgency) && validScore(a.uncertainty);
}
function rank(a: AgEvidenceAssessment): number {
  // Uncertainty is a research-priority consideration, not an automatic rejection.
  return Math.round((
    a.strength! * 0.32 +
    a.coverage! * 0.22 +
    a.significance! * 0.30 +
    a.urgency! * 0.10 +
    a.uncertainty! * 0.06
  ) * 10) / 10;
}

/** Path evidence alone opens further research, never authorizes BUY or execution. */
export function qualifyAgOpportunity(
  symbol: string,
  assessments: readonly AgEvidenceAssessment[],
): AgOpportunityQualification {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(normalized)) throw new Error("AG_OPPORTUNITY_INVALID_SYMBOL");
  const seen = new Set<AgOpportunityPath>();
  for (const a of assessments) {
    if (!AG_OPPORTUNITY_PATHS.includes(a.path) || seen.has(a.path)) throw new Error("AG_OPPORTUNITY_DUPLICATE_OR_UNKNOWN_PATH");
    seen.add(a.path);
  }
  const supported = assessments.filter(sufficient);
  const qualified = supported.filter(a => a.strength! >= 65 && a.coverage! >= 60);
  qualified.sort((a, b) => rank(b) - rank(a) || AG_OPPORTUNITY_PATHS.indexOf(a.path) - AG_OPPORTUNITY_PATHS.indexOf(b.path));
  return {
    symbol: normalized,
    version: "ag-opportunity-v2",
    status: qualified.length ? "QUALIFIED" : supported.length ? "REVIEW" : "INSUFFICIENT_EVIDENCE",
    qualifiedPaths: qualified.map(a => a.path),
    strongestPath: qualified[0]?.path ?? null,
    rankingScore: qualified.length ? rank(qualified[0]) : null,
    assessments: [...assessments],
  };
}
