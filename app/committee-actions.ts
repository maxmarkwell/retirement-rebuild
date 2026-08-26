"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms/action-state";
import { getMarketQuote } from "@/lib/market-data/twelve-data";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { calculatePositionSizing } from "@/lib/portfolio/position-sizing";
import { runInvestmentCommittee } from "@/lib/ai/committee";
import type { CommitteePortfolioMode } from "@/lib/ai/committee-types";
import { getCompanyFundamentals } from "@/lib/company-data/fmp";
import { getCompanyEarningsContext } from "@/lib/company-data/earnings";
import { getCompanyFundamentalTrends } from "@/lib/company-data/trends";

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

  const reassessmentId =
  (
    formData.get(
      "reassessment_id"
    ) as string
  )?.trim() ?? "";

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
    .select("id, name, type, starting_capital")
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
// Load reassessment context
// ---------------------------------------------------------

let reassessment:
  {
    id: string;
    decision_id: string;
    ticker: string;
    status: string;
    scheduled_for: string | null;
    trigger_reason: string | null;
    prior_decision_type: string | null;
    prior_confidence:
      number | string | null;
    prior_price:
      number | string | null;
    evidence_snapshot: unknown;
  } |
  null = null;

if (reassessmentId) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "investment_reassessments"
      )
      .select(
        `
        id,
        decision_id,
        ticker,
        status,
        scheduled_for,
        trigger_reason,
        prior_decision_type,
        prior_confidence,
        prior_price,
        evidence_snapshot
        `
      )
      .eq(
        "id",
        reassessmentId
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "portfolio_id",
        portfolioId
      )
      .single();

  if (
    error ||
    !data
  ) {
    return {
      success: false,
      message:
        "Unable to load the reassessment.",
    };
  }

  if (
    data.ticker
      .trim()
      .toUpperCase() !==
    ticker
  ) {
    return {
      success: false,
      message:
        "Reassessment ticker does not match the requested security.",
    };
  }

  if (
    data.status !==
      "pending" &&
    data.status !==
      "ready"
  ) {
    return {
      success: false,
      message:
        "This reassessment is no longer active.",
    };
  }

  // -------------------------------------------------------
  // Enforce reassessment timing server-side
  // -------------------------------------------------------

  if (
    data.status ===
      "pending"
  ) {
    const scheduledTime =
      data.scheduled_for
        ? new Date(
            data.scheduled_for
          ).getTime()
        : null;

    const isDue =
      scheduledTime != null &&
      Number.isFinite(
        scheduledTime
      ) &&
      scheduledTime <=
        Date.now();

    if (!isDue) {
      return {
        success: false,
        message:
          data.scheduled_for
            ? `This reassessment is not due until ${new Date(
                data.scheduled_for
              ).toLocaleDateString(
                "en-US",
                {
                  timeZone:
                    "America/Denver",
                  year:
                    "numeric",
                  month:
                    "short",
                  day:
                    "numeric",
                }
              )}.`
            : "This reassessment is not ready yet.",
      };
    }
  }

  reassessment =
    data;

  const {
    error:
      readyError,
  } =
    await supabase
      .from(
        "investment_reassessments"
      )
      .update({
        status:
          "ready",

        triggered_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        reassessmentId
      )
      .eq(
        "user_id",
        user.id
      );

  if (readyError) {
    throw new Error(
      `Unable to mark reassessment ready: ${readyError.message}`
    );
  }
}

  // ---------------------------------------------------------
  // Load latest Discovery V2 evidence
  // ---------------------------------------------------------

  const {
    data: discoveryCandidate,
    error: discoveryError,
  } =
    await supabase
      .from(
        "stock_discovery_candidates"
      )
      .select(
        `
        id,
        discovery_date,
        scoring_version,

        quality_score,
        growth_score,
        valuation_score,
        trend_quality_score,
        capital_discipline_score,

        selector_score,
        deep_score,
        portfolio_fit_score,
        total_score,

        market_cap_bucket,
        sector,
        industry,

        reason_summary
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "portfolio_type",
        portfolioMode
      )
      .eq(
        "ticker",
        ticker
      )
      .eq(
        "scoring_version",
        "v2"
      )
      .order(
        "discovery_date",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (discoveryError) {
    throw new Error(
      `Unable to load Discovery V2 evidence: ${discoveryError.message}`
    );
  }

  const discoveryEvidence =
    discoveryCandidate
      ? {
          discoveryDate:
            discoveryCandidate.discovery_date,

          scoringVersion:
            discoveryCandidate.scoring_version,

          qualityScore:
            Number(
              discoveryCandidate.quality_score
            ),

          growthScore:
            Number(
              discoveryCandidate.growth_score
            ),

          valuationScore:
            Number(
              discoveryCandidate.valuation_score
            ),

          trendQualityScore:
            Number(
              discoveryCandidate.trend_quality_score
            ),

          capitalDisciplineScore:
            Number(
              discoveryCandidate.capital_discipline_score
            ),

          selectorScore:
            Number(
              discoveryCandidate.selector_score
            ),

          deepScore:
            Number(
              discoveryCandidate.deep_score
            ),

          portfolioFitScore:
            Number(
              discoveryCandidate.portfolio_fit_score
            ),

          totalScore:
            Number(
              discoveryCandidate.total_score
            ),

          marketCapBucket:
            discoveryCandidate.market_cap_bucket,

          sector:
            discoveryCandidate.sector,

          industry:
            discoveryCandidate.industry,

          reasonSummary:
            discoveryCandidate.reason_summary,
        }
      : null;

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
        holding.ticker
          .trim()
          .toUpperCase() === ticker
    );

  const currentHoldingQuantity =
    currentHolding?.quantity ?? 0;

  const currentHoldingMarketValue =
    currentHolding?.marketValue ?? 0;

  const currentHoldingCostBasis =
    currentHolding?.totalCost ?? 0;

  // ---------------------------------------------------------
  // Create committee run
  // ---------------------------------------------------------

  const {
    data: committeeRun,
    error: createRunError,
  } = await supabase
    .from("ai_committee_runs")
.insert({
  user_id:
    user.id,

  portfolio_id:
    portfolioId,

  ticker,

  market_price:
    marketPrice,

  status:
    "researching",

  prompt_version:
    "phase-1-v1",

  discovery_candidate_id:
    discoveryCandidate?.id ??
    null,

  discovery_evidence:
    discoveryEvidence,
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

  // ---------------------------------------------------------
  // Load company fundamentals
  // ---------------------------------------------------------

  let fundamentals = null;

  try {
    fundamentals =
      await getCompanyFundamentals(
        ticker
      );
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
      await getCompanyEarningsContext(
        ticker
      );
  } catch (error) {
    console.error(
      `Unable to load earnings context for ${ticker}:`,
      error
    );
  }

// ---------------------------------------------------------
// Load historical fundamental trends
// ---------------------------------------------------------

let trends = null;

try {
  trends =
    await getCompanyFundamentalTrends(
      ticker
    );
} catch (error) {
  console.error(
    `Unable to load fundamental trends for ${ticker}:`,
    error
  );
}

  // ---------------------------------------------------------
  // Run AI Investment Committee
  // ---------------------------------------------------------

type DiscoveryEvidence = {
  discoveryDate: string;
  scoringVersion: string | null;

  qualityScore: number;
  growthScore: number;
  valuationScore: number;

  trendQualityScore: number;
  capitalDisciplineScore: number;

  selectorScore: number;
  deepScore: number;
  portfolioFitScore: number;
  totalScore: number;

  marketCapBucket: string | null;
  sector: string | null;
  industry: string | null;

  reasonSummary: string | null;
};

  try {
    const result =
      await runInvestmentCommittee({
        ticker,
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
        trends,

        discoveryEvidence,


      });

    const finalDecision =
      result.finalDecision;

    // ---------------------------------------------------------
    // Deterministic position sizing
    // ---------------------------------------------------------

    let recommendedQuantity:
      number | null = null;

    let recommendedAllocation:
      number | null = null;

    if (
      finalDecision.recommendation === "buy" &&
      marketPrice != null &&
      marketPrice > 0
    ) {
      const sizing =
        calculatePositionSizing({
          portfolioMode,

          portfolioTotalValue:
            accounting.permanentCapital,

          availableCash:
            accounting.cash,

          currentPrice:
            marketPrice,

          currentHoldingMarketValue,

          confidenceScore:
            finalDecision.confidence,

          riskLevel:
            finalDecision.riskLevel,
        });

      recommendedQuantity =
        sizing.suggestedShares;

      recommendedAllocation =
        sizing.targetPositionValue;
    }

    if (
      finalDecision.recommendation === "hold"
    ) {
      recommendedQuantity =
        null;

      recommendedAllocation =
        currentHoldingMarketValue;
    }

    if (
      finalDecision.recommendation === "watch" ||
      finalDecision.recommendation === "avoid" ||
      finalDecision.recommendation === "sell"
    ) {
      recommendedQuantity =
        null;

      recommendedAllocation =
        null;
    }

    if (
      finalDecision.recommendation ===
      "rebalance"
    ) {
      recommendedQuantity =
        null;

      recommendedAllocation =
        currentHoldingMarketValue;
    }

    // ---------------------------------------------------------
    // Create investment decision
    // ---------------------------------------------------------

    const {
      data: decision,
      error: decisionError,
    } = await supabase
      .from("investment_decisions")
      .insert({
        user_id:
          user.id,

        portfolio_id:
          portfolioId,

        transaction_id:
          null,

        decision_type:
          finalDecision.recommendation,

        ticker,

        decision_date:
          new Date().toISOString(),

        decision_price:
          marketPrice,

        recommended_quantity:
          recommendedQuantity,

        recommended_allocation:
          recommendedAllocation,

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
// Complete originating reassessment
// ---------------------------------------------------------

if (
  reassessment
) {
  const {
    error:
      completeReassessmentError,
  } =
    await supabase
      .from(
        "investment_reassessments"
      )
      .update({
        status:
          "completed",

        completed_at:
          new Date()
            .toISOString(),

        new_decision_type:
          finalDecision
            .recommendation,

        new_confidence:
          finalDecision
            .confidence,

        reassessment_price:
          marketPrice,

        reassessment_summary:
          finalDecision
            .finalThesis,
      })
      .eq(
        "id",
        reassessment.id
      )
      .eq(
        "user_id",
        user.id
      );

  if (
    completeReassessmentError
  ) {
    throw new Error(
      `New decision was created, but reassessment could not be completed: ${completeReassessmentError.message}`
    );
  }
}

    // ---------------------------------------------------------
    // Create WATCH reassessment
    // ---------------------------------------------------------

    if (
      finalDecision.recommendation ===
      "watch"
    ) {
      const nextExpectedEarningsDate =
        earnings?.nextExpected
          ?.date ??
        null;

      let scheduledFor:
        string | null =
        null;

      let triggerType:
        "earnings" |
        "scheduled" =
        "scheduled";

      // -------------------------------------------------------
      // Prefer the next expected earnings date
      // -------------------------------------------------------

      if (
        nextExpectedEarningsDate
      ) {
        const earningsDate =
          new Date(
            `${nextExpectedEarningsDate}T16:00:00-06:00`
          );

        if (
          Number.isFinite(
            earningsDate.getTime()
          )
        ) {
          scheduledFor =
            earningsDate.toISOString();

          triggerType =
            "earnings";
        }
      }

      // -------------------------------------------------------
      // Fallback: review again in 60 days
      // -------------------------------------------------------

      if (!scheduledFor) {
        const fallbackDate =
          new Date();

        fallbackDate.setDate(
          fallbackDate.getDate() +
            60
        );

        scheduledFor =
          fallbackDate.toISOString();

        triggerType =
          "scheduled";
      }

      // -------------------------------------------------------
      // Prevent duplicate active reassessments
      // -------------------------------------------------------

      const {
        data:
          existingReassessment,
        error:
          existingReassessmentError,
      } =
        await supabase
          .from(
            "investment_reassessments"
          )
          .select(
            "id"
          )
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "decision_id",
            decision.id
          )
          .in(
            "status",
            [
              "pending",
              "ready",
            ]
          )
          .maybeSingle();

      if (
        existingReassessmentError
      ) {
        throw new Error(
          `Unable to check existing WATCH reassessments: ${existingReassessmentError.message}`
        );
      }

      // -------------------------------------------------------
      // Create reassessment only when one does not exist
      // -------------------------------------------------------

      if (
        !existingReassessment
      ) {
        const {
          error:
            reassessmentError,
        } =
          await supabase
            .from(
              "investment_reassessments"
            )
            .insert({
              user_id:
                user.id,

              portfolio_id:
                portfolioId,

              decision_id:
                decision.id,

              ticker,

              status:
                "pending",

              trigger_type:
                triggerType,

              scheduled_for:
                scheduledFor,

              trigger_reason:
                finalDecision
                  .reassessmentConditions,

              prior_decision_type:
                finalDecision
                  .recommendation,

              prior_confidence:
                finalDecision
                  .confidence,

              prior_price:
                marketPrice,

              evidence_snapshot: {
                discoveryEvidence,

                fundamentals,

                earnings,

                trends,

                specialistAnalysis:
                  result.specialistAnalysis,

                finalDecision,
              },
            });

        if (
          reassessmentError
        ) {
          throw new Error(
            `Investment decision was created, but WATCH reassessment could not be scheduled: ${reassessmentError.message}`
          );
        }
      }
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
          recommendedAllocation,

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

    const sizingMessage =
      recommendedQuantity != null
        ? ` Suggested initial position: ${recommendedQuantity} shares.`
        : "";

    return {
      success: true,
      message:
        `${ticker} committee completed: ` +
        `${finalDecision.recommendation.toUpperCase()} ` +
        `with ${finalDecision.confidence.toFixed(
          0
        )}/100 confidence.` +
        sizingMessage,
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