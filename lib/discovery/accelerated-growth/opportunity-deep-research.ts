import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { normalizeAgConfidence } from "./confidence";
import { withAgResearchRetry, AgResearchOutputError } from "./research-reliability";
import type { AgOpportunityQualification } from "./opportunity-qualification";

export const AG_OPPORTUNITY_DEEP_RESEARCH_VERSION = "ag-opportunity-deep-v1";
const MODEL = "gpt-5.6-terra";

export type AgOpportunityDeepResearch = {
  symbol: string;
  opportunityVersion: "ag-opportunity-v2";
  researchStatus: "PROCEED" | "WATCH" | "STOP";
  thesis: string;
  opportunityPaths: string[];
  mechanismAssessment: string;
  financialAssessment: string;
  valuationAssessment: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  missingDecisionCriticalFacts: string[];
  invalidation: string[];
  thesisClock: string;
  confidence: number;
  model: string;
  promptVersion: typeof AG_OPPORTUNITY_DEEP_RESEARCH_VERSION;
};

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    researchStatus: { type: "string", enum: ["PROCEED", "WATCH", "STOP"] },
    thesis: { type: "string" },
    mechanismAssessment: { type: "string" },
    financialAssessment: { type: "string" },
    valuationAssessment: { type: "string" },
    evidenceFor: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    evidenceAgainst: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    missingDecisionCriticalFacts: { type: "array", items: { type: "string" }, maxItems: 6 },
    invalidation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    thesisClock: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["researchStatus", "thesis", "mechanismAssessment", "financialAssessment",
    "valuationAssessment", "evidenceFor", "evidenceAgainst", "missingDecisionCriticalFacts",
    "invalidation", "thesisClock", "confidence"],
} as const;

/**
 * Independent adversarial review of a completed v2 Discovery thesis.
 * Do not route v2 inputs into the v1 acceleration/catalyst deep-research gate.
 * Research output is not a BUY recommendation, sizing instruction or trade.
 */
export async function researchQualifiedAgOpportunity(
  qualification: AgOpportunityQualification,
): Promise<AgOpportunityDeepResearch> {
  if (qualification.version !== "ag-opportunity-v2" ||
      qualification.status !== "QUALIFIED" || qualification.qualifiedPaths.length < 1 ||
      qualification.rankingScore == null || !Number.isFinite(qualification.rankingScore)) {
    throw new Error("AG_V2_DEEP_RESEARCH_UNQUALIFIED");
  }
  const symbol = qualification.symbol;
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("AG_V2_DEEP_RESEARCH_INVALID_SYMBOL");
  return withAgResearchRetry("DEEP_RESEARCH", symbol, async () => {
    const response = await getOpenAIClient().responses.create({
      model: MODEL,
      tools: [{ type: "web_search" }],
      input: `You are an INDEPENDENT adversarial investment researcher for Accelerated Growth.
Discovery identified a possible investment opportunity. Do not accept its claims without independent verification.
Research current primary financial filings, financial reporting and material company disclosures.
Any ONE of these opportunity paths can qualify: accelerating fundamentals; emerging opportunity;
turnaround; catalyst-driven; valuation dislocation. A turnaround may have declining growth;
a valuation thesis may lack a discrete future catalyst. DO NOT require accelerating revenue,
positive prior growth, a scheduled catalyst, or arbitrary category quotas.
Evaluate how the alleged change creates per-share business value, timing, durability,
cash generation, leverage, dilution, valuation expectations, and plausible downside.
Verify or challenge URLs and evidence in Discovery. Explicitly disclose adverse and missing data.
Find serious counter-evidence and measurable thesis invalidation.
PROCEED means the independent Committee can responsibly debate ownership merit today,
NOT that BUY is justified. WATCH only for genuinely decision-critical missing evidence.
STOP when the opportunity thesis fails. Never manufacture PROCEED results or recommend trades.
Do NOT provide BUY/SELL, allocation, position size, or price targets.
Discovery hypotheses, which are NOT authoritative:
${JSON.stringify(qualification)}`,
      text: { format: { type: "json_schema", name: "ag_opportunity_deep_research", strict: true, schema } },
    });
    if (response.status !== "completed" || !response.output_text) throw new AgResearchOutputError("AG_V2_DEEP_RESEARCH_INCOMPLETE");
    let parsed: Omit<AgOpportunityDeepResearch, "symbol" | "opportunityVersion" | "opportunityPaths" | "model" | "promptVersion">;
    try { parsed = JSON.parse(response.output_text) as typeof parsed; }
    catch { throw new AgResearchOutputError("AG_V2_DEEP_RESEARCH_INVALID_JSON"); }
    if (!parsed || !["PROCEED","WATCH","STOP"].includes(parsed.researchStatus)) {
      throw new AgResearchOutputError("AG_V2_DEEP_RESEARCH_INVALID_OUTPUT");
    }
    return {
      symbol, opportunityVersion: qualification.version, opportunityPaths: [...qualification.qualifiedPaths],
      ...parsed, confidence: normalizeAgConfidence(parsed.confidence),
      model: MODEL, promptVersion: AG_OPPORTUNITY_DEEP_RESEARCH_VERSION,
    };
  });
}
