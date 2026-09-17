import { NextRequest, NextResponse } from "next/server";
import { runAgCommitteePipeline } from "@/lib/discovery/accelerated-growth/committee-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Accelerated Growth Committee diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
    const result = await runAgCommitteePipeline({ maxCandidates });

    return NextResponse.json({
      version: "ag-committee-v1",
      upstream: result.upstream,
      requestedCount: result.requestedCount,
      completedCount: result.completedCount,
      failedCount: result.failedCount,
      errors: result.errors,
      decisions: result.decisions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accelerated Growth Committee failed." },
      { status: 500 }
    );
  }
}
