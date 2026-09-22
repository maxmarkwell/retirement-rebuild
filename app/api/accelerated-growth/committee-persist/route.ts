import { NextRequest, NextResponse } from "next/server";
import { runAgCommitteePipeline, persistAgCommitteeDecisions } from "@/lib/discovery/accelerated-growth/committee-pipeline";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG Committee persistence diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios")
      .select("id, type")
      .eq("user_id", user.id)
      .eq("type", "paper_active")
      .single();
    if (portfolioError || !portfolio) {
      return NextResponse.json({ error: "paper_active portfolio not found." }, { status: 400 });
    }

    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
    const pipeline = await runAgCommitteePipeline({ maxCandidates });

    if (pipeline.errors.length > 0 || pipeline.failedCount > 0) {
      return NextResponse.json({
        persisted: false,
        reason: "Committee pipeline did not complete cleanly; no decisions were persisted.",
        pipeline,
      }, { status: 409 });
    }

    const persisted = await persistAgCommitteeDecisions(portfolio.id, pipeline.decisions);

    return NextResponse.json({
      persisted: true,
      transactionsWritten: false,
      portfolioId: portfolio.id,
      committeeDecisionCount: pipeline.decisions.length,
      persistedCount: persisted.length,
      persistedDecisions: persisted,
      decisions: pipeline.decisions,
      upstream: pipeline.upstream,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AG Committee persistence diagnostic failed." },
      { status: 500 }
    );
  }
}
