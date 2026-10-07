import {
  getDynamicDiscoveryUniverse,
  type DynamicUniverseStock,
  type MarketCapBucket as UniverseMarketCapBucket,
} from "../dynamic-universe";
import { preScreenDynamicUniverse } from "../pre-screen";
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
  broadPreScreenCount: number;
  bucketSelectionCounts: Record<UniverseMarketCapBucket, number>;
  candidates: AgDiscoveryCandidate[];
  errors: Array<{ symbol: string; error: string }>;
  executionEvidenceInputs: Record<string,{volume:number|null;dollarVolume:number|null;sector:string|null}>;
};

type Preselected = { stock: DynamicUniverseStock; selectorScore: number };

const DISCOVERY_SOFT_BUDGET_MS = 150_000;

// Keep expensive quarterly evaluation bounded, but source those slots from the
// broader diversified pre-screen rather than sampling the raw universe directly.
const EVALUATION_LIMITS: Record<UniverseMarketCapBucket, number> = { small: 12, mid: 12, large: 8, mega: 4 };

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
function passesZeroCallGate(stock: DynamicUniverseStock) {
  if (!Number.isFinite(stock.price) || stock.price < 5) return false;
  if (!Number.isFinite(stock.marketCap) || stock.marketCap < 300_000_000) return false;
  if ((stock.marketCapBucket === "small" || stock.marketCapBucket === "mid") && stock.dollarVolume != null && stock.dollarVolume < 2_000_000) return false;
  return true;
}
function rankBucket(stocks: DynamicUniverseStock[], limit: number): Preselected[] {
  const eligible = stocks
    .filter(passesZeroCallGate)
    .map((stock) => ({ stock, selectorScore: zeroCallSelectorScore(stock) }))
    .sort((a, b) => b.selectorScore - a.selectorScore);

  // Preserve sector breadth inside each AG evaluation bucket. Liquidity still
  // breaks ties, but one hot/liquid sector cannot consume the whole quota.
  const sectorCap = Math.max(2, Math.ceil(limit * 0.34));
  const sectorCounts = new Map<string, number>();
  const selected: Preselected[] = [];
  for (const item of eligible) {
    if (selected.length >= limit) break;
    const sector = item.stock.sector ?? "Unknown";
    const count = sectorCounts.get(sector) ?? 0;
    if (count >= sectorCap) continue;
    selected.push(item);
    sectorCounts.set(sector, count + 1);
  }
  if (selected.length < limit) {
    const symbols = new Set(selected.map((item) => item.stock.ticker));
    for (const item of eligible) {
      if (selected.length >= limit) break;
      if (symbols.has(item.stock.ticker)) continue;
      selected.push(item);
      symbols.add(item.stock.ticker);
    }
  }
  return selected;
}
function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /status 429|limit reach|rate limit/i.test(message);
}

export async function runAcceleratedGrowthDiscovery(options?: { reassessSymbols?: string[] }): Promise<AgDiscoveryResult> {
  const discoveryStartedMs = Date.now();
  const universe = await getDynamicDiscoveryUniverse();
  // The shared pre-screen examines the full dynamic universe and produces a
  // liquid, sector-diversified shortlist (up to 400 names). AG then ranks only
  // that shortlist to choose a bounded set for the expensive quarterly calls.
  const broadPreScreen = preScreenDynamicUniverse(universe);
  const selected: Preselected[] = [];
  const bucketSelectionCounts = { small: 0, mid: 0, large: 0, mega: 0 } as Record<UniverseMarketCapBucket, number>;
  for (const bucket of Object.keys(EVALUATION_LIMITS) as UniverseMarketCapBucket[]) {
    const bucketSelected = rankBucket(
      broadPreScreen.selected.filter((stock) => stock.marketCapBucket === bucket),
      EVALUATION_LIMITS[bucket],
    );
    bucketSelectionCounts[bucket] = bucketSelected.length;
    selected.push(...bucketSelected);
  }

  // Unresolved research WATCHes are first-class reassessment candidates. They do
  // not need to win the zero-call selector again, but they must still exist in
  // the current investable universe. Deduplication prevents paying twice when a
  // watched ticker also qualifies naturally today.
  const selectedSymbols = new Set(selected.map((item) => item.stock.ticker.toUpperCase()));
  for (const rawSymbol of options?.reassessSymbols ?? []) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol || selectedSymbols.has(symbol)) continue;
    const stock = universe.find((item) => item.ticker.toUpperCase() === symbol);
    if (!stock) continue;
    selected.push({ stock, selectorScore: zeroCallSelectorScore(stock) });
    selectedSymbols.add(symbol);
  }

  const executionEvidenceInputs = Object.fromEntries(selected.map(({stock}) => [stock.ticker.toUpperCase(), {volume:stock.volume,dollarVolume:stock.dollarVolume,sector:stock.sector}]));
  const candidates: AgDiscoveryCandidate[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  let rateLimited = false;
  let budgetExhausted = false;
  for (const item of selected.sort((a, b) => b.selectorScore - a.selectorScore)) {
    if (Date.now() - discoveryStartedMs >= DISCOVERY_SOFT_BUDGET_MS) {
      budgetExhausted = true;
      console.warn("[AG discovery] soft time budget exhausted; remaining candidates skipped", {
        elapsedMs: Date.now() - discoveryStartedMs,
        evaluatedCount: candidates.length,
        selectedCount: selected.length,
      });
      break;
    }
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
    universeCount: universe.length, broadPreScreenCount: broadPreScreen.selectedCount,
    preselectedCount: selected.length, evaluatedCount: candidates.length,
    advanceCount: candidates.filter((c) => c.score.status === "ADVANCE").length,
    reviewCount: candidates.filter((c) => c.score.status === "REVIEW").length,
    rejectCount: candidates.filter((c) => c.score.status === "REJECT").length,
    insufficientDataCount: candidates.filter((c) => c.score.status === "INSUFFICIENT_DATA").length,
    rateLimited, stoppedEarly: budgetExhausted || rateLimited || candidates.length + errors.length < selected.length,
    bucketSelectionCounts, candidates, errors, executionEvidenceInputs,
  };
}
