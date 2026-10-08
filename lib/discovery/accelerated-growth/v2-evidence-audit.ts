import type { V2PathAssessment } from "./v2-path-evaluators";
import type { SurvivalAssessment } from "./v2-financial-survival";
import type { AgV2SourcedNumber, AgV2Source } from "./v2-source-contract";

export type V2EvidenceRequirement = {
  metric: string;
  expectedPeriod: string;
  allowedKinds: readonly AgV2Source["kind"][];
  /** Independent comparison value from normalized filings or market-data pipeline. */
  expectedValue: number | null;
  absoluteTolerance: number;
};

export type V2EvidenceRecord = {
  name: string;
  evidence: AgV2SourcedNumber;
  allowed: readonly AgV2Source["kind"][];
  expectedPeriod: string;
};

export function auditV2Evidence(
  opportunity: V2PathAssessment,
  survival: SurvivalAssessment | null,
  records: readonly V2EvidenceRecord[],
  requirements: readonly V2EvidenceRequirement[],
): string[] {
  const errors: string[] = [];
  const requiredNames = opportunity.path === "TURNAROUND"
    ? ["operatingMargin", "freeCashFlow", "cash", "debt", "debtMaturities", "creditAvailability"]
    : ["marketCap", "independentEquityValue", "normalizedFreeCashFlow", "cash", "debt", "realizationMechanism"];
  const requirementNames = new Set(requirements.map(x => x.metric));
  for (const metric of requiredNames) {
    if (!requirementNames.has(metric)) errors.push("MISSING_REQUIREMENT:" + metric);
  }
  for (const requirement of requirements) {
    if (!requiredNames.includes(requirement.metric)) errors.push("UNKNOWN_REQUIREMENT:" + requirement.metric);
    if (requirements.filter(x => x.metric === requirement.metric).length !== 1) errors.push("DUPLICATE_REQUIREMENT:" + requirement.metric);
    if (!Number.isFinite(requirement.absoluteTolerance) || requirement.absoluteTolerance < 0) errors.push("INVALID_TOLERANCE:" + requirement.metric);
    if (requirement.expectedValue == null || !Number.isFinite(requirement.expectedValue)) errors.push("UNVERIFIED_EXPECTED_VALUE:" + requirement.metric);
    const matches = records.filter(x => x.name === requirement.metric);
    if (matches.length !== 1) continue;
    const record = matches[0];
    if (record.expectedPeriod !== requirement.expectedPeriod || record.evidence.source?.fiscalPeriod !== requirement.expectedPeriod)
      errors.push("EXPECTED_PERIOD_MISMATCH:" + requirement.metric);
    if (record.allowed.length !== requirement.allowedKinds.length ||
        record.allowed.some(x => !requirement.allowedKinds.includes(x)))
      errors.push("SOURCE_KIND_POLICY_MISMATCH:" + requirement.metric);
    if (record.evidence.value != null && requirement.expectedValue != null &&
        Math.abs(record.evidence.value - requirement.expectedValue) > requirement.absoluteTolerance)
      errors.push("SOURCE_VALUE_MISMATCH:" + requirement.metric);
  }
  if (survival?.status === "SUPPORTED" && !requirements.some(x => x.metric === "debtMaturities" && x.expectedValue != null))
    errors.push("SURVIVAL_MATURITIES_NOT_CORROBORATED");
  return [...new Set(errors)];
}
