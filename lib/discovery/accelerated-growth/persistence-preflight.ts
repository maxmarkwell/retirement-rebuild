/** Fail before any writes if research outputs contain ambiguous duplicate tickers. */
export function assertUniqueAgDecisionTickers(
  decisions: ReadonlyArray<{ symbol: string }>,
  stage: string
): void {
  const seen = new Set<string>();
  for (const decision of decisions) {
    const symbol = decision.symbol?.trim().toUpperCase();
    if (!symbol || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
      throw new Error(`Invalid ticker in ${stage} output.`);
    }
    if (seen.has(symbol)) {
      throw new Error(`Duplicate ticker ${symbol} in ${stage} output; persistence blocked.`);
    }
    seen.add(symbol);
  }
}
