import type { V2PathAssessment, V2Path, V2PathStatus } from "./v2-path-evaluators";

/** Pure, provisional screening only. No AI decisions, portfolio sizing or transactions. */
type Evidence = number | null;
const valid = (n: Evidence): n is number => n != null && Number.isFinite(n);
const result = (path: V2Path, status: V2PathStatus, checks: boolean[], positive: string[], negative: string[], missing: string[], mechanism: string, invalidation: string[]): V2PathAssessment => ({
  version: "ag-opportunity-v2", path, status, evidenceStrength: null,
  evidenceCoverage: Math.round(100 * checks.filter(Boolean).length / checks.length),
  supportingFacts: positive, contradictingFacts: negative, missingCriticalEvidence: missing,
  economicMechanism: mechanism, invalidationConditions: invalidation,
});

export type AccelerationEvidence = {
  latestRevenueGrowthPct: Evidence;
  priorRevenueGrowthPct: Evidence;
  latestOperatingMarginPct: Evidence;
  priorOperatingMarginPct: Evidence;
  latestFreeCashFlow: Evidence;
  consecutiveFiscalPeriodsVerified: boolean;
};
export function assessV2AcceleratingFundamentals(x: AccelerationEvidence): V2PathAssessment {
  const checks = [valid(x.latestRevenueGrowthPct), valid(x.priorRevenueGrowthPct),
    valid(x.latestOperatingMarginPct), valid(x.priorOperatingMarginPct),
    valid(x.latestFreeCashFlow), x.consecutiveFiscalPeriodsVerified];
  const missing = checks.map((ok, i) => ok ? "" : ["Latest revenue growth", "Prior revenue growth",
    "Latest operating margin", "Prior operating margin", "Latest free cash flow", "Consecutive fiscal-period verification"][i]).filter(Boolean);
  const acceleration = checks[0] && checks[1] ? x.latestRevenueGrowthPct! - x.priorRevenueGrowthPct! : null;
  const marginChange = checks[2] && checks[3] ? x.latestOperatingMarginPct! - x.priorOperatingMarginPct! : null;
  const positive = [acceleration != null && acceleration >= 5 ? "Revenue growth accelerated at least 5 percentage points" : "",
    marginChange != null && marginChange >= 0 ? "Operating margin held or improved" : "",
    checks[4] && x.latestFreeCashFlow! > 0 ? "Latest free cash flow positive" : ""].filter(Boolean);
  const negative = [marginChange != null && marginChange < -2 ? "Operating margin deteriorated more than 2 points" : "",
    checks[4] && x.latestFreeCashFlow! < 0 ? "Latest free cash flow negative" : ""].filter(Boolean);
  const status: V2PathStatus = checks.some(ok => !ok) ? "INSUFFICIENT_DATA" :
    acceleration! >= 5 && marginChange! >= 0 && x.latestFreeCashFlow! > 0 ? "QUALIFIED" :
    acceleration! > 0 ? "WATCH" : "NOT_QUALIFIED";
  return result("ACCELERATING_FUNDAMENTALS", status, checks, positive, negative, missing,
    "Revenue acceleration must translate into durable margins and cash generation.",
    ["Revenue acceleration reverses", "Margins weaken", "Cash generation turns negative"]);
}

export type EmergingEvidence = {
  commercialRevenue: Evidence;
  priorCommercialRevenue: Evidence;
  customerCount: Evidence;
  priorCustomerCount: Evidence;
  productInMarketVerified: boolean;
  repeatableUnitEconomicsVerified: boolean;
  consecutiveFiscalPeriodsVerified: boolean;
};
export function assessV2EmergingOpportunity(x: EmergingEvidence): V2PathAssessment {
  const checks = [valid(x.commercialRevenue) && x.commercialRevenue! >= 0,
    valid(x.priorCommercialRevenue) && x.priorCommercialRevenue! >= 0,
    valid(x.customerCount) && x.customerCount! >= 0,
    valid(x.priorCustomerCount) && x.priorCustomerCount! >= 0,
    x.productInMarketVerified, x.repeatableUnitEconomicsVerified, x.consecutiveFiscalPeriodsVerified];
  const missing = checks.map((ok, i) => ok ? "" : ["Commercial revenue", "Prior commercial revenue",
    "Customer count", "Prior customer count", "Market-available product evidence",
    "Repeatable unit economics evidence", "Consecutive fiscal-period verification"][i]).filter(Boolean);
  const growth = checks[0] && checks[1] && x.priorCommercialRevenue! > 0
    ? x.commercialRevenue! / x.priorCommercialRevenue! - 1 : null;
  const customersGrowing = checks[2] && checks[3] && x.customerCount! > x.priorCustomerCount!;
  const zeroBaseline = checks[1] && checks[3] &&
    (x.priorCommercialRevenue === 0 || x.priorCustomerCount === 0);
  const positive = [growth != null && growth >= .25 ? "Commercial revenue grew at least 25%" : "",
    customersGrowing ? "Customer adoption expanded" : "",
    zeroBaseline && checks[0] && x.commercialRevenue! > 0 ? "Early commercialization from a zero baseline requires follow-up validation" : "",
    x.repeatableUnitEconomicsVerified ? "Repeatable unit economics documented" : ""].filter(Boolean);
  const negative = [growth != null && growth < 0 ? "Commercial revenue declined" : "",
    checks[2] && checks[3] && x.customerCount! < x.priorCustomerCount! ? "Customer count declined" : ""].filter(Boolean);
  const status: V2PathStatus = checks.some(ok => !ok) ? "INSUFFICIENT_DATA" :
    zeroBaseline ? (x.commercialRevenue! > 0 && customersGrowing ? "WATCH" : "NOT_QUALIFIED") :
    growth != null && growth >= .25 && customersGrowing ? "QUALIFIED" :
    growth != null && growth > 0 && customersGrowing ? "WATCH" : "NOT_QUALIFIED";
  return result("EMERGING_OPPORTUNITY", status, checks, positive, negative, missing,
    "Commercial adoption must scale with evidence of repeatable unit economics.",
    ["Customer adoption reverses", "Unit economics fail to scale", "Commercial revenue contracts"]);
}

export type CatalystEvidence = {
  eventDate: string | null;
  assessmentDate: string;
  verifiedEvent: boolean;
  documentedEconomicImpact: boolean;
  independentlyCorroborated: boolean;
  companyCanFundExecution: boolean;
  invalidationTriggerDocumented: boolean;
};
export function assessV2Catalyst(x: CatalystEvidence): V2PathAssessment {
  const strictDate = (value: string | null): number | null => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
      ? parsed : null;
  };
  const assessment = strictDate(x.assessmentDate);
  const event = strictDate(x.eventDate);
  const validDates = assessment != null && event != null && event > assessment;
  const checks = [validDates, x.verifiedEvent, x.documentedEconomicImpact,
    x.independentlyCorroborated, x.companyCanFundExecution, x.invalidationTriggerDocumented];
  const missing = checks.map((ok, i) => ok ? "" : ["Future dated catalyst", "Verified event",
    "Documented economic impact", "Independent corroboration", "Execution funding",
    "Documented invalidation trigger"][i]).filter(Boolean);
  const status: V2PathStatus = checks.some(ok => !ok) ? "INSUFFICIENT_DATA" : "QUALIFIED";
  return result("CATALYST", status, checks,
    checks.every(Boolean) ? ["Verified future event with corroborated economic impact and funded execution"] : [],
    [], missing, "A dated event must create a defensible change in business economics.",
    ["Catalyst cancelled or delayed", "Expected economic impact fails to materialize", "Execution funding disappears"]);
}
