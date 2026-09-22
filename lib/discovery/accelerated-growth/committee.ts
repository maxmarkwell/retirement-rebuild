import { getOpenAIClient } from "@/lib/ai/client";
import type { AgDeepResearch } from "./deep-research";
import { AgResearchOutputError, withAgResearchRetry } from "./research-reliability";
import { normalizeAgConfidence } from "./confidence";

const AG_COMMITTEE_MODEL = "gpt-5.6-terra";
export const AG_COMMITTEE_PROMPT_VERSION = "ag-committee-v1";

export type AgCommitteeDecision = {
  symbol: string;
  companyName: string | null;
  decision: "BUY" | "WATCH" | "REJECT";
  ownershipThesis: string;
  committeeRationale: string;
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
    decision: { type: "string", enum: ["BUY", "WATCH", "REJECT"] },
    ownershipThesis: { type: "string" },
    committeeRationale: { type: "string" },
    strongestEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    strongestCounterEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    requiredMonitoring: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    thesisClock: { type: "string" },
    invalidation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["decision", "ownershipThesis", "committeeRationale", "strongestEvidence", "strongestCounterEvidence", "requiredMonitoring", "thesisClock", "invalidation", "confidence"],
} as const;

function prompt(research: AgDeepResearch) {
  return `You are the Investment Committee for the Accelerated Growth strategy.

MANDATE:
Seek opportunities for materially higher capital appreciation over an intermediate horizon by identifying businesses experiencing identifiable positive change, while respecting deterministic portfolio and position risk controls outside this Committee.

This candidate has already passed quantitative Discovery, Catalyst Research, and an adversarial Deep Research challenge. Deep Research returned PROCEED. Your job is narrower: decide whether the surviving thesis establishes ownership merit under the Accelerated Growth mandate.

DECISIONS:
- BUY: ownership merit is established strongly enough to pass to deterministic portfolio/risk sizing. BUY is NOT an order and does NOT authorize capital deployment by itself.
- WATCH: the thesis remains credible, but ownership merit is not established yet; identify the evidence required before reconsideration.
- REJECT: the thesis does not justify ownership under the AG mandate or the counter-evidence materially defeats it.

HARD RULES:
- Do NOT discuss dollars, allocation percentages, share quantities, position size, starter size, portfolio weights, or how much to buy.
- Do NOT predict a stock price or create a price target.
- Do NOT assume that PROCEED means BUY. Challenge the thesis independently.
- Do NOT reward market cap, volatility, hype, or industry popularity.
- Treat valuation as an expectations/risk question, not a mechanical multiple cutoff.
- Preserve observable thesis clocks and invalidation conditions.
- Explicitly weigh the strongest evidence AGAINST ownership.
- If material unresolved questions prevent ownership conviction, choose WATCH.
- The output is research adjudication only. It must not create transactions or imply brokerage execution.

Deep Research dossier:
${JSON.stringify(research, null, 2)}`;
}

export async function runAgCommittee(research: AgDeepResearch): Promise<AgCommitteeDecision> {
  if (research.researchStatus !== "PROCEED") {
    throw new Error(`AG Committee requires PROCEED status. ${research.symbol} is ${research.researchStatus}.`);
  }

  return withAgResearchRetry("COMMITTEE", research.symbol, async () => {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: AG_COMMITTEE_MODEL,
      input: prompt(research),
      text: { format: { type: "json_schema", name: "ag_committee_decision", strict: true, schema } },
    });

    if (response.status !== "completed" || !response.output_text) {
      throw new AgResearchOutputError(`AG Committee did not complete for ${research.symbol}. Status: ${response.status}`);
    }

    let parsed: Omit<AgCommitteeDecision, "symbol" | "companyName" | "model" | "promptVersion">;
    try {
      parsed = JSON.parse(response.output_text) as typeof parsed;
    } catch {
      throw new AgResearchOutputError(`AG Committee returned invalid JSON for ${research.symbol}.`);
    }

    return {
      symbol: research.symbol,
      companyName: research.companyName,
      ...parsed,
      confidence: normalizeAgConfidence(parsed.confidence),
      model: AG_COMMITTEE_MODEL,
      promptVersion: AG_COMMITTEE_PROMPT_VERSION,
    };
  });
}
