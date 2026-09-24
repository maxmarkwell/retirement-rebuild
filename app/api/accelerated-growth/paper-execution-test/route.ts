import { NextRequest, NextResponse } from "next/server";
import { executeAgPaperBuy } from "@/lib/discovery/accelerated-growth/paper-execution";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG paper execution test is disabled in production." }, { status: 404 });
  }

  try {
    const body = await request.json();
    if (!body?.decisionId) {
      return NextResponse.json({ error: "decisionId is required." }, { status: 400 });
    }

    const result = await executeAgPaperBuy({
      decisionId: String(body.decisionId),
    });

    return NextResponse.json({ executed: true, testOnly: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { executed: false, error: error instanceof Error ? error.message : "Unknown execution error." },
      { status: 400 }
    );
  }
}
