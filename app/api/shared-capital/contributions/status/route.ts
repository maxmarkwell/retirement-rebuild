import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/** Read-only check after an uncertain network outcome. Never posts a deposit. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return respond({ error: "Authentication required." }, 401);
  const params = new URL(request.url).searchParams;
  const key = params.get("idempotencyKey");
  if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    return respond({ error: "Valid request key required." }, 400);
  }
  const { data, error } = await supabase.from("contributions")
    .select("id, amount, contribution_date, external_deposit_reference, portfolio_id")
    .eq("user_id", user.id).eq("idempotency_key", key).maybeSingle();
  if (error) return respond({ error: "Unable to reconcile this request." }, 503);
  return respond(data ? {
    status: "recorded", contributionId: data.id, amount: Number(data.amount),
    contributionDate: data.contribution_date,
    externalDepositReference: data.external_deposit_reference,
    portfolioId: data.portfolio_id, fundsTransferred: false,
  } : {
    status: "not_found",
    message: "No matching entry is visible yet. An earlier request could still be processing; do not submit another request until reconciled.",
    fundsTransferred: false,
  });
}
