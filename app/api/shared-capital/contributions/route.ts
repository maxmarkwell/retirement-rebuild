import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planSharedContribution } from "@/lib/portfolio/shared-contribution-contract";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/**
 * Intended for confirmed external brokerage deposits ONLY.
 * Feature switch is disabled by default; no UI currently calls this route.
 * The database unique (user_id, idempotency_key) index is the race arbiter.
 */
export async function POST(request: Request) {
  if (process.env.SHARED_CONTRIBUTION_POSTING_ENABLED !== "true") {
    return respond({ error: "Contribution posting is not enabled." }, 503);
  }
  // Browser-origin defense in depth; do not accept cross-origin POSTs or
  // requests with no Origin. The feature remains off until integration tests.
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    return respond({ error: "Cross-origin contribution requests are not allowed." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return respond({ error: "JSON content type required." }, 415);
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return respond({ error: "Authentication required." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("Invalid request.");
  } catch {
    return respond({ error: "Invalid contribution request." }, 400);
  }
  if (payload.confirmedExternalDeposit !== true ||
      typeof payload.amount !== "number" ||
      typeof payload.contributionDate !== "string" ||
      typeof payload.idempotencyKey !== "string") {
    return respond({ error: "Confirmed deposit, amount, date, and request key are required." }, 400);
  }

  try {
    const { data: portfolios, error: portfolioError } = await supabase.from("portfolios")
      .select("id, type, is_real_money").eq("user_id", user.id)
      .eq("is_real_money", true).eq("type", "real").limit(2);
    if (portfolioError || !portfolios) return respond({ error: "Account validation unavailable." }, 503);
    const plan = planSharedContribution(
      portfolios.map(p => ({ id: p.id, type: p.type, isRealMoney: p.is_real_money })),
      { amount: payload.amount, contributionDate: payload.contributionDate, idempotencyKey: payload.idempotencyKey },
    );

    const fields = "id, portfolio_id, amount, contribution_date, idempotency_key";
    const matching = () => supabase.from("contributions").select(fields)
      .eq("user_id", user.id).eq("idempotency_key", plan.idempotencyKey).maybeSingle();

    // A repeat must match the original payload, never silently alter it.
    const matchExisting = async () => {
      const { data: existing, error } = await matching();
      if (error) throw new Error("Contribution reconciliation failed.");
      if (!existing) return null;
      const identical = existing.portfolio_id === plan.destinationPortfolioId &&
        Math.round(Number(existing.amount) * 100) === plan.contributionCents &&
        existing.contribution_date === plan.contributionDate;
      return identical
        ? respond({ status: "already_recorded", contributionId: existing.id, fundsTransferred: false })
        : respond({ error: "Request key already belongs to a different contribution." }, 409);
    };

    const before = await matchExisting();
    if (before) return before;
    const { data: inserted, error: insertError } = await supabase.from("contributions")
      .insert({
        user_id: user.id, portfolio_id: plan.destinationPortfolioId,
        amount: plan.contributionCents / 100, contribution_date: plan.contributionDate,
        idempotency_key: plan.idempotencyKey,
      }).select("id").single();

    if (insertError) {
      // Only an actual uniqueness collision may be interpreted as a retry.
      if (insertError.code === "23505") {
        const raced = await matchExisting();
        if (raced) return raced;
        return respond({ error: "Contribution request conflict. Please reconcile." }, 409);
      }
      throw new Error("Unable to post contribution.");
    }
    revalidatePath("/");
    return respond({ status: "recorded", contributionId: inserted.id, fundsTransferred: false }, 201);
  } catch (error) {
    console.error("Shared contribution posting error", error);
    return respond({ error: "Contribution could not be recorded. No transfer was initiated." }, 500);
  }
}
