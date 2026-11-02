import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { normalizeAgConfidence } from "./confidence";
import { withAgResearchRetry, AgResearchOutputError } from "./research-reliability";
import { getAgValuationSnapshot } from "./valuation-snapshot";
import type { AgOpportunityDeepResearch } from "./opportunity-deep-research";

export const AG_V2_COMMITTEE_VERSION = "ag-opportunity-committee-v1";
const MODEL = "gpt-5.6-terra";
export type AgV2CommitteeResult = {
  symbol: string;
  decision: "BUY" | "WATCH" | "REJECT";
  ownershipThesis: string;
  rationale: string;
  valuationEvidence: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  decisionCriticalGaps: string[];
  reassessmentConditions: string[];
  invalidation: string[];
  confidence: number;
  model: string;
  promptVersion: typeof AG_V2_COMMITTEE_VERSION;
};
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["BUY", "WATCH", "REJECT"] },
    ownershipThesis: { type: "string" },
    rationale: { type: "string" },
    valuationEvidence: { type: "string" },
    evidenceFor: { type: "array", items: { type: "string" } },
    evidenceAgainst: { type: "array", items: { type: "string" } },
    decisionCriticalGaps: { type: "array", items: { type: "string" } },
    reassessmentConditions: { type: "array", items: { type: "string" } },
    invalidation: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["decision","ownershipThesis","rationale","valuationEvidence","evidenceFor",
    "evidenceAgainst","decisionCriticalGaps","reassessmentConditions","invalidation","confidence"],
} as const;

/** Independent research adjudication, never a trade or allocation instruction. */
export async function runAgV2Committee(research: AgOpportunityDeepResearch): Promise<AgV2CommitteeResult> {
  if (research.opportunityVersion !== "ag-opportunity-v2" ||
      research.promptVersion !== "ag-opportunity-deep-v1" ||
      !/^[A-Z][A-Z0-9.-]{0,14}$/.test(research.symbol))
    throw new Error("AG_V2_COMMITTEE_INVALID_RESEARCH");
  const valuation = await getAgValuationSnapshot(research.symbol);
  return withAgResearchRetry("COMMITTEE", research.symbol, async () => {
    const response = await getOpenAIClient().responses.create({
      model: MODEL,
      input: `You are the independent Accelerated Growth investment research committee.
Assess whether ownership merit is established today. Select BUY, WATCH, or REJECT.
BUY means ownership merit established, not authorization to transact. WATCH means
specific decision-critical gaps justify waiting. REJECT means the thesis fails.
No quotas or preferred outcome. Do not provide trade sizes, dollars, allocations,
quantities, or price targets.
Independently evaluate any of the five paths: accelerating fundamentals,
emerging opportunity, turnaround, catalyst-driven, valuation dislocation.
Do not require acceleration or scheduled catalysts for other paths.
Evaluate financial durability, cash generation, valuation expectations,
downside, adverse evidence, invalidation and opportunity cost of waiting.
PROCEED from research is not an automatic BUY. Even WATCH and STOP dossiers
require independent assessment; explain any disagreement with upstream evidence.
Do not invent missing data. The valuation snapshot has potential gaps.
Valuation snapshot: ${JSON.stringify(valuation)}
Prior adversarial dossier: ${JSON.stringify(research)}`,
      text: { format: { type: "json_schema", name: "ag_v2_committee_result", strict: true, schema } },
    });
    if (response.status !== "completed" || !response.output_text)
      throw new AgResearchOutputError("AG_V2_COMMITTEE_INCOMPLETE");
    let parsed: Omit<AgV2CommitteeResult, "symbol" | "model" | "promptVersion">;
    try { parsed = JSON.parse(response.output_text) as typeof parsed; }
    catch { throw new AgResearchOutputError("AG_V2_COMMITTEE_INVALID_JSON"); }
    if (!parsed || !["BUY","WATCH","REJECT"].includes(parsed.decision))
      throw new AgResearchOutputError("AG_V2_COMMITTEE_INVALID_DECISION");
    return { ...parsed, symbol: research.symbol, confidence: normalizeAgConfidence(parsed.confidence),
      model: MODEL, promptVersion: AG_V2_COMMITTEE_VERSION };
  });
}
