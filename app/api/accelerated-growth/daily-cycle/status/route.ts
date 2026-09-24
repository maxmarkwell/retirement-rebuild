import { NextResponse } from "next/server";
import { getAgDailyCycleStatus } from "@/lib/discovery/accelerated-growth/daily-cycle-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getAgDailyCycleStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load AG daily cycle status." }, { status: 500 });
  }
}
