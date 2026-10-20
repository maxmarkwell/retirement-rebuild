import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgEligibleUniverseSnapshot } from "@/lib/discovery/accelerated-growth/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Authenticated, read-only export. The response is the snapshot: no DB writes,
// fundamental vendor calls, research decisions, or portfolio side effects.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const snapshot = await getAgEligibleUniverseSnapshot();
    const canonical = JSON.stringify(snapshot.stocks);
    const snapshotHash = createHash("sha256").update(canonical).digest("hex");
    return NextResponse.json({
      mode: "READ_ONLY_AG_ELIGIBLE_UNIVERSE_EXPORT",
      capturedAt: new Date().toISOString(),
      snapshotHash,
      hashScope: "SHA-256 of sorted eligible stock rows in this response; excludes capture timestamp and universe count",
      replayNote: "Save the complete JSON to retain the cohort. This endpoint returns a NEW current universe on each invocation; no server-side snapshot is persisted.",
      sourceNote: "Values reflect the current dynamic screener response; vendor as-of dates and historical fundamentals are not available in this export.",
      bucketLimits: { small: 8, mid: 8, large: 4, mega: 2 },
      universeCount: snapshot.universeCount,
      eligibleCount: snapshot.eligibleCount,
      stocks: snapshot.stocks,
      decisionsWritten: false,
      transactionsWritten: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Snapshot export failed" }, { status: 500 });
  }
}
