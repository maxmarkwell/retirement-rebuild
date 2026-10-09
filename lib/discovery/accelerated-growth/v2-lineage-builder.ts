import { V2_PATH_SOURCE_POLICY } from "./v2-path-source-policy";
import { verifyV2Observation, type V2VerifiedObservation, type V2LineageExpectation } from "./v2-data-lineage";
import type { V2Path } from "./v2-path-evaluators";
import type { V2EvidenceRequirement } from "./v2-evidence-audit";

export type V2LineageBuildInput = {
  path: V2Path;
  issuerId: string;
  observations: readonly V2VerifiedObservation[];
  expectations: readonly V2LineageExpectation[];
  /** Explicit reconciliation tolerance; no automatic percentage fudge factor. */
  tolerances: Readonly<Record<string, number>>;
};
export type V2LineageBuildResult = {
  ready: boolean;
  requirements: V2EvidenceRequirement[];
  issues: string[];
};

/**
 * Builds research requirements from normalized observations, NOT candidate
 * research evidence. Callers must supply observations from a separate pipeline.
 * This is a pure contract/validation adapter; it cannot authenticate documents.
 */
export function buildV2LineageRequirements(input: V2LineageBuildInput): V2LineageBuildResult {
  const issues: string[] = [];
  const requirements: V2EvidenceRequirement[] = [];
  const policy = V2_PATH_SOURCE_POLICY[input.path];
  if (!input.issuerId.trim()) issues.push("LINEAGE_MISSING_ISSUER");
  const required = Object.keys(policy);
  for (const item of input.observations) {
    if (!required.includes(item.metric)) issues.push("LINEAGE_UNEXPECTED_OBSERVATION:" + item.metric);
  }
  for (const item of input.expectations) {
    if (!required.includes(item.metric)) issues.push("LINEAGE_UNEXPECTED_EXPECTATION:" + item.metric);
  }
  for (const metric of required) {
    const observations = input.observations.filter(x => x.metric === metric);
    const expectations = input.expectations.filter(x => x.metric === metric);
    if (observations.length !== 1 || expectations.length !== 1) {
      issues.push("LINEAGE_MISSING_OR_DUPLICATE:" + metric);
      continue;
    }
    const observation = observations[0];
    const expectation = expectations[0];
    if (expectation.issuerId !== input.issuerId)
      issues.push("LINEAGE_CROSS_ISSUER_EXPECTATION:" + metric);
    if (expectation.allowedKinds.length !== policy[metric].length ||
        expectation.allowedKinds.some(x => !policy[metric].includes(x)))
      issues.push("LINEAGE_POLICY_OVERRIDE:" + metric);
    for (const error of verifyV2Observation(observation, expectation))
      issues.push(error + ":" + metric);
    const tolerance = input.tolerances[metric];
    if (tolerance == null || !Number.isFinite(tolerance) || tolerance < 0)
      issues.push("LINEAGE_INVALID_TOLERANCE:" + metric);
    requirements.push({
      metric, expectedPeriod: expectation.fiscalPeriod, allowedKinds: policy[metric],
      expectedValue: observation.value, absoluteTolerance: tolerance ?? Number.NaN,
      observation, lineageExpectation: expectation,
    });
  }
  return { ready: issues.length === 0, requirements: issues.length === 0 ? requirements : [], issues };
}
