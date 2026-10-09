import { createHash } from "node:crypto";
import {
  type V2VendorScaleAttestation,
  verifyV2VendorScaleAttestations,
} from "./v2-vendor-scale-policy";

/**
 * Pure offline audit of supplied archive bytes. The caller is responsible for
 * independently obtaining the original provider document and real samples.
 * No network, credentials, persistence, or live vendor authorization.
 */
export type V2VendorScaleAuditArtifact = {
  endpoint: "income-statement" | "cash-flow-statement";
  specificationBytes: Uint8Array;
  /** Original provider response bytes, not constructed fixture objects. */
  sampleResponses: readonly Uint8Array[];
};
export function auditV2VendorScaleArtifacts(
  attestations: readonly V2VendorScaleAttestation[],
  artifacts: readonly V2VendorScaleAuditArtifact[],
  researchAsOf: string,
): string[] {
  const issues = verifyV2VendorScaleAttestations(attestations, researchAsOf);
  for (const endpoint of ["income-statement", "cash-flow-statement"] as const) {
    const attestation = attestations.filter(x => x.endpoint === endpoint);
    const archive = artifacts.filter(x => x.endpoint === endpoint);
    if (attestation.length !== 1 || archive.length !== 1) {
      issues.push("SCALE_AUDIT_MISSING_OR_DUPLICATE_ARTIFACT:" + endpoint);
      continue;
    }
    const [claim] = attestation;
    const [evidence] = archive;
    if (!evidence.specificationBytes.length ||
        evidence.specificationBytes.length > 2_000_000 ||
        createHash("sha256").update(evidence.specificationBytes).digest("hex") !==
          claim.specificationSha256)
      issues.push("SCALE_AUDIT_SPECIFICATION_DIGEST_MISMATCH:" + endpoint);
    if (evidence.sampleResponses.length < 2 ||
        evidence.sampleResponses.length !== claim.reviewedSampleCount ||
        evidence.sampleResponses.some(x => !x.length || x.length > 2_000_000))
      issues.push("SCALE_AUDIT_INVALID_SAMPLES:" + endpoint);
    else {
      for (const sample of evidence.sampleResponses) {
        try {
          const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sample));
          if (!Array.isArray(parsed) || !parsed.length ||
              parsed.some(row => !row || typeof row !== "object" || Array.isArray(row)))
            throw Error("invalid");
        } catch {
          issues.push("SCALE_AUDIT_INVALID_SAMPLE_JSON:" + endpoint);
          break;
        }
      }
    }
  }
  if (artifacts.length !== 2) issues.push("SCALE_AUDIT_UNEXPECTED_ARTIFACT_COUNT");
  // Structural checks only: no semantic proof of provider scale.
  return issues;
}
