/**
 * A monetary-scale claim is not evidence. This pure gate records the minimum
 * external audit required before vendor amounts can be normalized.
 * No live provider integration, credentials or persistence.
 */
export type V2VendorScaleAttestation = {
  provider: "FMP";
  endpoint: "income-statement" | "cash-flow-statement";
  unit: "USD";
  scale: "ONES";
  specificationUrl: string;
  reviewedAt: string;
  reviewer: string;
  /** SHA-256 digest of the independently archived specification artifact. */
  specificationSha256: string;
  /** Number of separately inspected real provider response samples. */
  reviewedSampleCount: number;
  effectiveFrom: string;
  effectiveThrough: string;
};
export function verifyV2VendorScaleAttestations(
  attestations: readonly V2VendorScaleAttestation[],
  researchAsOf: string,
): string[] {
  const issues: string[] = [];
  const asOf = Date.parse(researchAsOf);
  if (!Number.isFinite(asOf)) issues.push("SCALE_INVALID_RESEARCH_DATE");
  const endpoints = ["income-statement", "cash-flow-statement"] as const;
  for (const endpoint of endpoints) {
    const matches = attestations.filter(x => x.endpoint === endpoint);
    if (matches.length !== 1) {
      issues.push("SCALE_MISSING_OR_DUPLICATE_ATTESTATION:" + endpoint);
      continue;
    }
    const x = matches[0];
    if (x.provider !== "FMP" || x.unit !== "USD" || x.scale !== "ONES")
      issues.push("SCALE_UNSUPPORTED_UNIT:" + endpoint);
    let validUrl = false;
    try {
      const url = new URL(x.specificationUrl);
      validUrl = url.protocol === "https:" && !url.username && !url.password &&
        (url.hostname === "financialmodelingprep.com" ||
         url.hostname.endsWith(".financialmodelingprep.com"));
    } catch { /* invalid */ }
    if (!validUrl) issues.push("SCALE_UNTRUSTED_SPECIFICATION:" + endpoint);
    if (!/^[a-f0-9]{64}$/.test(x.specificationSha256) ||
        !Number.isSafeInteger(x.reviewedSampleCount) || x.reviewedSampleCount < 2)
      issues.push("SCALE_MISSING_AUDIT_ARTIFACTS:" + endpoint);
    const reviewed = Date.parse(x.reviewedAt);
    const from = Date.parse(x.effectiveFrom);
    const through = Date.parse(x.effectiveThrough);
    if (!x.reviewer.trim() || !Number.isFinite(reviewed) ||
        !Number.isFinite(from) || !Number.isFinite(through) ||
        reviewed > asOf || from > asOf || through < asOf || from > through)
      issues.push("SCALE_INVALID_ATTESTATION_DATES:" + endpoint);
  }
  if (attestations.length !== endpoints.length)
    issues.push("SCALE_UNEXPECTED_ATTESTATION_COUNT");
  return issues;
}
