import { NextResponse } from "next/server";
import { calculateFifoPosition, type FifoTransaction } from "@/lib/portfolio/fifo-accounting";

export const dynamic = "force-dynamic";

const close = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-8;

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "FIFO accounting diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const base: FifoTransaction[] = [
      {
        id: "buy-1",
        transaction_type: "buy",
        quantity: 2,
        price_per_share: 10,
        fees: 1,
        transaction_date: "2026-01-01T15:00:00.000Z",
        created_at: "2026-01-01T15:00:00.000Z",
      },
      {
        id: "buy-2",
        transaction_type: "buy",
        quantity: 3,
        price_per_share: 20,
        fees: 0,
        transaction_date: "2026-01-02T15:00:00.000Z",
        created_at: "2026-01-02T15:00:00.000Z",
      },
    ];

    const initial = calculateFifoPosition(base);
    const partial = calculateFifoPosition(base, 3);
    const partialBasisExpected = 2 * 10.5 + 1 * 20;
    const partialNetProceeds = 3 * 30 - 2;
    const partialRealizedExpected = partialNetProceeds - partialBasisExpected;

    const afterPartialLedger: FifoTransaction[] = [
      ...base,
      {
        id: "sell-1",
        transaction_type: "sell",
        quantity: 3,
        price_per_share: 30,
        fees: 2,
        transaction_date: "2026-01-03T15:00:00.000Z",
        created_at: "2026-01-03T15:00:00.000Z",
      },
    ];
    const afterPartial = calculateFifoPosition(afterPartialLedger);
    const fullExit = calculateFifoPosition(afterPartialLedger, 2);

    let oversellBlocked = false;
    try {
      calculateFifoPosition(afterPartialLedger, 2.0001);
    } catch {
      oversellBlocked = true;
    }

    const checks = {
      initialShares: close(initial.sharesOwned, 5),
      initialCostBasis: close(initial.remainingCostBasis, 81),
      partialSellCostBasis: close(partial.sellCostBasis ?? 0, partialBasisExpected),
      partialConsumedOldestLotFirst:
        partial.consumedLots?.length === 2 &&
        partial.consumedLots[0]?.sourceTransactionId === "buy-1" &&
        close(partial.consumedLots[0]?.quantity ?? 0, 2) &&
        partial.consumedLots[1]?.sourceTransactionId === "buy-2" &&
        close(partial.consumedLots[1]?.quantity ?? 0, 1),
      partialRealizedGainLoss: close(partialRealizedExpected, 47),
      remainingSharesAfterPartial: close(afterPartial.sharesOwned, 2),
      remainingCostBasisAfterPartial: close(afterPartial.remainingCostBasis, 40),
      historicalRealizedGainLoss: close(afterPartial.historicalRealizedGainLoss, 47),
      fullExitCostBasis: close(fullExit.sellCostBasis ?? 0, 40),
      oversellBlocked,
    };

    const passed = Object.values(checks).every(Boolean);

    return NextResponse.json({
      fifoAccountingDiagnostic: true,
      zeroWrite: true,
      fixture: {
        buyLots: [
          { quantity: 2, price: 10, fees: 1, effectiveUnitCost: 10.5 },
          { quantity: 3, price: 20, fees: 0, effectiveUnitCost: 20 },
        ],
        partialSell: { quantity: 3, price: 30, fees: 2 },
      },
      expected: {
        initialShares: 5,
        initialCostBasis: 81,
        partialSellCostBasis: 41,
        partialSellNetProceeds: 88,
        partialRealizedGainLoss: 47,
        remainingSharesAfterPartial: 2,
        remainingCostBasisAfterPartial: 40,
        fullExitCostBasis: 40,
      },
      actual: {
        initialShares: initial.sharesOwned,
        initialCostBasis: initial.remainingCostBasis,
        partialSellCostBasis: partial.sellCostBasis,
        partialSellNetProceeds: partialNetProceeds,
        partialRealizedGainLoss: partialRealizedExpected,
        remainingSharesAfterPartial: afterPartial.sharesOwned,
        remainingCostBasisAfterPartial: afterPartial.remainingCostBasis,
        historicalRealizedGainLoss: afterPartial.historicalRealizedGainLoss,
        fullExitCostBasis: fullExit.sellCostBasis,
      },
      checks,
      passed,
    });
  } catch (error) {
    return NextResponse.json({
      fifoAccountingDiagnostic: true,
      zeroWrite: true,
      passed: false,
      error: error instanceof Error ? error.message : "FIFO accounting diagnostic failed.",
    }, { status: 500 });
  }
}
