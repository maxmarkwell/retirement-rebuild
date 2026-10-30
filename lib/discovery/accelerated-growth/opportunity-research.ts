import { getOpenAIClient } from "@/lib/ai/client";
import { AG_OPPORTUNITY_PATHS, qualifyAgOpportunity, type AgEvidenceAssessment, type AgOpportunityQualification } from "./opportunity-qualification";

export const AG_OPPORTUNITY_RESEARCH_VERSION = "ag-opportunity-research-v1";
const MODEL = "gpt-5.6-terra";
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    assessments: { type: "array", maxItems: 5, items: {
      type: "object", additionalProperties: false,
      properties: {
        path: { type: "string", enum: [...AG_OPPORTUNITY_PATHS] },
        evidence: { type: "array", items: { type: "string" } },
        sourceUrls: { type: "array", items: { type: "string" } },
        economicMechanism: { type: "string" },
        counterEvidence: { type: "array", items: { type: "string" } },
        invalidation: { type: "array", items: { type: "string" } },
        evidenceHorizon: { type: "string" },
        strength: { type: ["number", "null"] },
        coverage: { type: ["number", "null"] },
        significance: { type: ["number", "null"] },
        urgency: { type: ["number", "null"] },
        uncertainty: { type: ["number", "null"] },
      },
      required: ["path", "evidence", "sourceUrls", "economicMechanism", "counterEvidence",
        "invalidation", "evidenceHorizon", "strength", "coverage", "significance", "urgency", "uncertainty"],
    } },
  },
  required: ["assessments"],
} as const;

/**
 * Research-only v2 entry point. Do not call from the existing v1 daily cycle.
 * A future bounded discovery coordinator must persist the result, version and
 * candidate manifest before any downstream Committee stage.
 */
export async function researchAgOpportunityEvidence(input: {
  symbol: string;
  companyName?: string | null;
  quantitativeContext?: unknown;
}): Promise<{ qualification: AgOpportunityQualification; researchVersion: typeof AG_OPPORTUNITY_RESEARCH_VERSION; model: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("AG_OPPORTUNITY_RESEARCH_INVALID_SYMBOL");

  const prompt = `Research ${symbol} (${input.companyName ?? "company name unverified"}) as an Accelerated Growth opportunity.
Search current primary evidence (SEC filings, earnings reports, investor relations, official company or partner disclosures).
Investigate EACH path independently: accelerating fundamentals, emerging business opportunity,
operational turnaround, economically meaningful catalyst, and valuation dislocation.
A company may qualify through any single path. Never require accelerating revenue or an
upcoming scheduled catalyst for the other paths. Do not invent sources or evidence.
Return an assessment only for a path for which you can identify evidence. Missing data
must be null, not a neutral number. Source URLs must identify actual material reviewed.
Record a concrete mechanism for per-share economic value, counter-evidence, measurable
invalidation, and an evidence horizon. Distinguish confirmed facts from hypotheses.
Assign 0–100 judgments for evidence strength, coverage, significance, urgency and
uncertainty only where grounded. An appealing narrative alone does not qualify.
Do NOT recommend trades, BUY/SELL, sizing, allocations or target prices.
Quantitative context, which may be adverse or incomplete, is not a universal gate:
${JSON.stringify(input.quantitativeContext ?? null)}`;
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: MODEL, input: prompt, tools: [{ type: "web_search" }],
    text: { format: { type: "json_schema", name: "ag_opportunity_evidence", strict: true, schema } },
  });
  if (response.status !== "completed" || !response.output_text) throw new Error("AG_OPPORTUNITY_RESEARCH_INCOMPLETE");
  let parsed: { assessments: AgEvidenceAssessment[] };
  try { parsed = JSON.parse(response.output_text) as typeof parsed; }
  catch { throw new Error("AG_OPPORTUNITY_RESEARCH_INVALID_JSON"); }
  if (!parsed || !Array.isArray(parsed.assessments)) throw new Error("AG_OPPORTUNITY_RESEARCH_INVALID_OUTPUT");
  return {
    qualification: qualifyAgOpportunity(symbol, parsed.assessments),
    researchVersion: AG_OPPORTUNITY_RESEARCH_VERSION,
    model: MODEL,
  };
}
