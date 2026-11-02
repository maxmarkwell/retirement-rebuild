import "server-only";
import { getOpenAIClient } from "@/lib/ai/client";
import { normalizeAgConfidence } from "./confidence";
import { withAgResearchRetry, AgResearchOutputError } from "./research-reliability";
import { getAgValuationSnapshot } from "./valuation-snapshot";
import type { AgOpportunityDeepResearch } from "./opportunity-deep-research";

export const AG_V2_COMMITTEE_VERSION = "ag-opportunity-committee-v2";
const MODEL = "gpt-5.6-terra";
export type AgV2CommitteeResult = {
  symbol: string;
  decision: "BUY" | "WATCH" | "REJECT";
  ownershipThesis: string;
  rationale: string;
  valuationEvidence: string;
  valuationIntegrity: "RECONCILED" | "PARTIAL" | "CONFLICTED" | "UNAVAILABLE";
  valuationConflicts: string[];
  ownershipNowVsWait: string;
  decisionBasis: "BUSINESS_RISK" | "VALUATION_RISK" | "EVIDENCE_GAP" | "RISK_REWARD" | "THESIS_REJECTED";
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
    valuationIntegrity: { type: "string", enum: ["RECONCILED","PARTIAL","CONFLICTED","UNAVAILABLE"] },
    valuationConflicts: { type: "array", items: { type: "string" } },
    ownershipNowVsWait: { type: "string" },
    decisionBasis: { type: "string", enum: ["BUSINESS_RISK","VALUATION_RISK","EVIDENCE_GAP","RISK_REWARD","THESIS_REJECTED"] },
    evidenceFor: { type: "array", items: { type: "string" } },
    evidenceAgainst: { type: "array", items: { type: "string" } },
    decisionCriticalGaps: { type: "array", items: { type: "string" } },
    reassessmentConditions: { type: "array", items: { type: "string" } },
    invalidation: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["decision","ownershipThesis","rationale","valuationEvidence","evidenceFor",
    "evidenceAgainst","valuationIntegrity","valuationConflicts","ownershipNowVsWait","decisionBasis","decisionCriticalGaps","reassessmentConditions","invalidation","confidence"],
} as const;

/** Independent research adjudication, never a trade or allocation instruction. */
export async function runAgV2Committee(research: AgOpportunityDeepResearch, comparison?: { historicalValuationText: string }): Promise<AgV2CommitteeResult> {
  if (research.opportunityVersion !== "ag-opportunity-v2" ||
      !["ag-opportunity-deep-v1","ag-opportunity-deep-v2"].includes(research.promptVersion) ||
      !/^[A-Z][A-Z0-9.-]{0,14}$/.test(research.symbol))
    throw new Error("AG_V2_COMMITTEE_INVALID_RESEARCH");
  // Replay mode is isolated from new market data and never changes saved decisions.
  const valuation = comparison ? null : await getAgValuationSnapshot(research.symbol);
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
Do not invent missing data. The valuation snapshot has potential gaps. Its securityIdentity is same-vendor only, NOT an independent listing verification. Identity MISMATCH makes its affected valuation numbers unusable. UNVERIFIED identity requires explicit judgment and must never be described as verified.
Before deciding, independently compare the dossier market quote, share count, currency, market capitalization, enterprise value, financial periods and cash flow against the dated snapshot. Report material conflicts in valuationConflicts. RECONCILED requires credible consistent data, PARTIAL means gaps without identified contradiction, CONFLICTED means material inconsistent inputs, and UNAVAILABLE means no usable basis. Never silently choose a convenient conflicting number. If consequential conflicts prevent a defensible valuation, do not issue BUY.
Explicitly discuss owning today versus waiting in ownershipNowVsWait: favorable, central and adverse qualitative outcomes, what current expectations imply, downside, urgency and the opportunity cost of waiting. Do not invent probabilities or price targets. An uncertain outcome alone is not a reason for WATCH; identify why uncertainty is or is not underwritable today. If WATCH, explain specifically why waiting is preferable. If BUY, explain why credible evidence and risk/reward justify ownership now without requiring perfect confirmation. If REJECT, explain which thesis is defeated.
Use decisionBasis to identify the PRIMARY decisive issue: BUSINESS_RISK, VALUATION_RISK, EVIDENCE_GAP, RISK_REWARD, or THESIS_REJECTED. This is a description of your conclusion, not a mechanical decision rule. No outcome quotas.
${comparison ? 'HISTORICAL COMPARISON ONLY. The following is the original Committee saved textual valuation assessment, not its raw valuation snapshot. No live data were fetched. Treat unsupported figures as unverified: ' + comparison.historicalValuationText : 'Valuation snapshot: ' + JSON.stringify(valuation)}
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
    if (!["RECONCILED","PARTIAL","CONFLICTED","UNAVAILABLE"].includes(parsed.valuationIntegrity) ||
        !Array.isArray(parsed.valuationConflicts) ||
        !["BUSINESS_RISK","VALUATION_RISK","EVIDENCE_GAP","RISK_REWARD","THESIS_REJECTED"].includes(parsed.decisionBasis) ||
        typeof parsed.ownershipNowVsWait !== "string" || parsed.ownershipNowVsWait.trim().length < 30)
      throw new AgResearchOutputError("AG_V2_COMMITTEE_INCOMPLETE_JUDGMENT");
    if (parsed.decision === "BUY" && (valuation?.securityIdentity.status === "MISMATCH" ||
        ["CONFLICTED","UNAVAILABLE"].includes(parsed.valuationIntegrity)))
      throw new AgResearchOutputError("AG_V2_COMMITTEE_BUY_BLOCKED_BY_VALUATION_INTEGRITY");
    return { ...parsed, symbol: research.symbol, confidence: normalizeAgConfidence(parsed.confidence),
      model: MODEL, promptVersion: AG_V2_COMMITTEE_VERSION };
  });
}
