import {
  getDynamicDiscoveryUniverse,
  type DynamicUniverseStock,
  type MarketCapBucket as UniverseMarketCapBucket,
} from "../dynamic-universe";
import { evaluateAcceleratedGrowthCandidate } from "./evaluate";

export type AgDiscoveryCandidate = Awaited<ReturnType<typeof evaluateAcceleratedGrowthCandidate>> & {
  selectorScore: number;
  sector: string | null;
  industry: string | null;
};

export type AgDiscoveryResult = {
  universeCount: number;
  preselectedCount: number;
  evaluatedCount: number;
  advanceCount: number;
  reviewCount: number;
  rejectCount: number;
  insufficientDataCount: number;
  rateLimited: boolean;
  stoppedEarly: boolean;
  bucketSelectionCounts: Record<UniverseMarketCapBucket, number>;
  eligibleUniverseCount: number;
  rejectedByTradabilityCount: number;
  reassessmentRequestedCount: number;
  reassessmentSelectedCount: number;
  candidates: AgDiscoveryCandidate[];
  errors: Array<{ symbol: string; error: string }>;
};

type Preselected = { stock: DynamicUniverseStock; selectorScore: number };

const BUCKET_LIMITS: Record<UniverseMarketCapBucket, number> = { small: 8, mid: 8, large: 4, mega: 2 };

function clamp(value: number, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }
function linear(value: number | null, bad: number, good: number, neutral = 45) {
  if (value == null || !Number.isFinite(value)) return neutral;
  return clamp(((value - bad) / (good - bad)) * 100);
}
function zeroCallSelectorScore(stock: DynamicUniverseStock) {
  const liquidity = stock.dollarVolume == null ? 45 : linear(Math.log10(Math.max(stock.dollarVolume, 1)), 6, 8.5);
  const priceQuality = linear(stock.price, 5, 30);
  return clamp(liquidity * 0.8 + priceQuality * 0.2);
}
export function passesAgTradabilityGate(stock: DynamicUniverseStock) {
  if (!Number.isFinite(stock.price) || stock.price < 5) return false;
  if (!Number.isFinite(stock.marketCap) || stock.marketCap < 300_000_000) return false;
  if (stock.dollarVolume == null || !Number.isFinite(stock.dollarVolume)) return false;
  if ((stock.marketCapBucket === "small" || stock.marketCapBucket === "mid") && stock.dollarVolume < 2_000_000) return false;
  return true;
}
function selectBucket(stocks: DynamicUniverseStock[], limit: number): Preselected[] {
  const eligible = stocks.filter(passesAgTradabilityGate).map((stock) => ({ stock, selectorScore: zeroCallSelectorScore(stock) }));
  if (eligible.length <= limit) return eligible.sort((a, b) => b.selectorScore - a.selectorScore);
  const selected: Preselected[] = [];
  const sliceSize = eligible.length / limit;
  for (let i = 0; i < limit; i += 1) {
    const start = Math.floor(i * sliceSize), end = Math.max(start + 1, Math.floor((i + 1) * sliceSize));
    const slice = eligible.slice(start, end).sort((a, b) => b.selectorScore - a.selectorScore);
    if (slice[0]) selected.push(slice[0]);
  }
  return selected;
}
function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /status 429|limit reach|rate limit/i.test(message);
}

export async function runAcceleratedGrowthDiscovery(options?: { reassessSymbols?: string[] }): Promise<AgDiscoveryResult> {
  const universe = await getDynamicDiscoveryUniverse();
  const byBucket = new Map<UniverseMarketCapBucket, DynamicUniverseStock[]>();
  for (const bucket of Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[]) byBucket.set(bucket, []);
  for (const stock of universe) byBucket.get(stock.marketCapBucket)?.push(stock);

  const eligibleUniverseCount = universe.filter(passesAgTradabilityGate).length;
  const selected: Preselected[] = [];
  let reassessmentSelectedCount = 0;
  const bucketSelectionCounts = { small: 0, mid: 0, large: 0, mega: 0 } as Record<UniverseMarketCapBucket, number>;
  for (const bucket of Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[]) {
    const bucketSelected = selectBucket(byBucket.get(bucket) ?? [], BUCKET_LIMITS[bucket]);
    bucketSelectionCounts[bucket] = bucketSelected.length;
    selected.push(...bucketSelected);
  }

  // Unresolved research WATCHes are first-class reassessment candidates. They do
  // not need to win the zero-call selector again, but they must still exist in
  // the current investable universe. Deduplication prevents paying twice when a
  // watched ticker also qualifies naturally today.
  const selectedSymbols = new Set(selected.map((item) => item.stock.ticker.toUpperCase()));
  const reassessmentSeen = new Set<string>();
  const universeBySymbol = new Map(universe.map((stock) => [stock.ticker.toUpperCase(), stock]));
  for (const rawSymbol of options?.reassessSymbols ?? []) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || reassessmentSeen.has(symbol)) continue;
    reassessmentSeen.add(symbol);
    if (selectedSymbols.has(symbol)) continue;
    const stock = universeBySymbol.get(symbol);
    // A WATCH is a research priority, not an exemption from investability rules.
    if (!stock || !passesAgTradabilityGate(stock)) continue;
    selected.push({ stock, selectorScore: zeroCallSelectorScore(stock) });
    selectedSymbols.add(symbol);
    reassessmentSelectedCount += 1;
  }

  const candidates: AgDiscoveryCandidate[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  let rateLimited = false;
  for (const item of selected.sort((a, b) => b.selectorScore - a.selectorScore)) {
    try {
      const candidate = await evaluateAcceleratedGrowthCandidate(item.stock.ticker);
      candidates.push({ ...candidate, selectorScore: Math.round(item.selectorScore * 10) / 10, sector: item.stock.sector, industry: item.stock.industry });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation failed.";
      errors.push({ symbol: item.stock.ticker, error: message });
      if (isRateLimitError(error)) { rateLimited = true; break; }
    }
  }

  const statusOrder = { ADVANCE: 0, REVIEW: 1, REJECT: 2, INSUFFICIENT_DATA: 3 } as const;
  candidates.sort((a, b) => statusOrder[a.score.status] - statusOrder[b.score.status] || b.score.total - a.score.total);
  return {
    universeCount: universe.length, preselectedCount: selected.length, evaluatedCount: candidates.length,
    advanceCount: candidates.filter((c) => c.score.status === "ADVANCE").length,
    reviewCount: candidates.filter((c) => c.score.status === "REVIEW").length,
    rejectCount: candidates.filter((c) => c.score.status === "REJECT").length,
    insufficientDataCount: candidates.filter((c) => c.score.status === "INSUFFICIENT_DATA").length,
    rateLimited, stoppedEarly: rateLimited || candidates.length + errors.length < selected.length,
    bucketSelectionCounts, eligibleUniverseCount,
    rejectedByTradabilityCount: universe.length - eligibleUniverseCount,
    reassessmentRequestedCount: reassessmentSeen.size,
    reassessmentSelectedCount, candidates, errors,
  };
}

// Counterfactual coverage control: same bucket budgets and tradability gate, but
// select across sectors before repeating a sector. This is NOT a fundamental score.
function selectSectorCoverageControl(stocks: DynamicUniverseStock[], limit: number): Preselected[] {
  const groups = new Map<string, Preselected[]>();
  for (const stock of stocks.filter(passesAgTradabilityGate)) {
    const sector = stock.sector ?? "Unknown";
    const group = groups.get(sector) ?? [];
    group.push({ stock, selectorScore: zeroCallSelectorScore(stock) });
    groups.set(sector, group);
  }
  for (const group of groups.values()) group.sort((a, b) => b.selectorScore - a.selectorScore || a.stock.ticker.localeCompare(b.stock.ticker));
  const chosen: Preselected[] = [];
  while (chosen.length < limit) {
    const available = [...groups.entries()].filter(([, group]) => group.length > 0);
    if (!available.length) break;
    available.sort((a, b) => {
      const aCount = chosen.filter((item) => (item.stock.sector ?? "Unknown") === a[0]).length;
      const bCount = chosen.filter((item) => (item.stock.sector ?? "Unknown") === b[0]).length;
      return aCount - bCount || b[1][0].selectorScore - a[1][0].selectorScore || a[0].localeCompare(b[0]);
    });
    chosen.push(available[0][1].shift()!);
  }
  return chosen;
}

export async function getAgSelectorBiasDiagnostic() {
  const universe = await getDynamicDiscoveryUniverse();
  const eligible = universe.filter(passesAgTradabilityGate);
  const buckets = Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[];
  const selected = buckets.flatMap((bucket) =>
    selectBucket(universe.filter((stock) => stock.marketCapBucket === bucket), BUCKET_LIMITS[bucket])
      .map(({ stock, selectorScore }) => ({ stock, selectorScore }))
  );
  const coverageControl = buckets.flatMap((bucket) => selectSectorCoverageControl(universe.filter((stock) => stock.marketCapBucket === bucket), BUCKET_LIMITS[bucket]));
  const baselineSymbols = new Set(selected.map(({ stock }) => stock.ticker));
  const sectorCounts = (stocks: DynamicUniverseStock[]) => {
    const counts: Record<string, number> = {};
    for (const stock of stocks) {
      const sector = stock.sector ?? "Unknown";
      counts[sector] = (counts[sector] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([sector, count]) => ({ sector, count }));
  };
  return {
    mode: "READ_ONLY_SELECTOR_DIAGNOSTIC",
    universeCount: universe.length,
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    selectionRatePct: eligible.length ? Math.round(selected.length / eligible.length * 10000) / 100 : 0,
    selectorFormula: "80% log-dollar-volume score, 20% share-price score; market-cap-slice sampling",
    limitation: "This screener universe does not include growth, margins, earnings surprise, or valuation. It cannot rank fundamental quality without additional data.",
    buckets: buckets.map((bucket) => ({
      bucket, eligible: eligible.filter((stock) => stock.marketCapBucket === bucket).length,
      selected: selected.filter(({ stock }) => stock.marketCapBucket === bucket).length,
    })),
    sectorCoverageControl: {
      method: "Equal sector representation within each market-cap bucket; liquidity breaks ties; no fundamental ranking",
      selectedCount: coverageControl.length,
      overlapWithBaseline: coverageControl.filter(({ stock }) => baselineSymbols.has(stock.ticker)).length,
      sectors: sectorCounts(coverageControl.map(({ stock }) => stock)),
      selected: coverageControl.map(({ stock, selectorScore }) => ({ ticker: stock.ticker, sector: stock.sector, marketCapBucket: stock.marketCapBucket, selectorScore: Math.round(selectorScore * 10) / 10 })),
      warning: "This is a coverage counterfactual, not a recommended production selector or evidence of superior investment returns.",
    },
    eligibleSectors: sectorCounts(eligible),
    selectedSectors: sectorCounts(selected.map(({ stock }) => stock)),
    selected: selected.map(({ stock, selectorScore }) => ({
      ticker: stock.ticker, companyName: stock.companyName, sector: stock.sector,
      marketCapBucket: stock.marketCapBucket, marketCap: stock.marketCap,
      price: stock.price, dollarVolume: stock.dollarVolume,
      selectorScore: Math.round(selectorScore * 10) / 10,
    })),
    decisionsWritten: false, transactionsWritten: false,
  };
}

/**
 * Read-only export of the CURRENT tradable universe for offline, bucket-matched
 * experimental ranking. No fundamental API calls and no persistent writes.
 * The caller must retain the response to replay this exact snapshot later.
 */
export async function getAgEligibleUniverseSnapshot() {
  const universe = await getDynamicDiscoveryUniverse();
  const eligible = universe.filter(passesAgTradabilityGate);
  return {
    universeCount: universe.length,
    eligibleCount: eligible.length,
    stocks: eligible.map((stock) => ({
      ticker: stock.ticker,
      companyName: stock.companyName,
      sector: stock.sector,
      industry: stock.industry,
      marketCapBucket: stock.marketCapBucket,
      marketCap: stock.marketCap,
      price: stock.price,
      dollarVolume: stock.dollarVolume,
      selectorScore: Math.round(zeroCallSelectorScore(stock) * 10) / 10,
    })).sort((a, b) => a.marketCapBucket.localeCompare(b.marketCapBucket) || a.ticker.localeCompare(b.ticker)),
  };
}
