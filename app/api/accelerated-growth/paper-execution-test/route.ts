import { NextRequest, NextResponse } from "next/server";
import { executeAgPaperBuy } from "@/lib/discovery/accelerated-growth/paper-execution";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG paper execution test is disabled in production." }, { status: 404 });
  }

  try {
    const body = await request.json();
    if (!body?.decisionId || !Number.isFinite(Number(body?.price)) || Number(body.price) <= 0) {
      return NextResponse.json({ error: "decisionId and positive price are required." }, { status: 400 });
    }

    const result = await executeAgPaperBuy({
      decisionId: String(body.decisionId),
      price: Number(body.price),
    });

    return NextResponse.json({ executed: true, testOnly: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { executed: false, error: error instanceof Error ? error.message : "Unknown execution error." },
      { status: 400 }
    );
  }
}
