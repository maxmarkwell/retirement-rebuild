import { verifyV2HistoryCapture, type V2HistoryCaptureEnvelope } from "./v2-history-capture";

/**
 * Offline reproducibility check: compare separately supplied historical
 * capture envelopes. Equality is not proof of authentic point-in-time data.
 */
export type V2CaptureReplayResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; reproducible: boolean; baselineSha256: string;
      replaySha256: string; changed: string[] };

export function compareV2HistoryCaptureReplay(
  baseline: V2HistoryCaptureEnvelope,
  replay: V2HistoryCaptureEnvelope,
): V2CaptureReplayResult {
  const a = verifyV2HistoryCapture(baseline);
  const b = verifyV2HistoryCapture(replay);
  const issues = [
    ...(!a.accepted ? a.issues.map(x => "BASELINE:" + x) : []),
    ...(!b.accepted ? b.issues.map(x => "REPLAY:" + x) : []),
  ];
  if (issues.length || !a.accepted || !b.accepted) return { accepted: false, issues };
  const changed: string[] = [];
  if (baseline.sourceRevision !== replay.sourceRevision) changed.push("SOURCE_REVISION");
  if (baseline.sourceManifestSha256 !== replay.sourceManifestSha256)
    changed.push("SOURCE_MANIFEST");
  if (baseline.capturedBy !== replay.capturedBy ||
      baseline.reviewedBy !== replay.reviewedBy)
    changed.push("REVIEW_IDENTITIES");
  if (a.sha256 !== b.sha256 && !changed.length) changed.push("HISTORY_PAYLOAD");
  return { accepted: true, reproducible: a.sha256 === b.sha256,
    baselineSha256: a.sha256, replaySha256: b.sha256, changed };
}
