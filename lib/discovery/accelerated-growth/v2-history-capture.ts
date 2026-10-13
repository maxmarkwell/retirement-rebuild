import { createHash } from "node:crypto";
import type { V2IdentityHistoryRequest } from "./v2-research-issuer-history";
import { compareV2ResearchHistoryWithIssuers } from "./v2-research-issuer-history";

/**
 * Offline reproducible capture envelope. SHA-256 protects against accidental
 * changes after capture; it does NOT authenticate the source or capture time.
 */
export type V2HistoryCaptureEnvelope = {
  schemaVersion: "ag-history-capture-v1";
  sourceRevision: string;
  capturedBy: string;
  reviewedBy: string;
  sourceManifestSha256: string;
  history: V2IdentityHistoryRequest;
};
export type V2HistoryCaptureResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; sha256: string; cycleCount: number; issuerCount: number };

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9._@-]{3,120}$/;
const REVISION = /^[a-f0-9]{40}$/;
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object") throw new Error("CAPTURE_NON_JSON_VALUE");
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map(key =>
    JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
}
export function verifyV2HistoryCapture(
  envelope: V2HistoryCaptureEnvelope,
): V2HistoryCaptureResult {
  const issues: string[] = [];
  if (envelope.schemaVersion !== "ag-history-capture-v1")
    issues.push("CAPTURE_INVALID_SCHEMA");
  if (!REVISION.test(envelope.sourceRevision))
    issues.push("CAPTURE_INVALID_REVISION");
  if (!ID.test(envelope.capturedBy) || !ID.test(envelope.reviewedBy) ||
      envelope.capturedBy === envelope.reviewedBy)
    issues.push("CAPTURE_INVALID_REVIEWERS");
  if (!SHA.test(envelope.sourceManifestSha256))
    issues.push("CAPTURE_INVALID_SOURCE_MANIFEST");
  const history = compareV2ResearchHistoryWithIssuers(envelope.history);
  if (!history.accepted) issues.push(...history.issues);
  if (issues.length || !history.accepted) return { accepted: false, issues };
  let digest: string;
  try { digest = createHash("sha256").update(canonical(envelope)).digest("hex"); }
  catch { return { accepted: false, issues: ["CAPTURE_NON_JSON_VALUE"] }; }
  return {
    accepted: true,
    sha256: digest,
    cycleCount: history.comparison.cycleCount,
    issuerCount: history.uniqueV2Issuers,
  };
}
