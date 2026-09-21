export const AG_DRAWDOWN_VERSION = "ag-drawdown-v1";

export type AgSleeveValuation = {
  cash: number;
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
 * Equity is cash + marked holdings. HWM must come from persisted AG-era state;
 * callers must never manufacture it from the current valuation. Contributions
 * are handled by accounting before valuation and therefore do not masquerade
 * as investment performance here.
 */
export function calculateAgDrawdownState(
  valuation: AgSleeveValuation,
  persistedHighWaterMark: number,
): AgDrawdownState {
  const currentEquity = money(
    Math.max(0, valuation.cash) + Math.max(0, valuation.holdingsMarketValue),
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
