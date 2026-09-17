import { getOpenAIClient } from "@/lib/ai/client";
import type { AgDiscoveryCandidate } from "./discovery";
import { AgResearchOutputError, withAgResearchRetry } from "./research-reliability";

const CATALYST_MODEL = "gpt-5.6-terra";
export const AG_CATALYST_PROMPT_VERSION = "ag-catalyst-v1";

export type AgCatalystResearch = {
  symbol: string;
  companyName: string | null;
  catalystStatus: "SUPPORTED" | "MIXED" | "NOT_FOUND";
  catalyst: string;
  whyNow: string;
  expectedEvidence: string[];
  thesisClock: string;
  invalidation: string[];
  keyRisks: string[];
  sourceSummary: string;
  confidence: number;
  model: string;
  promptVersion: string;
};

const catalystSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    catalystStatus: { type: "string", enum: ["SUPPORTED", "MIXED", "NOT_FOUND"] },
    catalyst: { type: "string" },
    whyNow: { type: "string" },
    expectedEvidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    thesisClock: { type: "string" },
    invalidation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    keyRisks: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    sourceSummary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["catalystStatus", "catalyst", "whyNow", "expectedEvidence", "thesisClock", "invalidation", "keyRisks", "sourceSummary", "confidence"],
} as const;

function buildPrompt(candidate: AgDiscoveryCandidate) {
  return `You are the catalyst-research stage for an Accelerated Growth equity strategy.

Your job is NOT to recommend buying, selling, sizing, allocating capital, or predicting a stock price. Your job is to determine whether the company's quantitative acceleration has a concrete, evidence-backed business catalyst that could plausibly continue changing intrinsic value over an intermediate horizon.

Use web search to verify current information. Prefer primary sources such as company investor relations, SEC filings, earnings releases, earnings-call materials, and official customer/partner announcements. Use reputable secondary reporting only when it adds context. Do not invent facts. If the evidence is weak, conflicting, stale, or merely narrative, say so through catalystStatus.

Required research questions:
1. CATALYST: What identifiable business change is occurring now?
2. WHY NOW: Why is the change economically meaningful now rather than generic long-term optimism?
3. EXPECTED EVIDENCE: What measurable evidence should appear in upcoming quarters if the catalyst is real?
4. THESIS CLOCK: Over what evidence window should the catalyst become visible? Express this as an evidence horizon, not a stock-price target.
5. INVALIDATION: What observable developments would show the catalyst thesis is wrong or materially weakening?
6. RISKS: What can interrupt the acceleration, especially financing/dilution, customer concentration, cyclicality, competition, execution, regulatory risk, or deteriorating cash generation?

Important rules:
- Quantitative ADVANCE means research-worthy, not investable.
- Do not reward volatility, hype, market cap, or a fashionable industry.
- Distinguish company-reported facts from outside interpretation.
- Do not turn a high growth rate into a catalyst by itself.
- A catalyst must identify a causal business development or inflection.
- If no defensible catalyst is found, catalystStatus must be NOT_FOUND.
- Keep sourceSummary concise but name the primary evidence categories/sources consulted and relevant dates when available.

Quantitative evidence from AG Discovery:
${JSON.stringify({ symbol: candidate.symbol, companyName: candidate.companyName, sector: candidate.sector, industry: candidate.industry, marketCap: candidate.marketCap, marketCapBucket: candidate.marketCapBucket, agScore: candidate.score.total, status: candidate.score.status, fundamentalAcceleration: candidate.score.components.fundamentalAcceleration, earningsConfirmation: candidate.score.components.earningsConfirmation, businessQuality: candidate.score.components.businessQuality, valuationReward: candidate.score.components.valuationReward, latestRevenueGrowth: candidate.acceleration.revenueTrajectory.latest, revenueGrowthSlope: candidate.acceleration.revenueTrajectory.slope, revenueConsistency: candidate.acceleration.revenueTrajectory.consistency, operatingMarginSlope: candidate.acceleration.operatingMarginTrajectory.slope, freeCashFlowMarginSlope: candidate.acceleration.freeCashFlowMarginTrajectory.slope }, null, 2)}`;
}

export async function researchAgCatalyst(candidate: AgDiscoveryCandidate): Promise<AgCatalystResearch> {
  if (candidate.score.status !== "ADVANCE") throw new Error(`AG catalyst research requires ADVANCE status. ${candidate.symbol} is ${candidate.score.status}.`);

  return withAgResearchRetry("CATALYST", candidate.symbol, async () => {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: CATALYST_MODEL,
      input: buildPrompt(candidate),
      tools: [{ type: "web_search" }],
      text: { format: { type: "json_schema", name: "ag_catalyst_research", strict: true, schema: catalystSchema } },
    });

    if (response.status !== "completed" || !response.output_text) {
      throw new AgResearchOutputError(`AG catalyst research did not complete for ${candidate.symbol}. Status: ${response.status}`);
    }

    let parsed: Omit<AgCatalystResearch, "symbol" | "companyName" | "model" | "promptVersion">;
    try {
      parsed = JSON.parse(response.output_text) as typeof parsed;
    } catch {
      throw new AgResearchOutputError(`AG catalyst research returned invalid JSON for ${candidate.symbol}.`);
    }

    return { symbol: candidate.symbol, companyName: candidate.companyName, ...parsed, model: CATALYST_MODEL, promptVersion: AG_CATALYST_PROMPT_VERSION };
  });
}
