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
  candidateCoverage: {
    eligibleByBucket: Record<UniverseMarketCapBucket, number>;
    selectedByBucket: Record<UniverseMarketCapBucket, number>;
    highestRankedNotSelected: Array<{ symbol: string; bucket: UniverseMarketCapBucket; selectorScore: number }>;
  };
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

  // Explain which high-ranked, investable stocks did not reach quantitative
  // evaluation. This is diagnostic evidence, not an investment recommendation.
  const selectedTickerSet = new Set(selected.map((item) => item.stock.ticker.toUpperCase()));
  const eligibleByBucket = { small: 0, mid: 0, large: 0, mega: 0 } as Record<UniverseMarketCapBucket, number>;
  const selectedByBucket = { small: 0, mid: 0, large: 0, mega: 0 } as Record<UniverseMarketCapBucket, number>;
  for (const stock of universe) if (passesAgTradabilityGate(stock)) eligibleByBucket[stock.marketCapBucket] += 1;
  for (const item of selected) selectedByBucket[item.stock.marketCapBucket] += 1;
  const highestRankedNotSelected = universe
    .filter((stock) => passesAgTradabilityGate(stock) && !selectedTickerSet.has(stock.ticker.toUpperCase()))
    .map((stock) => ({ symbol: stock.ticker, bucket: stock.marketCapBucket, selectorScore: Math.round(zeroCallSelectorScore(stock) * 10) / 10 }))
    .sort((a, b) => b.selectorScore - a.selectorScore || a.symbol.localeCompare(b.symbol))
    .slice(0, 20);

  const candidates: AgDiscoveryCandidate[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  let rateLimited = false;
  // Bound concurrency to reduce single-request wall time without flooding data vendors.
  // Always preserve the same deterministic preselection and ranked evaluation set.
  const ranked = selected.sort((a, b) => b.selectorScore - a.selectorScore);
  for (let offset = 0; offset < ranked.length; offset += 3) {
    const batch = ranked.slice(offset, offset + 3);
    const settled = await Promise.all(batch.map(async (item) => {
      try {
        const candidate = await evaluateAcceleratedGrowthCandidate(item.stock.ticker);
        return { item, candidate, error: null as string | null, limited: false };
      } catch (error) {
        return {
          item, candidate: null,
          error: error instanceof Error ? error.message : "Evaluation failed.",
          limited: isRateLimitError(error),
        };
      }
    }));
    for (const result of settled) {
      if (result.candidate) {
        candidates.push({ ...result.candidate, selectorScore: Math.round(result.item.selectorScore * 10) / 10, sector: result.item.stock.sector, industry: result.item.stock.industry });
      } else {
        errors.push({ symbol: result.item.stock.ticker, error: result.error ?? "Evaluation failed." });
        if (result.limited) rateLimited = true;
      }
    }
    if (rateLimited) break;
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
    reassessmentSelectedCount, candidateCoverage: { eligibleByBucket, selectedByBucket, highestRankedNotSelected }, candidates, errors,
  };
}
