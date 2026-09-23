import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { AgResearchOutputError, withAgResearchRetry } from "./research-reliability";
import { normalizeAgConfidence } from "./confidence";
import type { AgHoldingReassessmentCandidate } from "./holding-reassessment";

const AG_HOLDING_REVIEW_MODEL = "gpt-5.6-terra";
export const AG_HOLDING_REVIEW_PROMPT_VERSION = "ag-holding-review-v1";

export type AgHoldingReviewDecision = {
  symbol: string;
  decision: "HOLD" | "SELL";
  ownershipThesis: string;
  rationale: string;
  strongestEvidence: string[];
  strongestCounterEvidence: string[];
  requiredMonitoring: string[];
  thesisClock: string;
  invalidation: string[];
  confidence: number;
  model: string;
  promptVersion: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["HOLD", "SELL"] },
    ownershipThesis: { type: "string" },
    rationale: { type: "string" },
    strongestEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    strongestCounterEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    requiredMonitoring: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    thesisClock: { type: "string" },
    invalidation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["decision", "ownershipThesis", "rationale", "strongestEvidence", "strongestCounterEvidence", "requiredMonitoring", "thesisClock", "invalidation", "confidence"],
} as const;

function prompt(candidate: AgHoldingReassessmentCandidate) {
  return `You are performing an ownership review for an EXISTING Accelerated Growth holding.

Your only question is whether the company still merits ownership under the Accelerated Growth mandate.

DECISIONS:
- HOLD: the ownership thesis remains sufficiently intact to continue owning the existing position.
- SELL: ownership merit has materially deteriorated, the thesis has been invalidated, or the evidence no longer justifies continued ownership.

HARD RULES:
- Do NOT discuss dollars, portfolio weights, allocation percentages, share quantities, position sizing, trim percentages, or how much to sell.
- Do NOT create a price target or predict a stock price.
- Do NOT choose SELL merely because the stock price fell or HOLD merely because it rose.
- Treat valuation as an expectations/risk question, not a mechanical multiple cutoff.
- Compare current evidence with the prior ownership thesis and observable thesis clock.
- Explicitly weigh counter-evidence.
- If the thesis remains intact but requires monitoring, choose HOLD and state what must be monitored.
- SELL is research adjudication only; deterministic execution controls outside this review determine whether/how an exit can occur.

Existing holding context:
${JSON.stringify(candidate, null, 2)}`;
}

export async function runAgHoldingReview(candidate: AgHoldingReassessmentCandidate): Promise<AgHoldingReviewDecision> {
  return withAgResearchRetry("HOLDING_REVIEW", candidate.ticker, async () => {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: AG_HOLDING_REVIEW_MODEL,
      input: prompt(candidate),
      text: { format: { type: "json_schema", name: "ag_holding_review", strict: true, schema } },
    });
    if (response.status !== "completed" || !response.output_text) {
      throw new AgResearchOutputError(`AG holding review did not complete for ${candidate.ticker}. Status: ${response.status}`);
    }
    let parsed: Omit<AgHoldingReviewDecision, "symbol" | "model" | "promptVersion">;
    try {
      parsed = JSON.parse(response.output_text) as typeof parsed;
    } catch {
      throw new AgResearchOutputError(`AG holding review returned invalid JSON for ${candidate.ticker}.`);
    }
    return {
      symbol: candidate.ticker,
      ...parsed,
      confidence: normalizeAgConfidence(parsed.confidence),
      model: AG_HOLDING_REVIEW_MODEL,
      promptVersion: AG_HOLDING_REVIEW_PROMPT_VERSION,
    };
  });
}
