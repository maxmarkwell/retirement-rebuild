import { getOpenAIClient } from "@/lib/ai/client";
import type { AgDiscoveryCandidate } from "./discovery";
import type { AgCatalystResearch } from "./catalyst-research";
import { AgResearchOutputError, withAgResearchRetry } from "./research-reliability";
import { normalizeAgConfidence } from "./confidence";

const AG_DEEP_RESEARCH_MODEL = "gpt-5.6-terra";
export const AG_DEEP_RESEARCH_PROMPT_VERSION = "ag-deep-research-v1";

export type AgDeepResearch = {
  symbol: string; companyName: string | null; researchStatus: "PROCEED" | "WATCH" | "STOP";
  thesis: string; catalystAssessment: string; durabilityAssessment: string; financialAssessment: string; valuationAssessment: string;
  evidenceFor: string[]; evidenceAgainst: string[]; unresolvedQuestions: string[]; thesisClock: string; invalidation: string[];
  confidence: number; model: string; promptVersion: string;
  priorWatchReassessed: boolean;
};

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    researchStatus: { type: "string", enum: ["PROCEED", "WATCH", "STOP"] }, thesis: { type: "string" }, catalystAssessment: { type: "string" }, durabilityAssessment: { type: "string" }, financialAssessment: { type: "string" }, valuationAssessment: { type: "string" }, evidenceFor: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 }, evidenceAgainst: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 }, unresolvedQuestions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 }, thesisClock: { type: "string" }, invalidation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 }, confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["researchStatus", "thesis", "catalystAssessment", "durabilityAssessment", "financialAssessment", "valuationAssessment", "evidenceFor", "evidenceAgainst", "unresolvedQuestions", "thesisClock", "invalidation", "confidence"],
} as const;

export type AgPriorResearchWatch = {
  confidence: number;
  thesis: string;
  unresolvedQuestions: string[];
  thesisClock: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function prompt(candidate: AgDiscoveryCandidate, catalyst: AgCatalystResearch, priorWatch?: AgPriorResearchWatch | null) {
  return `You are the deep-research challenge stage for an Accelerated Growth equity strategy.

The company already passed a quantitative acceleration screen and catalyst research. Do NOT rubber-stamp either result. Your job is to challenge whether the change is durable and economically important enough to deserve Investment Committee review.

Use current web research. Prefer SEC filings, company investor-relations material, earnings releases/calls, and official customer/partner evidence. Seek disconfirming evidence as actively as confirming evidence.

You MUST NOT recommend BUY/SELL, predict a stock price, or size/allocate capital.

researchStatus means:
- PROCEED: evidence is sufficiently strong and internally consistent to justify Committee review.
- WATCH: thesis is plausible but important evidence is missing, mixed, too early, or valuation/financial conditions materially reduce clarity.
- STOP: catalyst is contradicted, economically weak, stale, primarily narrative, or financial/valuation risks overwhelm the acceleration case.

Evaluate:
1. Catalyst validity and causal mechanism.
2. Durability: competitive position, customer behavior, repeatability, cyclicality, capacity, execution, and whether growth is organic versus acquired or comparison-driven.
3. Financial translation: margins, cash conversion, working capital, leverage, dilution, capital intensity, and per-share economics.
4. Valuation context: whether current valuation appears to require unusually optimistic execution. Do not set a price target and do not fail a company merely because a simple multiple is high.
5. Evidence against the thesis and unresolved questions.
6. Thesis clock and observable invalidation conditions.

Quantitative Discovery evidence:
${JSON.stringify({ symbol: candidate.symbol, companyName: candidate.companyName, marketCapBucket: candidate.marketCapBucket, agScore: candidate.score.total, fundamentalAcceleration: candidate.score.components.fundamentalAcceleration, earningsConfirmation: candidate.score.components.earningsConfirmation, businessQuality: candidate.score.components.businessQuality, valuationReward: candidate.score.components.valuationReward, latestRevenueGrowth: candidate.acceleration.revenueTrajectory.latest, revenueGrowthSlope: candidate.acceleration.revenueTrajectory.slope, operatingMarginSlope: candidate.acceleration.operatingMarginTrajectory.slope, freeCashFlowMarginSlope: candidate.acceleration.freeCashFlowMarginTrajectory.slope }, null, 2)}

Catalyst research:
${JSON.stringify(catalyst, null, 2)}

${priorWatch ? `Prior unresolved Deep Research WATCH:
${JSON.stringify(priorWatch, null, 2)}

This prior WATCH is context, not evidence. Re-test its thesis and unresolved questions against current evidence. Do not preserve WATCH merely for consistency. PROCEED, WATCH, or STOP based on today's evidence.` : "No prior unresolved Deep Research WATCH exists for this candidate."}`;
}

export async function researchAgDeepCandidate(candidate: AgDiscoveryCandidate, catalyst: AgCatalystResearch, priorWatch?: AgPriorResearchWatch | null): Promise<AgDeepResearch> {
  if (candidate.score.status !== "ADVANCE") throw new Error(`${candidate.symbol} is not an ADVANCE candidate.`);
  if (catalyst.catalystStatus === "NOT_FOUND") throw new Error(`${candidate.symbol} has no supported catalyst.`);

  return withAgResearchRetry("DEEP_RESEARCH", candidate.symbol, async () => {
    const client = getOpenAIClient();
    const response = await client.responses.create({ model: AG_DEEP_RESEARCH_MODEL, input: prompt(candidate, catalyst, priorWatch), tools: [{ type: "web_search" }], text: { format: { type: "json_schema", name: "ag_deep_research", strict: true, schema } } });

    if (response.status !== "completed" || !response.output_text) {
      throw new AgResearchOutputError(`AG deep research did not complete for ${candidate.symbol}. Status: ${response.status}`);
    }

    let parsed: Omit<AgDeepResearch, "symbol" | "companyName" | "model" | "promptVersion" | "priorWatchReassessed">;
    try { parsed = JSON.parse(response.output_text) as typeof parsed; }
    catch { throw new AgResearchOutputError(`AG deep research returned invalid JSON for ${candidate.symbol}.`); }

    return { symbol: candidate.symbol, companyName: candidate.companyName, ...parsed, confidence: normalizeAgConfidence(parsed.confidence), model: AG_DEEP_RESEARCH_MODEL, promptVersion: AG_DEEP_RESEARCH_PROMPT_VERSION, priorWatchReassessed: Boolean(priorWatch) };
  });
}
