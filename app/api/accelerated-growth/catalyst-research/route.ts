import { NextRequest, NextResponse } from "next/server";
import { runAgCatalystPipeline } from "@/lib/discovery/accelerated-growth/catalyst-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Accelerated Growth catalyst research diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 8)) : 5;
    const result = await runAgCatalystPipeline({ maxCandidates });

    return NextResponse.json({
      version: "ag-catalyst-v1",
      discovery: result.discovery,
      requestedCount: result.requestedCount,
      completedCount: result.completedCount,
      failedCount: result.failedCount,
      errors: result.errors,
      results: result.results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accelerated Growth catalyst research failed." },
      { status: 500 }
    );
  }
}
