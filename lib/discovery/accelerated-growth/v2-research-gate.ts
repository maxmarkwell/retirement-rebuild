import type { V2PathAssessment } from "./v2-path-evaluators";
import type { SurvivalAssessment } from "./v2-financial-survival";
import { validateAgV2SourcedNumber, type AgV2SourcedNumber, type AgV2Source } from "./v2-source-contract";

export type V2ResearchGateResult = {
  eligible: boolean;
  status: "ELIGIBLE" | "RISK_REVIEW" | "INSUFFICIENT_DATA" | "NOT_QUALIFIED";
  reasons: string[];
  opportunity: V2PathAssessment;
  survival: SurvivalAssessment | null;
};

export function assessV2ResearchGate(
  opportunity: V2PathAssessment,
  survival: SurvivalAssessment | null,
  sources: readonly { name: string; evidence: AgV2SourcedNumber; allowed: readonly AgV2Source["kind"][]; expectedPeriod: string }[],
): V2ResearchGateResult {
  const reasons: string[] = [];
  if (opportunity.status !== "QUALIFIED") reasons.push("OPPORTUNITY_" + opportunity.status);
  if (!survival || survival.status === "UNVERIFIED") reasons.push("SURVIVAL_UNVERIFIED");
  if (survival?.status === "AT_RISK") reasons.push("SURVIVAL_AT_RISK");
  const required = opportunity.path === "TURNAROUND"
    ? ["operatingMargin", "freeCashFlow", "cash", "debt", "debtMaturities", "creditAvailability"]
    : ["marketCap", "independentEquityValue", "normalizedFreeCashFlow", "cash", "debt", "realizationMechanism"];
  for (const name of required) {
    if (sources.filter(source => source.name === name).length !== 1) {
      reasons.push("REQUIRED_SOURCE_MISSING_OR_DUPLICATE:" + name);
    }
  }
  const uniqueEvidence = new Map<string, string>();
  for (const source of sources) {
    const fingerprint = JSON.stringify([source.evidence.value, source.evidence.source?.url,
      source.evidence.source?.fiscalPeriod, source.evidence.calculationMethod]);
    const previous = uniqueEvidence.get(fingerprint);
    if (previous && previous !== source.name) {
      reasons.push("DUPLICATED_EVIDENCE:" + previous + ":" + source.name);
    }
    uniqueEvidence.set(fingerprint, source.name);
    const errors = validateAgV2SourcedNumber(source.evidence, source.allowed);
    if (source.evidence.source?.metric !== source.name) errors.push("METRIC_MISMATCH");
    if (!source.expectedPeriod.trim() || source.evidence.source?.fiscalPeriod !== source.expectedPeriod) errors.push("PERIOD_MISMATCH");
    for (const error of errors) reasons.push(source.name + ":" + error);
  }
  const status: V2ResearchGateResult["status"] =
    opportunity.status === "NOT_QUALIFIED" ? "NOT_QUALIFIED" :
    opportunity.status !== "QUALIFIED" || reasons.some(r => r.includes("UNVERIFIED") || r.includes("MISSING") || r.includes("INVALID") || r.includes("DISALLOWED") || r.includes("DUPLICATED") || r.includes("MISMATCH"))
      ? "INSUFFICIENT_DATA" :
    survival?.status === "AT_RISK" ? "RISK_REVIEW" : "ELIGIBLE";
  return { eligible: status === "ELIGIBLE", status, reasons, opportunity, survival };
}
