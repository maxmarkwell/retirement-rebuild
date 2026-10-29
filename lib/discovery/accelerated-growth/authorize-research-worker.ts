import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { AgWorkerAuthorization } from "./authorized-stage-continuation";

/**
 * Creates the one-time authenticated handoff for a paper AG worker.
 * The raw secret is never stored in the database or sent to the browser.
 * Only the SHA-256 digest is used by the authorization-bound RPCs.
 *
 * Do not call this from a public route until the server-side dispatch
 * mechanism is connected. Never log or serialize the returned credentials.
 */
export async function authorizeAgResearchWorker(input: {
  cycleId: string;
  ttlMinutes?: number;
  maxInvocations?: number;
}): Promise<AgWorkerAuthorization> {
  const ttlMinutes = input.ttlMinutes ?? 180;
  const maxInvocations = input.maxInvocations ?? 32;
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 360 ||
      !Number.isInteger(maxInvocations) || maxInvocations < 1 || maxInvocations > 64) {
    throw new Error("AG_WORKER_INVALID_AUTHORIZATION_BOUNDS");
  }
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("AG_WORKER_OWNER_AUTHENTICATION_REQUIRED");
  const { data: cycle, error: cycleError } = await db.from("ag_daily_cycles")
    .select("id,portfolio_id,strategy_era_id")
    .eq("id", input.cycleId).eq("user_id", user.id)
    .eq("status", "running").maybeSingle();
  if (cycleError || !cycle) throw new Error("AG_WORKER_RUNNING_CYCLE_REQUIRED");

  // Additional server checks duplicate the database's atomic authorization
  // preflight; the database remains the source of truth for the final grant.
  const [{ data: portfolio, error: portfolioError }, { data: era, error: eraError }] =
    await Promise.all([
      db.from("portfolios").select("id").eq("id", cycle.portfolio_id)
        .eq("user_id", user.id).eq("type", "paper_active").eq("is_real_money", false).maybeSingle(),
      db.from("portfolio_strategy_eras").select("id")
        .eq("id", cycle.strategy_era_id).eq("portfolio_id", cycle.portfolio_id)
        .eq("user_id", user.id).eq("strategy_key", "accelerated_growth")
        .eq("execution_mode", "paper").is("ended_at", null).maybeSingle(),
    ]);
  if (portfolioError || !portfolio || eraError || !era) {
    throw new Error("AG_WORKER_PAPER_STRATEGY_REQUIRED");
  }

  const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const { data: authorizationId, error } = await db.rpc("ag_authorize_cycle_worker", {
    p_cycle_id: input.cycleId,
    p_token_hash: tokenHash,
    p_ttl_minutes: ttlMinutes,
    p_max_invocations: maxInvocations,
  });
  if (error || typeof authorizationId !== "string") {
    throw new Error("AG_WORKER_AUTHORIZATION_NOT_CONFIRMED");
  }
  return { cycleId: input.cycleId, authorizationId, tokenHash };
}
