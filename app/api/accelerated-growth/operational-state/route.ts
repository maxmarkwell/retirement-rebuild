import { NextResponse } from "next/server";
import { getAgOperationalState } from "@/lib/discovery/accelerated-growth/operational-state";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG operational state diagnostic is disabled in production." }, { status: 404 });
  }
  try {
    const state = await getAgOperationalState();
    return NextResponse.json({ operationalStateDiagnostic: true, zeroWrite: true, state });
  } catch (error) {
    return NextResponse.json({
      operationalStateDiagnostic: false,
      zeroWrite: true,
      error: error instanceof Error ? error.message : "Unable to build AG operational state.",
    }, { status: 400 });
  }
}
