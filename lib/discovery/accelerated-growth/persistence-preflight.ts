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

/** A ticker cannot be written by both holding review and new Committee research. */
export function assertDisjointAgDecisionBatches(
  holdingReviews: ReadonlyArray<{ symbol: string }>,
  committeeDecisions: ReadonlyArray<{ symbol: string }>
): void {
  const held = new Set(holdingReviews.map((decision) => decision.symbol.trim().toUpperCase()));
  for (const decision of committeeDecisions) {
    const symbol = decision.symbol.trim().toUpperCase();
    if (held.has(symbol)) {
      throw new Error(`AG persistence conflict: ${symbol} appears in both holding review and Committee output.`);
    }
  }
}
