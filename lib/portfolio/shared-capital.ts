/**
 * Shared-capital reconciliation preview, NOT an authorization to spend.
 * The real-money ledger is the only authority for cash. Paper AG transactions
 * are deliberately excluded from actual available cash.
 */
export type CashLedgerTransaction = {
  id: string;
  transactionType: "buy" | "sell";
  grossAmount: number;
  fees: number;
};
export type CashLedgerContribution = { id: string; amount: number };

function cents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid shared-capital ledger amount.");
  return Math.round(value * 100);
}
function sumUnique<T extends { id: string }>(records: T[], getAmount: (record: T) => number): number {
  const seen = new Set<string>();
  let total = 0;
  for (const record of records) {
    if (!record.id || seen.has(record.id)) throw new Error("Duplicate or missing ledger record ID.");
    seen.add(record.id);
    total += getAmount(record);
  }
  return total;
}
export function previewSharedCapital(input: {
  startingCapital: number;
  realContributions: CashLedgerContribution[];
  realTransactions: CashLedgerTransaction[];
  agRiskCap: number;
  agRealMarketValue: number;
  proposedAgPurchase?: number;
}) {
  const startingCents = cents(input.startingCapital);
  const contributedCents = sumUnique(input.realContributions, c => cents(c.amount));
  const netSpentCents = sumUnique(input.realTransactions, t => {
    const gross = cents(t.grossAmount), fees = cents(t.fees);
    if (t.transactionType === "buy") return gross + fees;
    if (fees > gross) throw new Error("Sell fees exceed sale proceeds.");
    return -(gross - fees);
  });
  const cashCents = startingCents + contributedCents - netSpentCents;
  if (cashCents < 0) throw new Error("Shared ledger shows negative cash; reconcile before continuing.");
  const capCents = cents(input.agRiskCap);
  const exposureCents = cents(input.agRealMarketValue);
  const remainingAgCapacityCents = Math.max(0, capCents - exposureCents);
  const agCashCeilingCents = Math.min(cashCents, remainingAgCapacityCents);
  const proposedCents = input.proposedAgPurchase == null ? null : cents(input.proposedAgPurchase);
  return {
    startingCapital: startingCents / 100,
    totalContributions: contributedCents / 100,
    sharedAvailableCash: cashCents / 100,
    agRemainingRiskCapacity: remainingAgCapacityCents / 100,
    agMaximumNewCapital: agCashCeilingCents / 100,
    hypotheticalPurchaseAffordable: proposedCents == null ? null : proposedCents <= agCashCeilingCents,
    mode: "read_only" as const,
  };
}
