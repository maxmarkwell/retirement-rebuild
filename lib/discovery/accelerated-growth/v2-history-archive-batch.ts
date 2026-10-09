import { compareV2ResearchHistoryWithIssuers, type V2IdentityHistoryRequest } from "./v2-research-issuer-history";
import { verifyV2HistoricalCycleLinkage } from "./v2-history-cycle-linkage";
import type { V2HistoryCaptureEnvelope } from "./v2-history-capture";
import type { V2SourcePayload } from "./v2-history-source-archive";

/**
 * Offline batch preflight: each historical cycle must have its OWN source
 * archive and integrity envelope. No live reads, writes, or trading.
 */
export type V2HistoricalCycleArchive = {
  envelope: V2HistoryCaptureEnvelope;
  manifestUtf8: string;
  payloads: readonly V2SourcePayload[];
};
export type V2HistoricalBatchResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; cycleCount: number; uniqueV1Issuers: number;
      uniqueV2Issuers: number; totalV2Slots: number;
      totalV2NewDiscoverySlots: number; totalV2WatchSlots: number;
      v2PathUniqueIssuerCounts: Record<string, number> };

export function verifyV2HistoricalArchiveBatch(
  archives: readonly V2HistoricalCycleArchive[],
): V2HistoricalBatchResult {
  const issues: string[] = [];
  if (!Array.isArray(archives) || !archives.length || archives.length > 100)
    return { accepted: false, issues: ["BATCH_INVALID_COUNT"] };
  const cycles: V2IdentityHistoryRequest["cycles"][number][] = [];
  let previousCutoff = -Infinity;
  const identities: V2IdentityHistoryRequest["issuerIdentitiesByCycle"][number][] = [];
  const seenRunIds = new Set<string>();
  const seenDigests = new Set<string>();
  for (const [index, archive] of archives.entries()) {
    const prefix = "BATCH_" + index + ":";
    const envelope = archive?.envelope;
    const history = envelope?.history;
    if (!history || !Array.isArray(history.cycles) ||
        !Array.isArray(history.issuerIdentitiesByCycle) ||
        history.issuerIdentitiesByCycle.length !== 1 ||
        !Array.isArray(history.issuerIdentitiesByCycle[0]) ||
        typeof archive.manifestUtf8 !== "string" ||
        !Array.isArray(archive.payloads)) {
      issues.push(prefix + "INVALID_ARCHIVE_SHAPE");
      continue;
    }
    const cycle = history.cycles[0];
    if (history.cycles.length !== 1 || !cycle || typeof cycle !== "object") {
      issues.push(prefix + "REQUIRES_SINGLE_CYCLE_ENVELOPE");
      continue;
    }
    try {
      const result = verifyV2HistoricalCycleLinkage(
        envelope, archive.manifestUtf8, archive.payloads);
      if (!result.accepted) issues.push(...result.issues.map(issue => prefix + issue));
    } catch {
      issues.push(prefix + "INVALID_NESTED_ARCHIVE_DATA");
      continue;
    }
    const cutoff = Date.parse(cycle.researchAsOf);
    if (Number.isFinite(cutoff) && cutoff <= previousCutoff)
      issues.push(prefix + "NONMONOTONIC_ASOF");
    if (Number.isFinite(cutoff)) previousCutoff = cutoff;
    if (seenRunIds.has(cycle.runId)) issues.push(prefix + "DUPLICATE_RUN_ID");
    seenRunIds.add(cycle.runId);
    if (seenDigests.has(archive.envelope.sourceManifestSha256))
      issues.push(prefix + "REUSED_SOURCE_MANIFEST");
    seenDigests.add(archive.envelope.sourceManifestSha256);
    cycles.push(cycle);
    identities.push(archive.envelope.history.issuerIdentitiesByCycle[0]);
  }
  if (issues.length) return { accepted: false, issues };
  const history = compareV2ResearchHistoryWithIssuers({
    pipelineVersion: "ag-opportunity-v2", cycles,
    issuerIdentitiesByCycle: identities,
  });
  if (!history.accepted) return { accepted: false, issues: history.issues };
  return {
    accepted: true, cycleCount: history.comparison.cycleCount,
    uniqueV1Issuers: history.uniqueV1Issuers,
    uniqueV2Issuers: history.uniqueV2Issuers,
    totalV2Slots: history.comparison.totalV2Slots,
    totalV2NewDiscoverySlots: history.comparison.totalV2NewDiscoverySlots,
    totalV2WatchSlots: history.comparison.totalV2WatchSlots,
    v2PathUniqueIssuerCounts: history.v2PathUniqueIssuerCounts,
  };
}
