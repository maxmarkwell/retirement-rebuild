import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgSelectorBiasDiagnostic } from "@/lib/discovery/accelerated-growth/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Authenticated, read-only diagnostic. No research models, database writes, or trades.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await getAgSelectorBiasDiagnostic();
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Diagnostic failed." }, { status: 500 });
  }
}
