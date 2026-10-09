import { createHash } from "node:crypto";
import { verifyV2HistoryCapture, type V2HistoryCaptureEnvelope } from "./v2-history-capture";

/**
 * Verifies the archived source manifest's exact UTF-8 bytes against the
 * digest declared in the offline envelope. Does not authenticate its claims.
 */
export function verifyV2HistorySourceManifest(
  envelope: V2HistoryCaptureEnvelope,
  sourceManifestUtf8: string,
): { accepted: boolean; issues: string[]; manifestSha256: string | null } {
  const verified = verifyV2HistoryCapture(envelope);
  const issues = verified.accepted ? [] : [...verified.issues];
  if (typeof sourceManifestUtf8 !== "string" ||
      !sourceManifestUtf8.length || Buffer.byteLength(sourceManifestUtf8, "utf8") > 1048576) {
    issues.push("MANIFEST_INVALID_BYTES");
    return { accepted: false, issues, manifestSha256: null };
  }
  const manifestSha256 = createHash("sha256").update(sourceManifestUtf8, "utf8").digest("hex");
  if (manifestSha256 !== envelope.sourceManifestSha256)
    issues.push("MANIFEST_DIGEST_MISMATCH");
  return { accepted: issues.length === 0, issues, manifestSha256 };
}
