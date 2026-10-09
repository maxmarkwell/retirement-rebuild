/**
 * Canonical JSON equality for independently serialized archived evidence.
 * Arrays remain ordered; object keys are order-independent. Rejects unsupported
 * values and cycles rather than silently changing their meaning.
 */
export function canonicalV2ArchiveJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (typeof value !== "object") throw new Error("ARCHIVE_NON_JSON_VALUE");
  if (Array.isArray(value))
    return "[" + value.map(canonicalV2ArchiveJson).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(key =>
    JSON.stringify(key) + ":" + canonicalV2ArchiveJson(record[key])).join(",") + "}";
}
