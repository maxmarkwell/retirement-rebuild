export type AgThemeExposureTransaction = {
  ticker: string | null;
  ag_theme_key: string | null;
};

export type AgThemeExposureHolding = {
  ticker: string;
  quantity: number;
};

const THEME_KEY_PATTERN = /^ag-theme-v1:sector:[a-z0-9-]+$/;

export function calculateAgThemeMarketValue(input: {
  targetThemeKey: string;
  holdings: AgThemeExposureHolding[];
  prices: Record<string, number>;
  transactions: AgThemeExposureTransaction[];
}): number {
  if (!THEME_KEY_PATTERN.test(input.targetThemeKey)) {
    throw new Error("AG BUY lacks deterministic theme attribution.");
  }

  let marketValue = 0;

  for (const holding of input.holdings) {
    if (holding.quantity <= 0) continue;
    const ticker = holding.ticker.toUpperCase();
    const keys = new Set(
      input.transactions
        .filter((tx) => tx.ticker?.toUpperCase() === ticker)
        .map((tx) => tx.ag_theme_key)
    );

    if (keys.has(null) || keys.size === 0) {
      throw new Error(`AG holding ${ticker} lacks complete theme attribution.`);
    }
    if (keys.size !== 1) {
      throw new Error(`AG holding ${ticker} has inconsistent theme attribution.`);
    }

    const [holdingThemeKey] = Array.from(keys);
    if (!holdingThemeKey || !THEME_KEY_PATTERN.test(holdingThemeKey)) {
      throw new Error(`AG holding ${ticker} has invalid theme attribution.`);
    }
    if (holdingThemeKey !== input.targetThemeKey) continue;

    const price = input.prices[ticker];
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`AG holding ${ticker} lacks a valid valuation price.`);
    }
    marketValue += holding.quantity * price;
  }

  return Math.round(marketValue * 100) / 100;
}
