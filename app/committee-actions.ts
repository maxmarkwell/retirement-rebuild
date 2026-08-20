"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms/action-state";
import { getMarketQuote } from "@/lib/market-data/twelve-data";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { runInvestmentCommittee } from "@/lib/ai/committee";
import type { CommitteePortfolioMode } from "@/lib/ai/committee-types";
import { getCompanyFundamentals } from "@/lib/company-data/fmp";
import { getCompanyEarningsContext } from "@/lib/company-data/earnings";

export async function createCommitteeRun(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "You must be signed in.",
    };
  }

  const portfolioId =
    formData.get("portfolio_id") as string;

  const ticker = (
    formData.get("ticker") as string
  )
    ?.trim()
    .toUpperCase();

  if (!portfolioId || !ticker) {
    return {
      success: false,
      message: "Portfolio and ticker are required.",
    };
  }

  // ---------------------------------------------------------
  // Load selected portfolio
  // ---------------------------------------------------------

  const {
    data: portfolio,
    error: portfolioError,
  } = await supabase
    .from("portfolios")
    .select(
      "id, name, type, starting_capital"
    )
    .eq("id", portfolioId)
    .single();

  if (portfolioError || !portfolio) {
    return {
      success: false,
      message:
        "Unable to load the selected portfolio.",
    };
  }

  if (
    portfolio.type !== "paper_active" &&
    portfolio.type !== "paper_long_term"
  ) {
    return {
      success: false,
      message:
        "AI committee runs are only available for AI Active and AI Long-Term portfolios.",
    };
  }

  const portfolioMode =
    portfolio.type as CommitteePortfolioMode;

  // ---------------------------------------------------------
  // Load contributions
  // ---------------------------------------------------------

  const {
    data: contributions,
    error: contributionsError,
  } = await supabase
    .from("contributions")
    .select("portfolio_id, amount")
    .eq("portfolio_id", portfolioId);

  if (contributionsError) {
    throw new Error(
      `Unable to load contributions: ${contributionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load portfolio transactions
  // ---------------------------------------------------------

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select(
      "portfolio_id, transaction_type, ticker, quantity, gross_amount, fees, transaction_date, created_at"
    )
    .eq("portfolio_id", portfolioId)
    .order("transaction_date", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (transactionsError) {
    throw new Error(
      `Unable to load transactions: ${transactionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load current ticker quote
  // ---------------------------------------------------------

  let marketPrice: number | null =
    null;

  try {
    const quote =
      await getMarketQuote(ticker);

    marketPrice =
      quote.price;
  } catch (error) {
    console.error(
      `Unable to retrieve market price for ${ticker}:`,
      error
    );
  }

  // ---------------------------------------------------------
  // Build market-price map for portfolio accounting
  // ---------------------------------------------------------

  const marketPrices: Record<
    string,
    number
  > = {};

  if (marketPrice != null) {
    marketPrices[ticker] =
      marketPrice;
  }

  /*
    For now, the committee only needs accurate context
    for the submitted ticker plus cash.

    Existing holdings without a live quote will continue
    using the accounting engine's cost-basis fallback.

    We'll improve this later by loading quotes for every
    currently held real symbol before committee analysis.
  */

  const accounting =
    calculatePortfolioAccounting(
      portfolio,
      contributions ?? [],
      transactions ?? [],
      marketPrices
    );

  const currentHolding =
    accounting.holdings.find(
      (holding) =>
        holding.ticker === ticker
    );

  const currentHoldingQuantity =
    currentHolding?.quantity ?? 0;

  const currentHoldingMarketValue =
    currentHolding?.marketValue ?? 0;

  const currentHoldingCostBasis =
    currentHolding?.totalCost ?? 0;

  // ---------------------------------------------------------
  // Create pending committee run
  // ---------------------------------------------------------

  const {
    data: committeeRun,
    error: createRunError,
  } = await supabase
    .from("ai_committee_runs")
    .insert({
      user_id: user.id,
      portfolio_id: portfolioId,
      ticker,
      market_price: marketPrice,
      status: "researching",
      prompt_version:
        "phase-1-v1",
    })
    .select("id")
    .single();

  if (
    createRunError ||
    !committeeRun
  ) {
    throw new Error(
      `Unable to create committee run: ${
        createRunError?.message ??
        "Unknown error"
      }`
    );
  }

let fundamentals = null;

try {
  fundamentals =
    await getCompanyFundamentals(ticker);
} catch (error) {
  console.error(
    `Unable to load fundamentals for ${ticker}:`,
    error
  );
}

// ---------------------------------------------------------
// Load earnings context
// ---------------------------------------------------------

let earnings = null;

try {
  earnings =
    await getCompanyEarningsContext(ticker);
} catch (error) {
  console.error(
    `Unable to load earnings context for ${ticker}:`,
    error
  );
}

// ---------------------------------------------------------
// Run AI Investment Committee
// ---------------------------------------------------------

try {
  const result =
    await runInvestmentCommittee({        ticker,
        marketPrice,
        portfolioMode,
        portfolioName:
          portfolio.name,
        availableCash:
          accounting.cash,
        currentHoldingQuantity,
        currentHoldingMarketValue,
        currentHoldingCostBasis,
        fundamentals,
        earnings,
      });

    // ---------------------------------------------------------
    // Create investment decision
    // ---------------------------------------------------------

    const finalDecision =
      result.finalDecision;

    const {
      data: decision,
      error: decisionError,
    } = await supabase
      .from("investment_decisions")
      .insert({
        user_id: user.id,
        portfolio_id:
          portfolioId,
        transaction_id: null,

        decision_type:
          finalDecision.recommendation,

        ticker,

        decision_date:
          new Date().toISOString(),

        decision_price:
          marketPrice,

        recommended_quantity:
          null,

        recommended_allocation:
          finalDecision.recommendedAllocation,

        confidence_score:
          finalDecision.confidence,

        risk_level:
          finalDecision.riskLevel,

        expected_holding_period:
          finalDecision.expectedHoldingPeriod,

        thesis:
          finalDecision.finalThesis,

        bull_case:
          result.specialistAnalysis
            .bullCase,

        bear_case:
          result.specialistAnalysis
            .bearCase,

        primary_risks:
          result.specialistAnalysis
            .riskAnalysis,

        reassessment_conditions:
          finalDecision.reassessmentConditions,

        exit_conditions:
          finalDecision.exitConditions,

        source:
          "ai_committee",

        status:
          "active",
      })
      .select("id")
      .single();

    if (
      decisionError ||
      !decision
    ) {
      throw new Error(
        `Unable to create investment decision: ${
          decisionError?.message ??
          "Unknown error"
        }`
      );
    }

    // ---------------------------------------------------------
    // Save completed committee analysis
    // ---------------------------------------------------------

    const {
      error: updateRunError,
    } = await supabase
      .from("ai_committee_runs")
      .update({
        decision_id:
          decision.id,

        status:
          "completed",

        research_analysis:
          result.specialistAnalysis
            .researchAnalysis,

        bull_case:
          result.specialistAnalysis
            .bullCase,

        bear_case:
          result.specialistAnalysis
            .bearCase,

        risk_analysis:
          result.specialistAnalysis
            .riskAnalysis,

        portfolio_analysis:
          result.specialistAnalysis
            .portfolioAnalysis,

        final_recommendation:
          finalDecision.recommendation,

        final_confidence:
          finalDecision.confidence,

        final_risk_level:
          finalDecision.riskLevel,

        recommended_allocation:
          finalDecision.recommendedAllocation,

        expected_holding_period:
          finalDecision.expectedHoldingPeriod,

        final_thesis:
          finalDecision.finalThesis,

        reassessment_conditions:
          finalDecision.reassessmentConditions,

        exit_conditions:
          finalDecision.exitConditions,

        model_name:
          `${result.specialistModel} + ${result.chairModel}`,

        prompt_version:
          result.promptVersion,

        completed_at:
          new Date().toISOString(),

        error_message:
          null,
      })
      .eq(
        "id",
        committeeRun.id
      );

    if (updateRunError) {
      throw new Error(
        `Committee decision was created, but the committee run could not be completed: ${updateRunError.message}`
      );
    }

    revalidatePath(
      "/research"
    );

    revalidatePath(
      "/decisions"
    );

    return {
      success: true,
      message:
        `${ticker} committee completed: ` +
        `${finalDecision.recommendation.toUpperCase()} ` +
        `with ${finalDecision.confidence.toFixed(
          0
        )}/100 confidence.`,
    };
  } catch (error) {
    // ---------------------------------------------------------
    // Preserve failed run for audit/debugging
    // ---------------------------------------------------------

    const message =
      error instanceof Error
        ? error.message
        : "Unknown AI committee error.";

    await supabase
      .from("ai_committee_runs")
      .update({
        status:
          "failed",

        error_message:
          message,

        completed_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        committeeRun.id
      );

    console.error(
      "AI committee run failed:",
      error
    );

    return {
      success: false,
      message:
        `Committee run failed: ${message}`,
    };
  }
}