import type { V2HistoricalCycleArchive } from "./v2-history-archive-batch";
import type { V2ArchivedManifest } from "./v2-history-source-archive";
import { verifyV2HistoricalArchiveBatch } from "./v2-history-archive-batch";

/**
 * Source-inventory gate for interpreting a historical pilot. Internal cycle
 * consistency is not proof that the underlying external evidence is genuine.
 */
export type V2PilotEvidenceReadiness =
  | { accepted: false; issues: string[] }
  | { accepted: true; cycleCount: number; cyclesWithSecFilings: number;
      cyclesWithVendorRaw: number; cyclesWithBothExternalKinds: number;
      cyclesWithoutExternalEvidence: number; totalSecFilingSources: number;
      totalVendorRawSources: number; bothExternalKindsPresentEveryCycle: boolean };

export function inspectV2PilotEvidenceReadiness(
  archives: readonly V2HistoricalCycleArchive[],
): V2PilotEvidenceReadiness {
  const result = verifyV2HistoricalArchiveBatch(archives);
  if (!result.accepted) return result;
  let cyclesWithSecFilings = 0;
  let cyclesWithVendorRaw = 0;
  let cyclesWithBothExternalKinds = 0;
  let cyclesWithoutExternalEvidence = 0;
  let totalSecFilingSources = 0;
  let totalVendorRawSources = 0;
  for (const archive of archives) {
    const manifest = JSON.parse(archive.manifestUtf8) as V2ArchivedManifest;
    const sec = manifest.sources.filter(s => s.kind === "SEC_FILING").length;
    const vendor = manifest.sources.filter(s => s.kind === "VENDOR_RAW").length;
    totalSecFilingSources += sec;
    totalVendorRawSources += vendor;
    if (sec) cyclesWithSecFilings++;
    if (vendor) cyclesWithVendorRaw++;
    if (sec && vendor) cyclesWithBothExternalKinds++;
    if (!sec && !vendor) cyclesWithoutExternalEvidence++;
  }
  return {
    accepted: true, cycleCount: result.cycleCount,
    cyclesWithSecFilings, cyclesWithVendorRaw,
    cyclesWithBothExternalKinds, cyclesWithoutExternalEvidence,
    totalSecFilingSources, totalVendorRawSources,
    bothExternalKindsPresentEveryCycle: cyclesWithBothExternalKinds === result.cycleCount,
  };
}
