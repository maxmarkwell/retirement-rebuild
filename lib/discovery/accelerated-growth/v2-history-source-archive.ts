import { createHash } from "node:crypto";
import { verifyV2HistorySourceManifest } from "./v2-history-manifest-verifier";
import type { V2HistoryCaptureEnvelope } from "./v2-history-capture";

/**
 * Offline verification of a manifest and its separately supplied source bytes.
 * Caller is responsible for acquisition and independent source authenticity.
 */
export type V2ArchivedSource = {
  id: string;
  kind: "SEC_FILING" | "VENDOR_RAW" | "V1_CYCLE" | "UNIVERSE" | "ISSUER_MAPPING";
  sha256: string;
  publishedAt: string;
  retrievedAt: string;
  sourceUrl: string;
};
export type V2ArchivedManifest = {
  schemaVersion: "ag-history-source-manifest-v1";
  researchAsOf: string;
  sources: V2ArchivedSource[];
};
export type V2SourcePayload = { id: string; utf8: string };
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9._:-]{1,120}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function time(value: string): number | null {
  if (!UTC.test(value)) return null;
  const n = Date.parse(value);
  const canonical = value.replace(/\.(\d{1,3})Z$/, (_, ms: string) =>
    "." + ms.padEnd(3, "0") + "Z").replace(/\.000Z$/, "Z");
  return Number.isFinite(n) &&
    new Date(n).toISOString().replace(/\.000Z$/, "Z") === canonical ? n : null;
}
function trustedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password &&
      !u.hash && !!u.hostname && u.port === "";
  } catch { return false; }
}
export function verifyV2ArchivedSources(
  envelope: V2HistoryCaptureEnvelope,
  manifestUtf8: string,
  payloads: readonly V2SourcePayload[],
): { accepted: boolean; issues: string[]; verifiedSources: number } {
  const issues: string[] = [];
  const outer = verifyV2HistorySourceManifest(envelope, manifestUtf8);
  issues.push(...outer.issues);
  let manifest: V2ArchivedManifest;
  try { manifest = JSON.parse(manifestUtf8) as V2ArchivedManifest; }
  catch { return { accepted: false, issues: [...issues, "ARCHIVE_INVALID_JSON"], verifiedSources: 0 }; }
  if (!manifest || manifest.schemaVersion !== "ag-history-source-manifest-v1" ||
      !Array.isArray(manifest.sources) || !manifest.sources.length ||
      manifest.sources.length > 2000 || !Array.isArray(payloads) ||
      payloads.length > 2000)
    return { accepted: false, issues: [...issues, "ARCHIVE_INVALID_MANIFEST"], verifiedSources: 0 };
  const asOf = time(manifest.researchAsOf);
  if (asOf === null || Date.parse(envelope.history.cycles[0]?.researchAsOf ?? "") !== asOf)
    issues.push("ARCHIVE_ASOF_MISMATCH");
  // A shared archive is conservatively limited to evidence available at the first cycle.
  // Later-cycle evidence requires a separately captured archive, not this contract.
  const seen = new Set<string>();
  const byId = new Map<string, string>();
  for (const payload of payloads) {
    if (typeof payload?.id !== "string" || typeof payload.utf8 !== "string" ||
        !ID.test(payload.id) || byId.has(payload.id) ||
        Buffer.byteLength(payload.utf8, "utf8") > 8 * 1024 * 1024) {
      issues.push("ARCHIVE_INVALID_PAYLOAD");
      continue;
    }
    byId.set(payload.id, payload.utf8);
  }
  let verifiedSources = 0;
  const kinds = new Set(["SEC_FILING", "VENDOR_RAW", "V1_CYCLE", "UNIVERSE", "ISSUER_MAPPING"]);
  for (const source of manifest.sources) {
    if (!source || typeof source.id !== "string" || !ID.test(source.id) ||
        seen.has(source.id) || !kinds.has(source.kind) ||
        typeof source.sha256 !== "string" || !SHA.test(source.sha256) ||
        typeof source.sourceUrl !== "string" || !trustedUrl(source.sourceUrl)) {
      issues.push("ARCHIVE_INVALID_SOURCE");
      continue;
    }
    seen.add(source.id);
    const published = typeof source.publishedAt === "string" ? time(source.publishedAt) : null;
    const retrieved = typeof source.retrievedAt === "string" ? time(source.retrievedAt) : null;
    if (published === null || retrieved === null || asOf === null ||
        published > retrieved || published > asOf || retrieved > asOf)
      issues.push("ARCHIVE_LOOKAHEAD_OR_INVALID_TIME:" + source.id);
    const bytes = byId.get(source.id);
    if (bytes === undefined) issues.push("ARCHIVE_MISSING_PAYLOAD:" + source.id);
    else if (createHash("sha256").update(bytes, "utf8").digest("hex") !== source.sha256)
      issues.push("ARCHIVE_HASH_MISMATCH:" + source.id);
    else verifiedSources++;
  }
  for (const id of byId.keys()) if (!seen.has(id))
    issues.push("ARCHIVE_UNMATCHED_PAYLOAD:" + id);
  if (!manifest.sources.some(s => s?.kind === "V1_CYCLE") ||
      !manifest.sources.some(s => s?.kind === "UNIVERSE") ||
      !manifest.sources.some(s => s?.kind === "ISSUER_MAPPING"))
    issues.push("ARCHIVE_MISSING_REQUIRED_SOURCE_KIND");
  return { accepted: issues.length === 0, issues, verifiedSources };
}
