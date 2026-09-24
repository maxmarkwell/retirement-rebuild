export type FifoTransaction = {
  id?: string;
  transaction_type: string;
  quantity: number | string | null;
  price_per_share: number | string | null;
  fees?: number | string | null;
  transaction_date: string;
  created_at?: string | null;
};

type FifoLot = {
  sourceTransactionId: string | null;
  remainingQuantity: number;
  unitCost: number;
};

const EPSILON = 1e-8;

function finiteNumber(value: number | string | null | undefined, label: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} in transaction ledger.`);
  return parsed;
}

export function calculateFifoPosition(
  transactions: FifoTransaction[],
  requestedSellQuantity?: number
) {
  const ordered = [...transactions].sort((a, b) => {
    const dateDelta = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    if (dateDelta !== 0) return dateDelta;
    return String(a.created_at ?? a.id ?? "").localeCompare(String(b.created_at ?? b.id ?? ""));
  });

  const lots: FifoLot[] = [];
  let historicalRealizedGainLoss = 0;

  const consume = (quantity: number) => {
    let remaining = quantity;
    let costBasis = 0;

    for (const lot of lots) {
      if (remaining <= EPSILON) break;
      if (lot.remainingQuantity <= EPSILON) continue;
      const consumed = Math.min(lot.remainingQuantity, remaining);
      costBasis += consumed * lot.unitCost;
      lot.remainingQuantity -= consumed;
      remaining -= consumed;
    }

    if (remaining > EPSILON) {
      throw new Error("Transaction ledger contains a SELL larger than the FIFO position available at that time.");
    }
    return costBasis;
  };

  for (const transaction of ordered) {
    const quantity = finiteNumber(transaction.quantity, "quantity");
    const price = finiteNumber(transaction.price_per_share, "price");
    const fees = finiteNumber(transaction.fees, "fees");
    if (quantity <= 0) continue;

    if (transaction.transaction_type === "buy") {
      if (price <= 0) throw new Error("BUY transaction has an invalid price in the ledger.");
      lots.push({
        sourceTransactionId: transaction.id ?? null,
        remainingQuantity: quantity,
        unitCost: (quantity * price + fees) / quantity,
      });
    } else if (transaction.transaction_type === "sell") {
      if (price <= 0) throw new Error("SELL transaction has an invalid price in the ledger.");
      const basis = consume(quantity);
      historicalRealizedGainLoss += quantity * price - fees - basis;
    }
  }

  const openLots = lots.filter((lot) => lot.remainingQuantity > EPSILON);
  const sharesOwned = openLots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const remainingCostBasis = openLots.reduce(
    (sum, lot) => sum + lot.remainingQuantity * lot.unitCost,
    0
  );

  if (requestedSellQuantity === undefined) {
    return { sharesOwned, remainingCostBasis, historicalRealizedGainLoss, openLots };
  }

  if (!Number.isFinite(requestedSellQuantity) || requestedSellQuantity <= 0) {
    throw new Error("SELL quantity must be greater than zero.");
  }
  if (requestedSellQuantity - sharesOwned > EPSILON) {
    throw new Error("SELL quantity exceeds the FIFO position available.");
  }

  let remaining = requestedSellQuantity;
  let sellCostBasis = 0;
  const consumedLots: Array<{ sourceTransactionId: string | null; quantity: number; unitCost: number }> = [];

  for (const lot of openLots) {
    if (remaining <= EPSILON) break;
    const consumed = Math.min(lot.remainingQuantity, remaining);
    sellCostBasis += consumed * lot.unitCost;
    consumedLots.push({ sourceTransactionId: lot.sourceTransactionId, quantity: consumed, unitCost: lot.unitCost });
    remaining -= consumed;
  }

  return {
    sharesOwned,
    remainingCostBasis,
    historicalRealizedGainLoss,
    openLots,
    sellCostBasis,
    consumedLots,
  };
}
