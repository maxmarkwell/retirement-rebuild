import {
  getDynamicDiscoveryUniverse,
  type DynamicUniverseStock,
  type MarketCapBucket as UniverseMarketCapBucket,
} from "../dynamic-universe";
import { getLightFundamentals, type LightFundamentals } from "../light-fundamentals";
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
  bucketSelectionCounts: Record<UniverseMarketCapBucket, number>;
  candidates: AgDiscoveryCandidate[];
  errors: Array<{ symbol: string; error: string }>;
};

type Preselected = {
  stock: DynamicUniverseStock;
  fundamentals: LightFundamentals;
  selectorScore: number;
};

const BUCKET_LIMITS: Record<UniverseMarketCapBucket, number> = {
  small: 20,
  mid: 20,
  large: 10,
  mega: 5,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function linear(value: number | null, bad: number, good: number, neutral = 45) {
  if (value == null || !Number.isFinite(value)) return neutral;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function cheapSelectorScore(stock: DynamicUniverseStock, data: LightFundamentals) {
  const growth = linear(data.revenueGrowthPct, -10, 35);
  const margin = linear(data.operatingMarginPct, -10, 25);
  const roic = linear(data.returnOnInvestedCapitalPct, -5, 20);
  const fcf = data.freeCashFlow == null ? 45 : data.freeCashFlow > 0 ? 75 : 20;
  const leverage = data.netDebtToEbitda == null ? 45 : 100 - linear(data.netDebtToEbitda, 0, 5);
  const liquidity = stock.dollarVolume == null ? 45 : linear(Math.log10(Math.max(stock.dollarVolume, 1)), 6, 8);

  // This is only a cheap funnel. It intentionally does not attempt to reproduce
  // the quarterly AG score and market cap contributes no points.
  return clamp(growth * 0.35 + margin * 0.15 + roic * 0.15 + fcf * 0.15 + leverage * 0.10 + liquidity * 0.10);
}

function passesCheapGate(stock: DynamicUniverseStock, data: LightFundamentals) {
  if (data.revenue == null || data.revenue <= 0) return false;
  if (data.revenueGrowthPct != null && data.revenueGrowthPct < -15) return false;
  if (data.netDebtToEbitda != null && data.netDebtToEbitda > 6) return false;

  // Smaller businesses get more room to be early, but must clear a stronger
  // liquidity floor because financing/liquidity risk matters more there.
  if ((stock.marketCapBucket === "small" || stock.marketCapBucket === "mid") &&
      stock.dollarVolume != null && stock.dollarVolume < 2_000_000) return false;

  return true;
}

async function evaluateCheap(stock: DynamicUniverseStock): Promise<Preselected | null> {
  try {
    const fundamentals = await getLightFundamentals(stock.ticker);
    if (!passesCheapGate(stock, fundamentals)) return null;
    return { stock, fundamentals, selectorScore: cheapSelectorScore(stock, fundamentals) };
  } catch {
    return null;
  }
}

async function selectBucket(stocks: DynamicUniverseStock[], limit: number) {
  // Cap the number of annual-light calls per bucket. The dynamic universe is
  // market-cap sorted; sampling across it avoids evaluating thousands of names.
  const sampleLimit = Math.min(stocks.length, Math.max(limit * 4, limit));
  const sampled: DynamicUniverseStock[] = [];
  if (sampleLimit > 0) {
    const step = stocks.length / sampleLimit;
    for (let i = 0; i < sampleLimit; i += 1) {
      sampled.push(stocks[Math.min(stocks.length - 1, Math.floor(i * step))]);
    }
  }

  const evaluated: Preselected[] = [];
  // Sequential by design: Discovery should respect provider limits before speed.
  for (const stock of sampled) {
    const result = await evaluateCheap(stock);
    if (result) evaluated.push(result);
  }

  return evaluated.sort((a, b) => b.selectorScore - a.selectorScore).slice(0, limit);
}

export async function runAcceleratedGrowthDiscovery(): Promise<AgDiscoveryResult> {
  const universe = await getDynamicDiscoveryUniverse();
  const byBucket = new Map<UniverseMarketCapBucket, DynamicUniverseStock[]>();
  for (const bucket of Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[]) byBucket.set(bucket, []);
  for (const stock of universe) byBucket.get(stock.marketCapBucket)?.push(stock);

  const selected: Preselected[] = [];
  const bucketSelectionCounts = { small: 0, mid: 0, large: 0, mega: 0 } as Record<UniverseMarketCapBucket, number>;
  for (const bucket of Object.keys(BUCKET_LIMITS) as UniverseMarketCapBucket[]) {
    const bucketSelected = await selectBucket(byBucket.get(bucket) ?? [], BUCKET_LIMITS[bucket]);
    bucketSelectionCounts[bucket] = bucketSelected.length;
    selected.push(...bucketSelected);
  }

  const candidates: AgDiscoveryCandidate[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
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
      errors.push({ symbol: item.stock.ticker, error: error instanceof Error ? error.message : "Evaluation failed." });
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
    bucketSelectionCounts,
    candidates,
    errors,
  };
}
