import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordSellTransaction } from "@/lib/portfolio/record-sell";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "SELL persistence diagnostic is disabled in production." }, { status: 404 });
  }

  const createdTransactionIds: string[] = [];
  let fixturePortfolioId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const fixtureName = `FIFO SELL Diagnostic ${Date.now()}`;
    const { data: portfolio, error: portfolioError } = await supabase.from("portfolios").insert({
      user_id: user.id,
      name: fixtureName,
      type: "paper_long_term",
      is_real_money: false,
      starting_capital: 1000,
    }).select("id").single();
    if (portfolioError || !portfolio) throw new Error(`Unable to create isolated fixture portfolio: ${portfolioError?.message ?? "unknown error"}`);
    fixturePortfolioId = portfolio.id;

    const baseTime = Date.now() - 60_000;
    const fixtureBuys = [
      { quantity: 2, price: 10, fees: 1, at: new Date(baseTime).toISOString() },
      { quantity: 3, price: 20, fees: 0, at: new Date(baseTime + 10_000).toISOString() },
    ];

    for (const buy of fixtureBuys) {
      const gross = buy.quantity * buy.price;
      const { data, error } = await supabase.from("transactions").insert({
        user_id: user.id,
        portfolio_id: fixturePortfolioId,
        transaction_type: "buy",
        ticker: "ZZTEST",
        quantity: buy.quantity,
        price_per_share: buy.price,
        gross_amount: gross,
        fees: buy.fees,
        transaction_date: buy.at,
        notes: "Isolated FIFO SELL persistence diagnostic fixture.",
      }).select("id").single();
      if (error || !data) throw new Error(`Unable to create fixture BUY: ${error?.message ?? "unknown error"}`);
      createdTransactionIds.push(data.id);
    }

    const sale = await recordSellTransaction({
      portfolioId: fixturePortfolioId,
      ticker: "ZZTEST",
      quantity: 3,
      pricePerShare: 30,
      fees: 2,
      transactionDate: new Date(baseTime + 20_000).toISOString(),
      notes: "Isolated FIFO SELL persistence diagnostic sale.",
    });
    createdTransactionIds.push(sale.transactionId);

    const { data: persistedSell, error: sellError } = await supabase.from("transactions")
      .select("id, transaction_type, ticker, quantity, price_per_share, gross_amount, fees, cost_basis, realized_gain_loss, lot_method")
      .eq("id", sale.transactionId)
      .single();
    if (sellError || !persistedSell) throw new Error(`Unable to verify persisted SELL: ${sellError?.message ?? "unknown error"}`);

    const close = (actual: number | string | null, expected: number) => Math.abs(Number(actual) - expected) < 1e-8;
    const checks = {
      sellPersisted: persistedSell.transaction_type === "sell" && persistedSell.ticker === "ZZTEST",
      quantity: close(persistedSell.quantity, 3),
      grossAmount: close(persistedSell.gross_amount, 90),
      fees: close(persistedSell.fees, 2),
      fifoCostBasis: close(persistedSell.cost_basis, 41),
      realizedGainLoss: close(persistedSell.realized_gain_loss, 47),
      lotMethod: persistedSell.lot_method === "fifo",
      sharesOwnedBefore: Math.abs(sale.sharesOwnedBefore - 5) < 1e-8,
      sharesOwnedAfter: Math.abs(sale.sharesOwnedAfter - 2) < 1e-8,
      remainingCostBasisAfter: Math.abs(sale.remainingCostBasisAfter - 40) < 1e-8,
      consumedTwoLots: sale.consumedLots.length === 2,
    };
    const passed = Object.values(checks).every(Boolean);

    const cleanupTransactions = await supabase.from("transactions").delete().eq("portfolio_id", fixturePortfolioId);
    if (cleanupTransactions.error) throw new Error(`Diagnostic completed but transaction cleanup failed: ${cleanupTransactions.error.message}`);
    const cleanupPortfolio = await supabase.from("portfolios").delete().eq("id", fixturePortfolioId);
    if (cleanupPortfolio.error) throw new Error(`Diagnostic completed but portfolio cleanup failed: ${cleanupPortfolio.error.message}`);
    fixturePortfolioId = null;

    return NextResponse.json({
      sellPersistenceDiagnostic: true,
      isolatedFixturePortfolio: true,
      realPortfolioUntouched: true,
      fixtureTicker: "ZZTEST",
      actual: {
        transactionId: sale.transactionId,
        costBasis: sale.costBasis,
        realizedGainLoss: sale.realizedGainLoss,
        sharesOwnedBefore: sale.sharesOwnedBefore,
        sharesOwnedAfter: sale.sharesOwnedAfter,
        remainingCostBasisAfter: sale.remainingCostBasisAfter,
        consumedLots: sale.consumedLots,
      },
      checks,
      cleanedUp: true,
      passed,
    });
  } catch (error) {
    if (fixturePortfolioId) {
      try {
        const supabase = await createClient();
        await supabase.from("transactions").delete().eq("portfolio_id", fixturePortfolioId);
        await supabase.from("portfolios").delete().eq("id", fixturePortfolioId);
      } catch {
        // Preserve the original diagnostic failure.
      }
    }
    return NextResponse.json({
      sellPersistenceDiagnostic: true,
      isolatedFixturePortfolio: true,
      realPortfolioUntouched: true,
      passed: false,
      error: error instanceof Error ? error.message : "SELL persistence diagnostic failed.",
    }, { status: 500 });
  }
}
