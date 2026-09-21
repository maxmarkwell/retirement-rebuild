export const AG_DRAWDOWN_VERSION = "ag-drawdown-v2";

export type AgSleeveValuation = {
  sleeveCap: number;
  netDeployed: number;
  holdingsMarketValue: number;
};

export type AgDrawdownState = {
  currentEquity: number;
  highWaterMark: number;
  drawdownPct: number;
  circuitBreakerActive: boolean;
  version: string;
};

const money = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Pure AG sleeve drawdown math.
 *
 * Drawdown is measured against the dedicated AG risk sleeve, not the full
 * reference portfolio. Undeployed sleeve cash is sleeveCap - netDeployed.
 * Realized gains/losses naturally flow through netDeployed after sells.
 */
export function calculateAgDrawdownState(
  valuation: AgSleeveValuation,
  persistedHighWaterMark: number,
): AgDrawdownState {
  const sleeveCash = valuation.sleeveCap - valuation.netDeployed;
  const currentEquity = money(
    Math.max(0, sleeveCash) + Math.max(0, valuation.holdingsMarketValue),
  );
  const highWaterMark = money(Math.max(persistedHighWaterMark, currentEquity));
  const drawdownPct = highWaterMark > 0
    ? pct(((highWaterMark - currentEquity) / highWaterMark) * 100)
    : 0;

  return {
    currentEquity,
    highWaterMark,
    drawdownPct,
    circuitBreakerActive: drawdownPct >= 20,
    version: AG_DRAWDOWN_VERSION,
  };
}
