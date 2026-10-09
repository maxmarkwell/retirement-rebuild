/** Pure persistence planner. The database RPC must independently enforce
 * authorization, idempotency and atomicity; this planner is not a substitute. */
export type AgPersistenceAction = "REUSE" | "REPLACE" | "INSERT";
export type AgDecisionWrite = {
  cycleId: string;
  symbol: string;
  kind: "holding_review" | "committee";
  decisionType: string;
  payload: Record<string, unknown>;
};
export type AgDecisionWritePlan = AgDecisionWrite & {
  idempotencyKey: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,14}$/;

/** Reject ambiguous inputs before contacting the persistence RPC. */
export function planAgDecisionWrites(writes: readonly AgDecisionWrite[]): AgDecisionWritePlan[] {
  const seen = new Set<string>();
  if (!Array.isArray(writes)) throw new Error("Invalid AG persistence batch.");
  return writes.map((write) => {
    if (!write || typeof write.symbol !== "string" || typeof write.cycleId !== "string" ||
        typeof write.decisionType !== "string") {
      throw new Error("Invalid AG persistence write.");
    }
    const symbol = write.symbol.trim().toUpperCase();
    if (!UUID.test(write.cycleId) || !SYMBOL.test(symbol) ||
        (write.kind !== "holding_review" && write.kind !== "committee") ||
        !write.decisionType.trim() ||
        (write.kind === "committee" && !["buy", "watch", "avoid"].includes(write.decisionType)) ||
        (write.kind === "holding_review" && !["hold", "sell"].includes(write.decisionType)) ||
        !write.payload || Array.isArray(write.payload) ||
        typeof write.payload !== "object") {
      throw new Error("Invalid AG persistence write.");
    }
    // Disallow a ticker appearing twice in the same cycle, even across stages.
    const idempotencyKey = `${write.cycleId.toLowerCase()}:${symbol}`;
    if (seen.has(idempotencyKey)) throw new Error(`Duplicate AG write: ${symbol}`);
    seen.add(idempotencyKey);
    return { ...write, cycleId: write.cycleId.toLowerCase(), symbol, idempotencyKey };
  });
}

/** A timeout is never evidence that a write failed to commit. */
export function classifyAgPersistenceRecovery(input: {
  stageClaimed: boolean;
  completionConfirmed: boolean;
  databaseLedgerVerified: boolean;
}): "NOT_STARTED" | "COMPLETE" | "MANUAL_RECONCILIATION" {
  if (!input.stageClaimed) return "NOT_STARTED";
  if (input.completionConfirmed && input.databaseLedgerVerified) return "COMPLETE";
  return "MANUAL_RECONCILIATION";
}
