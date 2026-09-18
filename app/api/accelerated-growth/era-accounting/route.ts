import { NextResponse } from "next/server";
import {
  calculateAgEraAccounting,
  type EraTransaction,
  type StrategyEra,
} from "@/lib/discovery/accelerated-growth/era-accounting";

export const dynamic = "force-dynamic";

const era: StrategyEra = {
  id: "diagnostic-era",
  portfolio_id: "diagnostic-paper-active",
  strategy_key: "accelerated_growth",
  strategy_version: "ag-v1",
  inception_at: "2026-09-18T12:00:00.000Z",
  reference_total_capital: 200,
  execution_mode: "paper",
  ended_at: null,
};

function tx(type: string, total_amount: number, created_at: string): EraTransaction {
  return { type, total_amount, created_at };
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const cases = {
    historicalExcluded: calculateAgEraAccounting(era, [
      tx("buy", 5000, "2026-09-17T11:59:59.000Z"),
      tx("sell", 1000, "2026-09-17T12:00:00.000Z"),
    ]),
    inceptionBoundaryIncluded: calculateAgEraAccounting(era, [
      tx("buy", 5, "2026-09-18T12:00:00.000Z"),
    ]),
    oneSecondBeforeExcluded: calculateAgEraAccounting(era, [
      tx("buy", 9999, "2026-09-18T11:59:59.000Z"),
    ]),
    buyOnly: calculateAgEraAccounting(era, [
      tx("buy", 5, "2026-09-18T12:01:00.000Z"),
      tx("buy", 10, "2026-09-18T12:02:00.000Z"),
    ]),
    buyThenSell: calculateAgEraAccounting(era, [
      tx("buy", 10, "2026-09-18T12:01:00.000Z"),
      tx("sell", 4, "2026-09-18T12:02:00.000Z"),
    ]),
    contribution: calculateAgEraAccounting(era, [
      tx("contribution", 25, "2026-09-18T12:01:00.000Z"),
      tx("buy", 5, "2026-09-18T12:02:00.000Z"),
    ]),
    legacyAndAgMixed: calculateAgEraAccounting(era, [
      tx("buy", 8000, "2026-09-01T12:00:00.000Z"),
      tx("sell", 2000, "2026-09-10T12:00:00.000Z"),
      tx("buy", 5, "2026-09-18T12:01:00.000Z"),
      tx("buy", 5, "2026-09-18T12:02:00.000Z"),
      tx("sell", 2, "2026-09-18T12:03:00.000Z"),
    ]),
  };

  return NextResponse.json({
    version: "ag-era-accounting-diagnostic-v1",
    era,
    expected: {
      referenceTotalCapital: 200,
      sleeveCap: 40,
      historicalExcludedCash: 200,
      inceptionBoundaryCash: 195,
      oneSecondBeforeCash: 200,
      buyOnlyCash: 185,
      buyThenSellCash: 194,
      contributionCash: 220,
      legacyAndAgMixedCash: 192,
    },
    cases,
  });
}
