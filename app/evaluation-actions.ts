"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/lib/forms/action-state";

export async function addDecisionEvaluation(
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

  const decisionId = formData.get("decision_id") as string;
  const evaluationDate = formData.get("evaluation_date") as string;
  const evaluationPriceRaw = formData.get("evaluation_price") as string;
  const thesisStatus = formData.get("thesis_status") as string;
  const recommendationStatus = formData.get(
    "recommendation_status"
  ) as string;

  const whatWasRight = formData.get("what_was_right") as string;
  const whatWasWrong = formData.get("what_was_wrong") as string;
  const newInformation = formData.get("new_information") as string;
  const evaluationSummary = formData.get(
    "evaluation_summary"
  ) as string;

  if (
    !decisionId ||
    !evaluationDate ||
    !thesisStatus ||
    !recommendationStatus ||
    !evaluationSummary
  ) {
    return {
      success: false,
      message:
        "Decision, evaluation date, thesis status, recommendation status, and evaluation summary are required.",
    };
  }

  const evaluationPrice =
    evaluationPriceRaw !== ""
      ? Number(evaluationPriceRaw)
      : null;

  if (
    evaluationPrice != null &&
    (!Number.isFinite(evaluationPrice) ||
      evaluationPrice <= 0)
  ) {
    return {
      success: false,
      message: "Evaluation price must be greater than zero.",
    };
  }

  // ---------------------------------------------------------
  // Load original decision
  // ---------------------------------------------------------

  const { data: decision, error: decisionError } =
    await supabase
      .from("investment_decisions")
      .select(
        "id, user_id, ticker, decision_price, decision_type"
      )
      .eq("id", decisionId)
      .single();

  if (decisionError || !decision) {
    return {
      success: false,
      message: "Unable to load the original investment decision.",
    };
  }

  if (decision.user_id !== user.id) {
    return {
      success: false,
      message: "You are not authorized to evaluate this decision.",
    };
  }

  // ---------------------------------------------------------
  // Calculate return since decision
  // ---------------------------------------------------------

  const decisionPrice =
    decision.decision_price != null
      ? Number(decision.decision_price)
      : null;

  let returnSinceDecisionPct: number | null = null;

  if (
    decisionPrice != null &&
    evaluationPrice != null &&
    decisionPrice > 0
  ) {
    const rawReturn =
      ((evaluationPrice - decisionPrice) /
        decisionPrice) *
      100;

    /*
      For a SELL decision, price falling after the decision
      represents a favorable result.

      For BUY / HOLD / WATCH / other long-oriented decisions,
      rising price represents a favorable result.

      We are storing the signed market move relative to the
      original decision direction.
    */

    if (decision.decision_type === "sell") {
      returnSinceDecisionPct =
        rawReturn * -1;
    } else {
      returnSinceDecisionPct =
        rawReturn;
    }
  }

  const evaluationDateUtc = fromZonedTime(
    evaluationDate,
    "America/Denver"
  ).toISOString();

  // ---------------------------------------------------------
  // Record evaluation
  // ---------------------------------------------------------

  const { error } = await supabase
    .from("investment_decision_evaluations")
    .insert({
      user_id: user.id,
      decision_id: decisionId,
      evaluation_date: evaluationDateUtc,
      evaluation_price: evaluationPrice,
      return_since_decision_pct:
        returnSinceDecisionPct,
      thesis_status: thesisStatus,
      recommendation_status:
        recommendationStatus,
      what_was_right: whatWasRight || null,
      what_was_wrong: whatWasWrong || null,
      new_information: newInformation || null,
      evaluation_summary: evaluationSummary,
      source: "manual",
    });

  if (error) {
    throw new Error(
      `Unable to record decision evaluation: ${error.message}`
    );
  }

  // ---------------------------------------------------------
  // Update decision lifecycle status where appropriate
  // ---------------------------------------------------------

  let decisionStatus: string | null = null;

  if (
    recommendationStatus === "closed" ||
    recommendationStatus === "exit"
  ) {
    decisionStatus = "closed";
  }

  if (recommendationStatus === "reassess") {
    decisionStatus = "active";
  }

  if (decisionStatus) {
    const { error: updateError } = await supabase
      .from("investment_decisions")
      .update({
        status: decisionStatus,
      })
      .eq("id", decisionId);

    if (updateError) {
      throw new Error(
        `Evaluation was recorded, but the decision status could not be updated: ${updateError.message}`
      );
    }
  }

  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath("/decisions");

  return {
    success: true,
    message: `Evaluation recorded for ${decision.ticker}.`,
  };
}