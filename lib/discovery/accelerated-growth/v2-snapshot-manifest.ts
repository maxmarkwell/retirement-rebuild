/**
 * Validates externally supplied point-in-time metadata before offline shadow
 * comparisons. This does not authenticate external records or prove that the
 * underlying financial data was complete.
 */
export type V2SnapshotManifest = {
  version: "v1" | "v2";
  snapshotId: string;
  capturedAt: string;
  universeId: string;
  universeSymbols: readonly string[];
  researchAsOf: string;
  pipelineVersion: string;
  fiscalPeriod: string;
};
export type V2SnapshotManifestCheck = { valid: boolean; issues: string[] };
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_SKEW_MS = 60 * 60 * 1000;
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/;
function parseUtc(value: string): number {
  if (!UTC.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().replace(".000Z", "Z") === value
    ? ms : NaN;
}
export function verifyV2SnapshotManifests(
  v1: V2SnapshotManifest, v2: V2SnapshotManifest,
  expectedSymbols: readonly string[],
): V2SnapshotManifestCheck {
  const issues: string[] = [];
  if (v1.version !== "v1" || v2.version !== "v2") issues.push("SHADOW_MANIFEST_VERSION");
  if (!v1.snapshotId.trim() || !v2.snapshotId.trim() || v1.snapshotId === v2.snapshotId)
    issues.push("SHADOW_MANIFEST_ID");
  if (!v1.universeId.trim() || v1.universeId !== v2.universeId)
    issues.push("SHADOW_UNIVERSE_ID_MISMATCH");
  if (v1.pipelineVersion !== "ag-v1" || v2.pipelineVersion !== "ag-v2")
    issues.push("SHADOW_UNSUPPORTED_PIPELINE_VERSION");
  if (!/^\d{4}-Q[1-4]$/.test(v1.fiscalPeriod) ||
      v1.fiscalPeriod !== v2.fiscalPeriod)
    issues.push("SHADOW_FISCAL_PERIOD_MISMATCH");
  const t1 = parseUtc(v1.capturedAt), t2 = parseUtc(v2.capturedAt);
  const a1 = parseUtc(v1.researchAsOf), a2 = parseUtc(v2.researchAsOf);
  if (![t1,t2,a1,a2].every(Number.isFinite)) issues.push("SHADOW_MANIFEST_INVALID_TIME");
  else {
    if (Math.abs(t1 - t2) > MAX_SKEW_MS) issues.push("SHADOW_CAPTURE_TIME_SKEW");
    if (a1 !== a2) issues.push("SHADOW_RESEARCH_ASOF_MISMATCH");
    if (a1 > t1 || a2 > t2) issues.push("SHADOW_RESEARCH_IN_FUTURE");
  }
  const normalize = (symbols: readonly string[], name: string): string[] => {
    const normalized = symbols.map(s => s.trim().toUpperCase());
    if (normalized.some(s => !SYMBOL.test(s)) || new Set(normalized).size !== normalized.length)
      issues.push("SHADOW_INVALID_UNIVERSE:" + name);
    return normalized.sort();
  };
  const first = normalize(v1.universeSymbols, "v1");
  const second = normalize(v2.universeSymbols, "v2");
  const expected = normalize(expectedSymbols, "rows");
  if (!first.length || first.length !== second.length ||
      first.some((s,i) => s !== second[i]))
    issues.push("SHADOW_UNIVERSE_MISMATCH");
  if (first.length !== expected.length || first.some((s,i) => s !== expected[i]))
    issues.push("SHADOW_ROW_COVERAGE_MISMATCH");
  return { valid: issues.length === 0, issues };
}
