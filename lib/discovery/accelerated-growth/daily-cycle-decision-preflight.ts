/**
 * Holding reviews and new-candidate Committee decisions must not attempt to
 * supersede one another for the same ticker in a single cycle.
 * Run before the first database write.
 */
export function assertAgDecisionBatchIsUnambiguous(input: {
  holdingSymbols: readonly string[];
  committeeSymbols: readonly string[];
}): void {
  const seen = new Map<string, string>();
  for (const [stage, symbols] of [
    ["HOLDING", input.holdingSymbols],
    ["COMMITTEE", input.committeeSymbols],
  ] as const) {
    for (const raw of symbols) {
      const symbol = raw.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(symbol))
        throw new Error("AG_DECISION_INVALID_SYMBOL");
      if (seen.has(symbol))
        throw new Error("AG_DECISION_DUPLICATE_SYMBOL:" + symbol);
      seen.set(symbol, stage);
    }
  }
}
