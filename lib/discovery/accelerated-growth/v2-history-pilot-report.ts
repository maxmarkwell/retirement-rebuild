import { verifyV2HistoricalArchiveBatch, type V2HistoricalCycleArchive } from "./v2-history-archive-batch";
import { compareV2ResearchSlots } from "./v2-research-slot-shadow";

/**
 * Decision-focused offline pilot report. Every count is research-slot coverage,
 * not investment performance or evidence that historical sources are genuine.
 */
export type V2HistoricalPilotReport =
  | { accepted: false; issues: string[] }
  | { accepted: true; cycleCount: number; uniqueV1Issuers: number;
      uniqueV2Issuers: number; totalV1Slots: number; totalV2Slots: number;
      totalOverlapSlots: number; totalNewlySelectedSlots: number;
      totalDisplacedV1Slots: number; totalNewIssuerSelections: number;
      uniqueIncrementalIssuers: number; uniqueDisplacedIssuers: number;
      cyclesWithIncrementalIssuers: number;
      firstSeenV2BeforeV1Issuers: number;
      firstSeenV1BeforeV2Issuers: number;
      sameCycleFirstSeenIssuers: number;
      v2PathUniqueIssuerCounts: Record<string, number>;
      v2PathIncrementalIssuerCounts: Record<string, number>;
      cycles: {
        runId: string; researchAsOf: string; capacity: number;
        v1Symbols: string[]; v2Symbols: string[];
        overlapSymbols: string[]; incrementalSymbols: string[];
        displacedSymbols: string[]; incrementalIssuerIds: string[];
        firstSeenV2IssuerIds: string[]; firstSeenV1IssuerIds: string[];
        v1WatchSlots: number; v2WatchSlots: number;
        v2NewDiscoverySlots: number;
      }[] };

export function buildV2HistoricalPilotReport(
  archives: readonly V2HistoricalCycleArchive[],
): V2HistoricalPilotReport {
  const verified = verifyV2HistoricalArchiveBatch(archives);
  if (!verified.accepted) return verified;
  const issues: string[] = [];
  const cycles: Extract<V2HistoricalPilotReport, { accepted: true }>["cycles"] = [];
  const everV1 = new Set<string>();
  const everV2 = new Set<string>();
  const issuerByPath = new Map<string, Set<string>>();
  const firstV1 = new Map<string, number>();
  const firstV2 = new Map<string, number>();
  let totalOverlapSlots = 0;
  let totalNewlySelectedSlots = 0;
  let totalDisplacedV1Slots = 0;
  let totalV1Slots = 0;
  let totalNewIssuerSelections = 0;
  for (const [index, archive] of archives.entries()) {
    const cycle = archive.envelope.history.cycles[0];
    const result = compareV2ResearchSlots(cycle);
    if (!result.accepted) {
      issues.push(...result.issues.map(issue => "PILOT_" + index + ":" + issue));
      continue;
    }
    const bySymbol = new Map(
      archive.envelope.history.issuerIdentitiesByCycle[0].map(row =>
        [row.symbol.trim().toUpperCase(), row.issuerId]));
    const incrementalIssuerIds = result.newlySelected.map(symbol => bySymbol.get(symbol)!);
    const firstSeenV1IssuerIds: string[] = [];
    const firstSeenV2IssuerIds: string[] = [];
    for (const symbol of result.v1SelectedSymbols) {
      const issuer = bySymbol.get(symbol)!;
      everV1.add(issuer);
      if (!firstV1.has(issuer)) {
        firstV1.set(issuer, index);
        firstSeenV1IssuerIds.push(issuer);
      }
    }
    for (const candidate of result.v2Selected) {
      const issuer = bySymbol.get(candidate.symbol)!;
      everV2.add(issuer);
      if (!firstV2.has(issuer)) {
        firstV2.set(issuer, index);
        firstSeenV2IssuerIds.push(issuer);
      }
      for (const path of candidate.paths) {
        if (!issuerByPath.has(path)) issuerByPath.set(path, new Set());
        issuerByPath.get(path)!.add(issuer);
      }
    }
    totalV1Slots += result.v1SelectedSymbols.length;
    totalOverlapSlots += result.overlap.length;
    totalNewlySelectedSlots += result.newlySelected.length;
    totalDisplacedV1Slots += result.displacedV1.length;
    totalNewIssuerSelections += incrementalIssuerIds.length;
    cycles.push({
      runId: cycle.runId, researchAsOf: cycle.researchAsOf,
      capacity: cycle.capacity, v1Symbols: result.v1SelectedSymbols,
      v2Symbols: result.v2Selected.map(x => x.symbol),
      overlapSymbols: result.overlap,
      incrementalSymbols: result.newlySelected,
      displacedSymbols: result.displacedV1,
      incrementalIssuerIds, firstSeenV2IssuerIds, firstSeenV1IssuerIds,
      v1WatchSlots: result.v1WatchCount, v2WatchSlots: result.v2WatchCount,
      v2NewDiscoverySlots: result.v2NewDiscoveryCount,
    });
  }
  if (issues.length) return { accepted: false, issues };
  // Incremental issuer = selected by v2 but never selected by v1
  // across ANY supplied cycle. This avoids calling repeat research new.
  const trulyIncremental = [...everV2].filter(id => !everV1.has(id));
  const trulyDisplaced = [...everV1].filter(id => !everV2.has(id));
  return {
    accepted: true, cycleCount: verified.cycleCount,
    uniqueV1Issuers: verified.uniqueV1Issuers,
    uniqueV2Issuers: verified.uniqueV2Issuers,
    totalV1Slots, totalV2Slots: verified.totalV2Slots,
    totalOverlapSlots, totalNewlySelectedSlots, totalDisplacedV1Slots,
    totalNewIssuerSelections,
    uniqueIncrementalIssuers: trulyIncremental.length,
    uniqueDisplacedIssuers: trulyDisplaced.length,
    cyclesWithIncrementalIssuers: cycles.filter(c => c.incrementalIssuerIds.length > 0).length,
    firstSeenV2BeforeV1Issuers: [...firstV2].filter(([id, at]) =>
      firstV1.has(id) && at < firstV1.get(id)!).length,
    firstSeenV1BeforeV2Issuers: [...firstV1].filter(([id, at]) =>
      firstV2.has(id) && at < firstV2.get(id)!).length,
    sameCycleFirstSeenIssuers: [...firstV1].filter(([id, at]) =>
      firstV2.get(id) === at).length,
    v2PathUniqueIssuerCounts: verified.v2PathUniqueIssuerCounts,
    v2PathIncrementalIssuerCounts: Object.fromEntries(
      [...issuerByPath.entries()].map(([path, issuers]) => [path,
        [...issuers].filter(issuer => !everV1.has(issuer)).length])),
    cycles,
  };
}
