import { NextResponse } from "next/server";
import { runAgCommittee } from "@/lib/discovery/accelerated-growth/committee";
import type { AgDeepResearch } from "@/lib/discovery/accelerated-growth/deep-research";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fixed local-only fixture. This exercises the positive Committee gate without
// weakening Deep Research or depending on a fresh PROCEED result.
const fixture: AgDeepResearch = {
  symbol: "NVDA",
  companyName: "NVIDIA Corporation",
  researchStatus: "PROCEED",
  thesis:
    "The acceleration case is driven by continued AI infrastructure demand and a platform transition from Blackwell Ultra toward Rubin, with evidence of expanding deployment commitments and strong data-center growth.",
  catalystAssessment:
    "The catalyst is a product/platform transition combined with continued hyperscale AI infrastructure deployment. The evidence supports an economically material change rather than growth alone.",
  durabilityAssessment:
    "Platform breadth, ecosystem adoption, and announced deployment plans support durability, while customer concentration, competitive responses, supply commitments, and execution through the Rubin transition remain material risks.",
  financialAssessment:
    "Revenue and data-center growth are strong, but large supply/capacity commitments, cloud commitments, guarantees, customer concentration, and China restrictions increase the proof burden on cash conversion and per-share economics.",
  valuationAssessment:
    "Current expectations require strong execution. Valuation should be monitored as an expectations risk rather than used as a mechanical disqualifier.",
  evidenceFor: [
    "Q2 FY2027 revenue was reported at $96.2B, up 106% year over year.",
    "Data Center revenue was reported at $89B, up 117% year over year and 18% sequentially.",
    "Blackwell Ultra is the current platform driver while Rubin production shipments began in Q3.",
    "Management guided Q3 revenue to $108B plus or minus 2%.",
    "AWS announced plans for substantial additional NVIDIA GPU deployment for 2027-2028."
  ],
  evidenceAgainst: [
    "A single direct customer represented 16% of quarterly revenue and five customers represented 70% of accounts receivable.",
    "China Data Center compute remains unavailable.",
    "Large supply/capacity, AI-cloud, equity, and guarantee commitments increase capital and counterparty exposure.",
    "High market expectations leave less room for execution shortfalls."
  ],
  unresolvedQuestions: [
    "Whether Rubin ramps on schedule without disrupting Blackwell economics.",
    "Whether customer concentration declines as the installed base broadens.",
    "Whether ecosystem financing and guarantees remain proportionate to underlying demand.",
    "Whether cash generation continues to support the growing commitment base."
  ],
  thesisClock: "Next 2-4 quarters, centered on Rubin ramp evidence, data-center growth durability, margins, cash conversion, and customer diversification.",
  invalidation: [
    "Material Rubin delays or qualification problems.",
    "Sustained deceleration in data-center demand inconsistent with the deployment thesis.",
    "Material deterioration in margins or cash conversion tied to the platform transition.",
    "Evidence that financing or guarantees, rather than end demand, are becoming necessary to sustain growth."
  ],
  confidence: 76,
  model: "fixture",
  promptVersion: "ag-deep-research-fixture-v1"
};

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Accelerated Growth Committee fixture is disabled in production." }, { status: 404 });
  }

  try {
    const decision = await runAgCommittee(fixture);
    return NextResponse.json({
      version: "ag-committee-positive-fixture-v1",
      fixture: {
        symbol: fixture.symbol,
        researchStatus: fixture.researchStatus,
        promptVersion: fixture.promptVersion
      },
      decision
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accelerated Growth Committee fixture failed." },
      { status: 500 }
    );
  }
}
