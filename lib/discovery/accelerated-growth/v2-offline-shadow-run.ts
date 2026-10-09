import { verifyV2ShadowEvidence, type V2ShadowEvidenceBatch } from "./v2-shadow-evidence";
import { verifyV2SnapshotManifests, type V2SnapshotManifest } from "./v2-snapshot-manifest";
import { evaluateV2ShadowSnapshots, type V2ShadowInput } from "./v2-shadow-evaluator";
import type { V2ShadowSummary } from "./v2-shadow-comparison";

/**
 * Explicitly invoked offline shadow run. Inputs are already-materialized
 * snapshots; no fetch, persistence, credentials, committee or trade actions.
 */
export type V2ShadowRunRequest = {
  runId: string;
  capturedAt: string;
  v1SnapshotId: string;
  v2SnapshotId: string;
  rows: readonly V2ShadowInput[];
  v1Manifest: V2SnapshotManifest;
  v2Manifest: V2SnapshotManifest;
  evidence: readonly V2ShadowEvidenceBatch[];
  reconciliationTolerances: Readonly<Record<string, number>>;
};
export type V2ShadowRunResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; runId: string; capturedAt: string;
      v1SnapshotId: string; v2SnapshotId: string; summary: V2ShadowSummary };

const MAX_ROWS = 500;
const VALID_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function runV2OfflineShadow(request: V2ShadowRunRequest): V2ShadowRunResult {
  const issues: string[] = [];
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(request.runId))
    issues.push("SHADOW_INVALID_RUN_ID");
  if (!VALID_TIMESTAMP.test(request.capturedAt) ||
      !Number.isFinite(Date.parse(request.capturedAt)))
    issues.push("SHADOW_INVALID_TIMESTAMP");
  if (!/^[a-zA-Z0-9_:-]{3,150}$/.test(request.v1SnapshotId) ||
      !/^[a-zA-Z0-9_:-]{3,150}$/.test(request.v2SnapshotId))
    issues.push("SHADOW_INVALID_SNAPSHOT_ID");
  if (request.v1SnapshotId === request.v2SnapshotId)
    issues.push("SHADOW_SNAPSHOTS_NOT_DISTINCT");
  if (request.rows.length === 0 || request.rows.length > MAX_ROWS)
    issues.push("SHADOW_INVALID_ROW_COUNT");
  if (request.v1Manifest.snapshotId !== request.v1SnapshotId ||
      request.v2Manifest.snapshotId !== request.v2SnapshotId)
    issues.push("SHADOW_MANIFEST_SNAPSHOT_ID_MISMATCH");
  if (request.v1Manifest.capturedAt !== request.capturedAt)
    issues.push("SHADOW_CAPTURE_IDENTITY_MISMATCH");
  issues.push(...verifyV2SnapshotManifests(request.v1Manifest, request.v2Manifest,
    request.rows.map(row => row.symbol)).issues);
  issues.push(...verifyV2ShadowEvidence(request.evidence,
    request.rows.map(row => row.symbol), request.v2Manifest.fiscalPeriod,
    request.v2Manifest.researchAsOf, request.reconciliationTolerances).issues);
  if (issues.length) return { accepted: false, issues };
  const summary = evaluateV2ShadowSnapshots(request.rows);
  if (summary.issues.length) return { accepted: false, issues: summary.issues };
  return { accepted: true, runId: request.runId, capturedAt: request.capturedAt,
    v1SnapshotId: request.v1SnapshotId, v2SnapshotId: request.v2SnapshotId, summary };
}
