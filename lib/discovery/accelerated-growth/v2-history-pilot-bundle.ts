import { createHash } from "node:crypto";
import { buildV2HistoricalPilotReport, type V2HistoricalPilotReport } from "./v2-history-pilot-report";
import type { V2HistoricalCycleArchive } from "./v2-history-archive-batch";
import { inspectV2PilotEvidenceReadiness, type V2PilotEvidenceReadiness } from "./v2-pilot-evidence-readiness";

/**
 * Portable offline pilot bundle. The caller supplies archived UTF-8 bytes;
 * this module never fetches, persists, or authenticates remote data.
 */
export type V2HistoricalPilotBundle = {
  schemaVersion: "ag-history-pilot-bundle-v1";
  archives: V2HistoricalCycleArchive[];
};
export type V2HistoricalPilotBundleResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; bundleSha256: string; report: Extract<V2HistoricalPilotReport, { accepted: true }>;
      evidenceInventory: Extract<V2PilotEvidenceReadiness, { accepted: true }> };

const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVES = 100;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}

export function evaluateV2HistoricalPilotBundle(
  rawUtf8: string,
): V2HistoricalPilotBundleResult {
  if (typeof rawUtf8 !== "string" ||
      Buffer.byteLength(rawUtf8, "utf8") > MAX_BUNDLE_BYTES)
    return { accepted: false, issues: ["PILOT_BUNDLE_SIZE_OR_TYPE"] };
  let raw: unknown;
  try { raw = JSON.parse(rawUtf8) as unknown; }
  catch { return { accepted: false, issues: ["PILOT_BUNDLE_INVALID_JSON"] }; }
  if (!record(raw) || !fields(raw, ["schemaVersion", "archives"]) ||
      raw.schemaVersion !== "ag-history-pilot-bundle-v1" ||
      !Array.isArray(raw.archives) || raw.archives.length < 1 ||
      raw.archives.length > MAX_ARCHIVES)
    return { accepted: false, issues: ["PILOT_BUNDLE_INVALID_SCHEMA"] };
  for (const [i, archive] of raw.archives.entries()) {
    if (!record(archive) ||
        !fields(archive, ["envelope", "manifestUtf8", "payloads"]) ||
        typeof archive.manifestUtf8 !== "string" ||
        !record(archive.envelope) || !Array.isArray(archive.payloads) ||
        !record(archive.envelope.history) ||
        !Array.isArray(archive.envelope.history.cycles) ||
        !Array.isArray(archive.envelope.history.issuerIdentitiesByCycle) ||
        archive.envelope.history.cycles.length !== 1 ||
        archive.envelope.history.issuerIdentitiesByCycle.length !== 1 ||
        !record(archive.envelope.history.cycles[0]) ||
        !Array.isArray(archive.envelope.history.cycles[0].candidates) ||
        !Array.isArray(archive.envelope.history.cycles[0].v1SelectedSymbols) ||
        archive.payloads.length > 2000 ||
        archive.payloads.some((p: unknown) =>
          !record(p) || !fields(p, ["id", "utf8"]) ||
          typeof p.id !== "string" || typeof p.utf8 !== "string"))
      return { accepted: false, issues: ["PILOT_BUNDLE_INVALID_ARCHIVE:" + i] };
  }
  try {
    const report = buildV2HistoricalPilotReport(
      raw.archives as V2HistoricalCycleArchive[]);
    if (!report.accepted) return report;
    const evidenceInventory = inspectV2PilotEvidenceReadiness(
      raw.archives as V2HistoricalCycleArchive[]);
    if (!evidenceInventory.accepted) return evidenceInventory;
    return { accepted: true,
      bundleSha256: createHash("sha256").update(rawUtf8, "utf8").digest("hex"),
      report, evidenceInventory };
  } catch {
    return { accepted: false, issues: ["PILOT_BUNDLE_INVALID_NESTED_DATA"] };
  }
}
