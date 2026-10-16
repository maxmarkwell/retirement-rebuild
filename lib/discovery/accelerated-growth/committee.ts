import type { AgValuationSnapshot } from "./valuation-snapshot";
import { getOpenAIClient } from "@/lib/ai/client";
import type { AgDeepResearch } from "./deep-research";
import { AgResearchOutputError, withAgResearchRetry } from "./research-reliability";
import { normalizeAgConfidence } from "./confidence";

const AG_COMMITTEE_MODEL = "gpt-5.6-terra";
export const AG_COMMITTEE_PROMPT_VERSION = "ag-committee-v7";

export type AgCommitteeDecision = {
  symbol: string;
  companyName: string | null;
  decision: "BUY" | "WATCH" | "REJECT";
  ownershipThesis: string;
  committeeRationale: string;
  valuationEvidence: string;
  valuationDataQuality: "QUANTIFIED" | "PARTIAL" | "UNAVAILABLE";
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
    valuationEvidence: { type: "string" },
    valuationDataQuality: { type: "string", enum: ["QUANTIFIED", "PARTIAL", "UNAVAILABLE"] },
    strongestEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    strongestCounterEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    requiredMonitoring: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    thesisClock: { type: "string" },
    invalidation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["decision", "ownershipThesis", "committeeRationale", "valuationEvidence", "valuationDataQuality", "strongestEvidence", "strongestCounterEvidence", "requiredMonitoring", "thesisClock", "invalidation", "confidence"],
} as const;

function prompt(research: AgDeepResearch, valuation: AgValuationSnapshot | null) {
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
- For every dollar figure, verify units arithmetically before writing: 1 trillion = 1,000 billion = 1,000,000 million. Example: $5,429,332,215,000 is $5.429 trillion, NOT $5,429 trillion. Prefer rounding market capitalization and enterprise value to three decimal places in trillions for trillion-dollar companies. Do not copy raw dollar values and label them trillions.\n- Populate valuationEvidence with the actual numerical valuation inputs available in the supplied dossier: dated share price, market capitalization, enterprise value, trailing revenue/earnings, relevant multiples, cash, debt, and dilution. Explicitly identify each missing input. Do not invent or backfill missing figures, market quotes, dates, or citations.
- valuationDataQuality measures the completeness and reliability of the valuation evidence, NOT merely whether some ratios can be calculated. QUANTIFIED requires dated market inputs, reliable relevant financial denominators, and no material unresolved gaps that could alter the valuation judgment. PARTIAL applies when a usable numerical basis exists but important inputs are missing, stale, disputed, or unreconciled. UNAVAILABLE applies when no usable quantitative basis exists.
- The deterministic snapshot's dataQuality describes input completeness and is not automatically the same classification as your valuationDataQuality. Explain any difference explicitly in valuationEvidence. In particular, if the snapshot is PARTIAL, do not label your assessment QUANTIFIED without explaining exactly why its missing or unreconciled inputs are immaterial to the ownership decision.
- Distinguish FMP balance-sheet share verification from SEC share reconciliation; do not repeat a generic "share-count consistency unavailable" limitation as though SEC reconciliation also failed when SEC shares were successfully compared.
- Distinguish TTM revenue, TTM net income, and TTM free cash flow. TTM free cash flow is available only when four valid quarterly cash-flow periods match the income-statement periods; if absent, identify it as missing. Never substitute annual free cash flow for TTM free cash flow.
- When valuation evidence is disputed, assess both vendor and SEC diagnostic multiples and identify that neither is a verified contemporaneous market cap.
- Do not claim the current valuation already prices in success, is expensive, cheap, or supports a favorable risk/reward without a quantitative basis. When data is PARTIAL or UNAVAILABLE, state that the valuation conclusion is provisional and explain how this limitation affects the decision. Do not turn missing data into an automatic WATCH or BUY.
- Preserve observable thesis clocks and invalidation conditions.
- Explicitly weigh the strongest evidence AGAINST ownership.
- Do not treat uncertainty, an unproven future catalyst, or the absence of perfect confirmation as automatic grounds for WATCH. Distinguish risks that can be underwritten today from missing evidence that genuinely prevents a reasoned ownership judgment.
- Evaluate favorable, central, and adverse business outcomes qualitatively. Consider the plausibility and consequences of each, including downside severity, rather than inventing numerical probabilities or stock-price targets.
- Assess prospective investment merit relative to expectations already embedded in the current valuation. A strong business can be an unattractive investment; an uncertain catalyst can still justify ownership if the prospective reward adequately compensates for risk. If valuation evidence is absent or stale, explicitly identify that limitation rather than inventing it.
- For BUY, explain why available evidence and prospective risk/reward support ownership now despite remaining uncertainty. For WATCH, explicitly explain why waiting for specified new evidence is preferable to ownership now, including the opportunity cost of waiting and why the unresolved issue is decision-critical. For REJECT, explain why the thesis or risk/reward fails.
- Evaluate the company's existing earnings power separately from the incremental catalyst; do not assume that the entire ownership case stands or falls on full validation of the new catalyst.
- Maintain independent judgment. No BUY quotas, no forced advancement, and no preference for any decision label.
- If material unresolved questions genuinely prevent a defensible ownership judgment after weighing risk, reward, valuation, and the cost of waiting, choose WATCH.
- The output is research adjudication only. It must not create transactions or imply brokerage execution.

Deterministic valuation snapshot (respect its data limitations):
${JSON.stringify(valuation, null, 2)}

Deep Research dossier:
${JSON.stringify(research, null, 2)}`;
}

export async function runAgCommittee(research: AgDeepResearch, valuation: AgValuationSnapshot | null = null): Promise<AgCommitteeDecision> {
  if (research.researchStatus !== "PROCEED") {
    throw new Error(`AG Committee requires PROCEED status. ${research.symbol} is ${research.researchStatus}.`);
  }

  return withAgResearchRetry("COMMITTEE", research.symbol, async () => {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: AG_COMMITTEE_MODEL,
      input: prompt(research, valuation),
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
