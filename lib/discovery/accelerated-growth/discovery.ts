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
  candidates: AgDiscoveryCandidate[];
  errors: Array<{ symbol: string; error: string }>;
};

type Preselected = {
  stock: DynamicUniverseStock;
  selectorScore: number;
};

// Keep the expensive quarterly stage deliberately small on the current FMP plan.
// Small/mid companies receive more representation, but size itself earns no points.
const BUCKET_LIMITS: Record<UniverseMarketCapBucket, number> = {
  small: 8,
  mid: 8,
  large: 4,
  mega: 2,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function linear(value: number | null, bad: number, good: number, neutral = 45) {
  if (value == null || !Number.isFinite(value)) return neutral;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function zeroCallSelectorScore(stock: DynamicUniverseStock) {
  const liquidity =
    stock.dollarVolume == null
      ? 45
      : linear(Math.log10(Math.max(stock.dollarVolume, 1)), 6, 8.5);

  const priceQuality = linear(stock.price, 5, 30);

  // This score only prioritizes which companies deserve scarce API calls.
  // Market cap contributes zero points. Sector/industry are intentionally not scored.
  return clamp(liquidity * 0.8 + priceQuality * 0.2);
}

function passesZeroCallGate(stock: DynamicUniverseStock) {
  if (!Number.isFinite(stock.price) || stock.price < 5) return false;
  if (!Number.isFinite(stock.marketCap) || stock.marketCap < 300_000_000) return false;

  // Smaller businesses require a stronger liquidity floor before they consume
  // expensive quarterly requests. The base universe already has a $1m floor.
  if (
    (stock.marketCapBucket === "small" || stock.marketCapBucket === "mid") &&
    stock.dollarVolume != null &&
    stock.dollarVolume < 2_000_000
  ) {
    return false;
  }

  return true;
}

function selectBucket(stocks: DynamicUniverseStock[], limit: number): Preselected[] {
  const eligible = stocks
    .filter(passesZeroCallGate)
    .map((stock) => ({ stock, selectorScore: zeroCallSelectorScore(stock) }));

  // Do not simply take the most liquid names; that would recreate large-company
  // bias inside each bucket. Split the cap-sorted bucket into slices and take the
  // strongest zero-call candidate from each slice.
  if (eligible.length <= limit) {
    return eligible.sort((a, b) => b.selectorScore - a.selectorScore);
  }

  const selected: Preselected[] = [];
  const sliceSize = eligible.length / limit;
  for (let i = 0; i < limit; i += 1) {
    const start = Math.floor(i * sliceSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * sliceSize));
    const slice = eligible.slice(start, end);
    slice.sort((a, b) => b.selectorScore - a.selectorScore);
    if (slice[0]) selected.push(slice[0]);
  }

  return selected;
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /status 429|limit reach|rate limit/i.test(message);
}

export async function runAcceleratedGrowthDiscovery(): Promise<AgDiscoveryResult> {
  const universe = await getDynamicDiscoveryUniverse();
  const byBucket = new Map<UniverseMarketCapBucket, DynamicUniverseStock[]>();
  for (const bucket of Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[]) byBucket.set(bucket, []);
  for (const stock of universe) byBucket.get(stock.marketCapBucket)?.push(stock);

  const selected: Preselected[] = [];
  const bucketSelectionCounts = { small: 0, mid: 0, large: 0, mega: 0 } as Record<UniverseMarketCapBucket, number>;
  for (const bucket of Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[]) {
    const bucketSelected = selectBucket(byBucket.get(bucket) ?? [], BUCKET_LIMITS[bucket]);
    bucketSelectionCounts[bucket] = bucketSelected.length;
    selected.push(...bucketSelected);
  }

  const candidates: AgDiscoveryCandidate[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  let rateLimited = false;

  // Full evaluation is sequential. The first provider-limit response terminates
  // the run so one exhausted quota cannot create dozens of doomed requests.
  for (const item of selected.sort((a, b) => b.selectorScore - a.selectorScore)) {
    try {
      const candidate = await evaluateAcceleratedGrowthCandidate(item.stock.ticker);
      candidates.push({
        ...candidate,
        selectorScore: Math.round(item.selectorScore * 10) / 10,
        sector: item.stock.sector,
        industry: item.stock.industry,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation failed.";
      errors.push({ symbol: item.stock.ticker, error: message });
      if (isRateLimitError(error)) {
        rateLimited = true;
        break;
      }
    }
  }

  const statusOrder = { ADVANCE: 0, REVIEW: 1, REJECT: 2, INSUFFICIENT_DATA: 3 } as const;
  candidates.sort((a, b) => statusOrder[a.score.status] - statusOrder[b.score.status] || b.score.total - a.score.total);

  return {
    universeCount: universe.length,
    preselectedCount: selected.length,
    evaluatedCount: candidates.length,
    advanceCount: candidates.filter((c) => c.score.status === "ADVANCE").length,
    reviewCount: candidates.filter((c) => c.score.status === "REVIEW").length,
    rejectCount: candidates.filter((c) => c.score.status === "REJECT").length,
    insufficientDataCount: candidates.filter((c) => c.score.status === "INSUFFICIENT_DATA").length,
    rateLimited,
    stoppedEarly: rateLimited || candidates.length + errors.length < selected.length,
    bucketSelectionCounts,
    candidates,
    errors,
  };
}
