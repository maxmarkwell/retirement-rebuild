"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/lib/forms/action-state";

export async function addInvestmentDecision(
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

  const portfolioId = formData.get("portfolio_id") as string;
  const decisionType = formData.get("decision_type") as string;
  const ticker = (formData.get("ticker") as string)
    ?.trim()
    .toUpperCase();

  const decisionDate = formData.get("decision_date") as string;

  const decisionPriceRaw = formData.get("decision_price") as string;
  const allocationRaw = formData.get("recommended_allocation") as string;
  const confidenceRaw = formData.get("confidence_score") as string;

  const riskLevel = formData.get("risk_level") as string;
  const holdingPeriod = formData.get("expected_holding_period") as string;

  const thesis = formData.get("thesis") as string;
  const bullCase = formData.get("bull_case") as string;
  const bearCase = formData.get("bear_case") as string;
  const primaryRisks = formData.get("primary_risks") as string;
  const reassessmentConditions =
    formData.get("reassessment_conditions") as string;
  const exitConditions = formData.get("exit_conditions") as string;

  if (!portfolioId || !decisionType || !ticker || !decisionDate || !thesis) {
    return {
      success: false,
      message:
        "Portfolio, decision type, ticker, decision date, and thesis are required.",
    };
  }

  const decisionPrice =
    decisionPriceRaw !== ""
      ? Number(decisionPriceRaw)
      : null;

  const recommendedAllocation =
    allocationRaw !== ""
      ? Number(allocationRaw)
      : null;

  const confidenceScore =
    confidenceRaw !== ""
      ? Number(confidenceRaw)
      : null;

  if (
    decisionPrice != null &&
    (!Number.isFinite(decisionPrice) || decisionPrice <= 0)
  ) {
    return {
      success: false,
      message: "Decision price must be greater than zero.",
    };
  }

  if (
    recommendedAllocation != null &&
    (!Number.isFinite(recommendedAllocation) ||
      recommendedAllocation < 0)
  ) {
    return {
      success: false,
      message: "Recommended allocation cannot be negative.",
    };
  }

  if (
    confidenceScore != null &&
    (!Number.isFinite(confidenceScore) ||
      confidenceScore < 0 ||
      confidenceScore > 100)
  ) {
    return {
      success: false,
      message: "Confidence score must be between 0 and 100.",
    };
  }

  const decisionDateUtc = fromZonedTime(
    decisionDate,
    "America/Denver"
  ).toISOString();

  const { error } = await supabase
    .from("investment_decisions")
    .insert({
      user_id: user.id,
      portfolio_id: portfolioId,
      transaction_id: null,

      decision_type: decisionType,
      ticker,
      decision_date: decisionDateUtc,

      decision_price: decisionPrice,
      recommended_quantity: null,
      recommended_allocation: recommendedAllocation,

      confidence_score: confidenceScore,
      risk_level: riskLevel || null,
      expected_holding_period: holdingPeriod || null,

      thesis,
      bull_case: bullCase || null,
      bear_case: bearCase || null,
      primary_risks: primaryRisks || null,
      reassessment_conditions: reassessmentConditions || null,
      exit_conditions: exitConditions || null,

      source: "manual",
      status: "active",
    });

  if (error) {
    throw new Error(
      `Unable to record investment decision: ${error.message}`
    );
  }

  revalidatePath("/decisions");

  return {
    success: true,
    message: `${decisionType.toUpperCase()} decision recorded for ${ticker}.`,
  };
}