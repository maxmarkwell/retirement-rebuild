import { getMarketQuotes } from "@/lib/market-data/twelve-data";
import { calculateAgDrawdownState } from "./drawdown";

export type AgOpenHolding = {
  ticker: string;
  quantity: number;
};

export type AgAuthoritativeValuation = {
  holdingsMarketValue: number;
  prices: Record<string, number>;
  missingSymbols: string[];
  currentEquity: number;
  highWaterMark: number;
  drawdownPct: number;
  circuitBreakerActive: boolean;
  version: string;
};

export async function valueAgSleeve(params: {
  sleeveCap: number;
  netDeployed: number;
  holdings: AgOpenHolding[];
  persistedHighWaterMark: number;
}): Promise<AgAuthoritativeValuation> {
  const openHoldings = params.holdings.filter((h) => h.quantity > 0);
  const symbols = openHoldings.map((h) => h.ticker.trim().toUpperCase());
  const quotes = await getMarketQuotes(symbols);
  const missingSymbols = symbols.filter((symbol) => !quotes[symbol]);

  // Risk state must never silently fall back to cost basis or stale caller data.
  if (missingSymbols.length > 0) {
    throw new Error(`AG valuation blocked: missing market quote for ${missingSymbols.join(", ")}.`);
  }

  const prices: Record<string, number> = {};
  let holdingsMarketValue = 0;
  for (const holding of openHoldings) {
    const symbol = holding.ticker.trim().toUpperCase();
    const price = quotes[symbol]?.price;
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`AG valuation blocked: invalid market quote for ${symbol}.`);
    }
    prices[symbol] = price;
    holdingsMarketValue += holding.quantity * price;
  }

  holdingsMarketValue = Math.round(holdingsMarketValue * 100) / 100;
  const drawdown = calculateAgDrawdownState(
    { sleeveCap: params.sleeveCap, netDeployed: params.netDeployed, holdingsMarketValue },
    params.persistedHighWaterMark,
  );

  return {
    holdingsMarketValue,
    prices,
    missingSymbols,
    ...drawdown,
  };
}
