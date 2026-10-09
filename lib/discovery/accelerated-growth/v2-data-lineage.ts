import type { AgV2Source } from "./v2-source-contract";

/**
 * A separate normalized observation is required for corroboration.
 * This contract does not fetch documents or establish source authenticity.
 */
export type V2VerifiedObservation = {
  metric: string;
  value: number;
  unit: "USD" | "USD_MILLIONS" | "PERCENT" | "COUNT" | "BOOLEAN" | "EPOCH_DAY";
  fiscalPeriod: string;
  issuerId: string;
  source: AgV2Source;
  /** Stable, non-empty identifier for the fetched source document or dataset. */
  documentId: string;
  /** Identity of the independent extraction/normalization process. */
  extractionId: string;
};

export type V2LineageExpectation = {
  metric: string;
  fiscalPeriod: string;
  issuerId: string;
  unit: V2VerifiedObservation["unit"];
  allowedKinds: readonly AgV2Source["kind"][];
};

const finite = (n: number) => Number.isFinite(n);

/**
 * Derives a comparison record from a separately supplied observation.
 * A caller must not use the candidate's own evidence as the observation.
 */
export function verifyV2Observation(
  observation: V2VerifiedObservation,
  expectation: V2LineageExpectation,
): string[] {
  const errors: string[] = [];
  if (observation.metric !== expectation.metric || observation.source.metric !== expectation.metric)
    errors.push("LINEAGE_METRIC_MISMATCH");
  if (observation.fiscalPeriod !== expectation.fiscalPeriod ||
      observation.source.fiscalPeriod !== expectation.fiscalPeriod)
    errors.push("LINEAGE_PERIOD_MISMATCH");
  if (!expectation.issuerId.trim() || observation.issuerId !== expectation.issuerId)
    errors.push("LINEAGE_ISSUER_MISMATCH");
  if (observation.unit !== expectation.unit) errors.push("LINEAGE_UNIT_MISMATCH");
  if (!finite(observation.value)) errors.push("LINEAGE_INVALID_VALUE");
  if (!observation.documentId.trim() || !observation.extractionId.trim())
    errors.push("LINEAGE_MISSING_DOCUMENT_OR_EXTRACTION");
  if (!expectation.allowedKinds.includes(observation.source.kind))
    errors.push("LINEAGE_SOURCE_KIND_DISALLOWED");
  const published = Date.parse(observation.source.publishedAt);
  const retrieved = Date.parse(observation.source.retrievedAt);
  if (!Number.isFinite(published) || !Number.isFinite(retrieved) || published > retrieved)
    errors.push("LINEAGE_INVALID_DATES");
  try {
    const url = new URL(observation.source.url);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) errors.push("LINEAGE_INVALID_URL");
  } catch { errors.push("LINEAGE_INVALID_URL"); }
  if (!observation.source.publisher.trim()) errors.push("LINEAGE_MISSING_PUBLISHER");
  return errors;
}
