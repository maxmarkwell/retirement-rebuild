import { NextRequest, NextResponse } from "next/server";
import { runAgDeepResearchPipeline } from "@/lib/discovery/accelerated-growth/deep-research-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Accelerated Growth deep research diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "1");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 1;
    const result = await runAgDeepResearchPipeline({ maxCandidates });

    return NextResponse.json({
      version: "ag-deep-research-v1",
      discovery: result.discovery,
      catalystSupportedCount: result.catalystSupportedCount,
      requestedCount: result.requestedCount,
      completedCount: result.completedCount,
      failedCount: result.failedCount,
      errors: result.errors,
      results: result.results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accelerated Growth deep research failed." },
      { status: 500 }
    );
  }
}
