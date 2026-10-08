/**
 * Discovery v2: pure, side-effect-free fiscal-quarter evidence normalization.
 * No network, database, AI, or execution dependencies.
 */
export type V2QuarterlyStatement = {
  date?: string | null;
  fiscalYear?: string | number | null;
  period?: string | null;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingCashFlow?: number | null;
  capitalExpenditure?: number | null;
  capitalExpenditures?: number | null;
  freeCashFlow?: number | null;
};
export type V2Quarter = {
  key: string;
  date: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  operatingMarginPct: number | null;
  freeCashFlow: number | null;
  freeCashFlowMarginPct: number | null;
  cashFlowMatched: boolean;
  flags: string[];
};
export type V2QuarterlyEvidence = {
  version: "ag-quarterly-evidence-v2";
  quarters: V2Quarter[];
  unmatchedCashFlowPeriods: string[];
  issues: string[];
};

const finite = (x: number | null | undefined): number | null =>
  typeof x === "number" && Number.isFinite(x) ? x : null;

export function fiscalQuarterKey(row: V2QuarterlyStatement): string | null {
  const year = String(row.fiscalYear ?? "").trim();
  const period = String(row.period ?? "").trim().toUpperCase();
  if (!/^\d{4}$/.test(year) || !/^Q[1-4]$/.test(period)) return null;
  return year + "-" + period;
}

function pct(numerator: number | null, denominator: number | null): number | null {
  return numerator == null || denominator == null || denominator <= 0
    ? null : (numerator / denominator) * 100;
}

export function normalizeAgQuarterlyEvidence(
  income: readonly V2QuarterlyStatement[],
  cashFlow: readonly V2QuarterlyStatement[],
): V2QuarterlyEvidence {
  const issues: string[] = [];
  const cashByKey = new Map<string, V2QuarterlyStatement>();
  const ambiguousCashKeys = new Set<string>();
  for (const row of cashFlow) {
    const key = fiscalQuarterKey(row);
    if (!key) { issues.push("CASH_FLOW_MISSING_FISCAL_KEY"); continue; }
    if (cashByKey.has(key)) {
      ambiguousCashKeys.add(key);
      issues.push("DUPLICATE_CASH_FLOW_PERIOD:" + key);
    } else cashByKey.set(key, row);
  }

  const seenIncome = new Set<string>();
  const quarters: V2Quarter[] = [];
  for (const row of income) {
    const key = fiscalQuarterKey(row);
    if (!key) { issues.push("INCOME_MISSING_FISCAL_KEY"); continue; }
    if (seenIncome.has(key)) { issues.push("DUPLICATE_INCOME_PERIOD:" + key); continue; }
    seenIncome.add(key);
    const flags: string[] = [];
    const cash = ambiguousCashKeys.has(key) ? undefined : cashByKey.get(key);
    if (!cash) flags.push(ambiguousCashKeys.has(key) ? "AMBIGUOUS_CASH_FLOW" : "MISSING_CASH_FLOW");
    const revenue = finite(row.revenue);
    const operatingIncome = finite(row.operatingIncome);
    const vendorFcf = finite(cash?.freeCashFlow);
    const ocf = finite(cash?.operatingCashFlow);
    const capex = finite(cash?.capitalExpenditure ?? cash?.capitalExpenditures);
    // Vendor capex sign is not assumed. Without vendor FCF, do not
    // derive FCF until source-specific capex conventions are validated.
    const freeCashFlow = vendorFcf;
    if (cash && freeCashFlow == null) flags.push("FCF_UNAVAILABLE");
    if (cash && vendorFcf == null && ocf != null && capex != null) flags.push("CAPEX_SIGN_UNVERIFIED");
    quarters.push({
      key, date: row.date ?? null, revenue, operatingIncome,
      operatingMarginPct: pct(operatingIncome, revenue),
      freeCashFlow, freeCashFlowMarginPct: pct(freeCashFlow, revenue),
      cashFlowMatched: Boolean(cash), flags,
    });
  }
  quarters.sort((a, b) => b.key.localeCompare(a.key));
  const unmatchedCashFlowPeriods = [...cashByKey.keys()]
    .filter(key => !seenIncome.has(key) || ambiguousCashKeys.has(key)).sort();
  return { version: "ag-quarterly-evidence-v2", quarters, unmatchedCashFlowPeriods, issues };
}

export type V2Trend = {
  latest: number | null;
  previous: number | null;
  change: number | null;
  consecutive: boolean;
  reason: string | null;
};

/** Strict adjacent-quarter change; never compress missing values or periods. */
export function adjacentQuarterChange(
  evidence: V2QuarterlyEvidence,
  metric: "operatingMarginPct" | "freeCashFlowMarginPct",
): V2Trend {
  const [latest, previous] = evidence.quarters;
  if (!latest || !previous) return { latest: latest?.[metric] ?? null, previous: null, change: null, consecutive: false, reason: "MISSING_QUARTER" };
  const [yearA, quarterA] = latest.key.split("-Q").map(Number);
  const [yearB, quarterB] = previous.key.split("-Q").map(Number);
  const consecutive = yearA * 4 + quarterA - (yearB * 4 + quarterB) === 1;
  const a = latest[metric], b = previous[metric];
  return {
    latest: a, previous: b,
    change: consecutive && a != null && b != null ? a - b : null,
    consecutive,
    reason: !consecutive ? "NONCONSECUTIVE_PERIODS" : a == null || b == null ? "MISSING_METRIC" : null,
  };
}
