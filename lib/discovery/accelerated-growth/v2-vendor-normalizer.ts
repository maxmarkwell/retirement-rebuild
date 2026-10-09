import type { V2VerifiedObservation } from "./v2-data-lineage";

/**
 * Strict, pure adapter for quarterly FMP-style income and cash-flow payloads.
 * The caller supplies verified transport metadata. No API keys, network calls,
 * persistence or assertion of filing authenticity occurs here.
 */
export type V2VendorQuarter = {
  fiscalYear?: string | number;
  period?: string;
  date?: string;
  revenue?: number;
  operatingIncome?: number;
  freeCashFlow?: number;
};
export type V2QuarterlyNormalizationInput = {
  issuerId: string;
  income: readonly V2VendorQuarter[];
  cashFlow: readonly V2VendorQuarter[];
  publishedAt: string;
  retrievedAt: string;
  documentId: string;
  extractionId: string;
  sourceUrl: string;
  publisher: string;
};
export type V2QuarterlyNormalizationResult = {
  observations: V2VerifiedObservation[];
  issues: string[];
};

function key(row: V2VendorQuarter): string | null {
  const year = String(row.fiscalYear ?? "").trim();
  const period = row.period?.trim().toUpperCase();
  return /^\d{4}$/.test(year) && /^Q[1-4]$/.test(period ?? "")
    ? year + "-" + period : null;
}
function unique(rows: readonly V2VendorQuarter[], kind: string, issues: string[]): Map<string, V2VendorQuarter> {
  const result = new Map<string, V2VendorQuarter>();
  for (const row of rows) {
    const k = key(row);
    if (!k) { issues.push("INVALID_FISCAL_QUARTER:" + kind); continue; }
    if (result.has(k)) issues.push("DUPLICATE_FISCAL_QUARTER:" + kind + ":" + k);
    else result.set(k, row);
  }
  return result;
}
export function normalizeV2VendorQuarters(input: V2QuarterlyNormalizationInput): V2QuarterlyNormalizationResult {
  const issues: string[] = [];
  if (!input.issuerId.trim() || !input.documentId.trim() || !input.extractionId.trim())
    issues.push("MISSING_TRANSPORT_PROVENANCE");
  const income = unique(input.income, "INCOME", issues);
  const cash = unique(input.cashFlow, "CASH_FLOW", issues);
  const observations: V2VerifiedObservation[] = [];
  for (const [period, row] of income) {
    const matched = cash.get(period);
    if (!matched) { issues.push("MISSING_MATCHED_CASH_FLOW:" + period); continue; }
    if (row.date && matched.date && row.date !== matched.date) {
      issues.push("FISCAL_END_DATE_MISMATCH:" + period);
      continue;
    }
    const metrics = [
      ["revenue", row.revenue],
      ["operatingIncome", row.operatingIncome],
      ["freeCashFlow", matched.freeCashFlow],
    ] as const;
    for (const [metric, value] of metrics) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push("MISSING_OR_INVALID_METRIC:" + period + ":" + metric);
        continue;
      }
      observations.push({
        metric, value, unit: "USD", fiscalPeriod: period, issuerId: input.issuerId,
        documentId: input.documentId, extractionId: input.extractionId,
        source: {
          url: input.sourceUrl, publisher: input.publisher,
          publishedAt: input.publishedAt, retrievedAt: input.retrievedAt,
          fiscalPeriod: period, metric, kind: "MARKET_DATA",
          documentId: input.documentId, issuerId: input.issuerId,
          unit: "USD", extractionId: input.extractionId,
        },
      });
    }
  }
  for (const period of cash.keys()) {
    if (!income.has(period)) issues.push("UNMATCHED_CASH_FLOW:" + period);
  }
  return { observations: issues.length ? [] : observations, issues };
}
