import { getDynamicDiscoveryUniverse } from "../dynamic-universe";

export const AG_LIQUIDITY_VERSION = "ag-liquidity-v1";
export const AG_MIN_SHARE_VOLUME = 50_000;
export const AG_MIN_DOLLAR_VOLUME = 1_000_000;

export type AgLiquidityEvidence = {
  eligible: boolean;
  shareVolume: number | null;
  dollarVolume: number | null;
  minimumShareVolume: number;
  minimumDollarVolume: number;
  version: string;
};

export async function evaluateAgLiquidity(symbol: string): Promise<AgLiquidityEvidence> {
  const normalized = symbol.trim().toUpperCase();
  const universe = await getDynamicDiscoveryUniverse();
  const stock = universe.find((candidate) => candidate.ticker === normalized);

  // Fail closed when the current deterministic universe cannot establish both
  // liquidity measures. Committee/AI output is never used as a substitute.
  const shareVolume = stock?.volume ?? null;
  const dollarVolume = stock?.dollarVolume ?? null;
  const eligible =
    shareVolume != null &&
    dollarVolume != null &&
    Number.isFinite(shareVolume) &&
    Number.isFinite(dollarVolume) &&
    shareVolume >= AG_MIN_SHARE_VOLUME &&
    dollarVolume >= AG_MIN_DOLLAR_VOLUME;

  return {
    eligible,
    shareVolume,
    dollarVolume,
    minimumShareVolume: AG_MIN_SHARE_VOLUME,
    minimumDollarVolume: AG_MIN_DOLLAR_VOLUME,
    version: AG_LIQUIDITY_VERSION,
  };
}
