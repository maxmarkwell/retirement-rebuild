import type { V2VerifiedObservation } from "./v2-data-lineage";

/**
 * Read-only SEC companyfacts adapter. Input must come from a trusted SEC
 * transport that separately verifies origin and accession. No network here.
 * Quarterly flow metrics MUST represent a single quarter (not YTD).
 */
export type V2SecFact = {
  start?: string; end: string; val: number; accn: string;
  form: string; filed: string; fy?: number; fp?: string; frame?: string;
};
export type V2SecCompanyFacts = {
  cik: number;
  entityName: string;
  facts: { "us-gaap"?: Record<string, { units?: Record<string, V2SecFact[]> }> };
};
export type V2SecNormalizationInput = {
  companyfacts: V2SecCompanyFacts;
  accession: string;
  fiscalPeriod: string;
  fiscalEnd: string;
  retrievedAt: string;
  sourceUrl: string;
  extractionId: string;
};
export type V2SecNormalizationResult = { observations: V2VerifiedObservation[]; issues: string[] };

const METRICS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
  operatingIncome: ["OperatingIncomeLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capitalExpenditures: ["PaymentsToAcquirePropertyPlantAndEquipment"],
} as const;

function daySpan(start: string, end: string): number {
  const a = Date.parse(start + "T00:00:00Z");
  const b = Date.parse(end + "T00:00:00Z");
  return (b - a) / 86400000;
}
function quarterFrameMatches(frame: string | undefined, period: string): boolean {
  if (!frame) return true;
  const match = /^CY(\d{4})Q([1-4])$/.exec(frame);
  if (!match) return false;
  return period === match[1] + "-Q" + match[2];
}

export function normalizeV2SecCompanyFacts(input: V2SecNormalizationInput): V2SecNormalizationResult {
  const issues: string[] = [];
  const observations: V2VerifiedObservation[] = [];
  if (!Number.isInteger(input.companyfacts.cik) || input.companyfacts.cik <= 0 ||
      !input.accession.trim() || !input.extractionId.trim() ||
      !/^\d{4}-Q[1-4]$/.test(input.fiscalPeriod))
    issues.push("SEC_INVALID_IDENTITY_OR_PERIOD");
  if (!/^https:\/\/data\.sec\.gov\//.test(input.sourceUrl))
    issues.push("SEC_UNTRUSTED_SOURCE_URL");
  const issuerId = "CIK-" + String(input.companyfacts.cik).padStart(10, "0");
  const tags = input.companyfacts.facts["us-gaap"] ?? {};
  for (const [metric, candidates] of Object.entries(METRICS)) {
    const matching: { fact: V2SecFact; tag: string }[] = [];
    for (const tag of candidates) {
      for (const fact of tags[tag]?.units?.USD ?? []) {
        if (fact.accn !== input.accession || fact.end !== input.fiscalEnd ||
            !["10-Q", "10-K", "10-Q/A", "10-K/A"].includes(fact.form) ||
            !fact.start || !Number.isFinite(fact.val) ||
            !quarterFrameMatches(fact.frame, input.fiscalPeriod)) continue;
        const duration = daySpan(fact.start, fact.end);
        if (!Number.isFinite(duration) || duration < 70 || duration > 110) continue;
        matching.push({ fact, tag });
      }
    }
    if (matching.length !== 1) {
      issues.push("SEC_MISSING_OR_AMBIGUOUS_QUARTERLY_FACT:" + metric);
      continue;
    }
    const { fact, tag } = matching[0];
    observations.push({
      metric, value: fact.val, unit: "USD", fiscalPeriod: input.fiscalPeriod,
      issuerId, documentId: input.accession, extractionId: input.extractionId,
      source: {
        url: input.sourceUrl, publisher: "SEC EDGAR",
        publishedAt: fact.filed, retrievedAt: input.retrievedAt,
        fiscalPeriod: input.fiscalPeriod, metric, kind: "FILING",
        documentId: input.accession, issuerId, unit: "USD",
        extractionId: input.extractionId,
      },
    });
    if (tag !== candidates[0]) {
      // The fallback tag is explicit and reviewable, never silently preferred.
      issues.push("SEC_ALTERNATE_TAXONOMY_TAG:" + metric + ":" + tag);
    }
  }
  // Cash flow is often year-to-date in companyfacts. Never invent quarter FCF
  // by subtracting unrelated cumulative observations or assuming capex signs.
  return { observations: issues.length ? [] : observations, issues };
}
