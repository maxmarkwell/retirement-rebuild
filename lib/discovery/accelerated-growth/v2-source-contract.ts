/** Metadata contract for externally sourced Discovery v2 financial evidence. */
export type AgV2Source = {
  url: string;
  publisher: string;
  publishedAt: string;
  retrievedAt: string;
  fiscalPeriod: string;
  /** Canonical metric label asserted by the source extraction process. */
  metric: string;
  kind: "FILING" | "MARKET_DATA" | "INDEPENDENT_ANALYSIS";
};
export type AgV2SourcedNumber = {
  value: number | null;
  source: AgV2Source | null;
  calculationMethod: string | null;
};
export function validateAgV2SourcedNumber(
  item: AgV2SourcedNumber,
  allowedKinds: readonly AgV2Source["kind"][],
): string[] {
  const errors: string[] = [];
  if (item.value == null || !Number.isFinite(item.value)) errors.push("INVALID_VALUE");
  if (!item.source) return [...errors, "MISSING_SOURCE"];
  let validUrl = false;
  try {
    const url = new URL(item.source.url);
    validUrl = url.protocol === "https:" && url.hostname.includes(".");
  } catch { /* invalid URL */ }
  if (!validUrl) errors.push("INVALID_SOURCE_URL");
  if (!item.source.publisher.trim()) errors.push("MISSING_PUBLISHER");
  if (!item.source.fiscalPeriod.trim()) errors.push("MISSING_PERIOD");
  if (!item.source.metric?.trim()) errors.push("MISSING_METRIC");
  if (!allowedKinds.includes(item.source.kind)) errors.push("DISALLOWED_SOURCE_KIND");
  const published = Date.parse(item.source.publishedAt);
  const retrieved = Date.parse(item.source.retrievedAt);
  if (!Number.isFinite(published) || !Number.isFinite(retrieved) || published > retrieved)
    errors.push("INVALID_SOURCE_DATES");
  if (!item.calculationMethod?.trim()) errors.push("MISSING_CALCULATION_METHOD");
  return errors;
}
