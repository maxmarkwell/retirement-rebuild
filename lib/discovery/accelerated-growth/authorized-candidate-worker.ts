import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { researchAgCatalyst } from "./catalyst-research";
import { researchAgDeepCandidate, type AgPriorResearchWatch } from "./deep-research";
import type { AgDiscoveryCandidate, AgDiscoveryResult } from "./discovery";
import type { AgWorkerAuthorization } from "./authorized-stage-continuation";

/**
 * Runs a single bounded candidate on a detached server worker; no browser
 * cookies or user session are needed. Authorization is cycle-scoped in SQL.
 *
 * The dispatcher must first persist/verify its exact ranked selection manifest
 * and claim the catalyst_deep_research parent stage. This helper is not a
 * public entry point and intentionally does not pick symbols or start stages.
 */
export async function runAuthorizedAgCandidate(input: {
  authorization: AgWorkerAuthorization;
  candidate: AgDiscoveryCandidate;
  priorWatch?: AgPriorResearchWatch | null;
}) {
  const { authorization: auth, candidate } = input;
  const symbol = candidate.symbol.toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || symbol !== candidate.symbol) {
    throw new Error("AG_WORKER_CANDIDATE_INVALID_SYMBOL");
  }
  const db = createAdminClient();

  // Check canonical completed Discovery before any provider request. This is
  // necessary, but not sufficient: the dispatcher also owns ranked selection.
  const { data: discoveryRows, error: discoveryError } = await db.rpc(
    "ag_worker_read_completed_stage_output", {
      p_authorization_id: auth.authorizationId,
      p_cycle_id: auth.cycleId,
      p_token_hash: auth.tokenHash,
      p_stage: "discovery",
    },
  );
  if (discoveryError || !Array.isArray(discoveryRows) || discoveryRows.length !== 1) {
    throw new Error("AG_WORKER_DISCOVERY_NOT_COMPLETED");
  }
  const discovery = discoveryRows[0].output as AgDiscoveryResult | null;
  if (!discovery || !Array.isArray(discovery.candidates) ||
      discovery.candidates.filter(c => c.symbol === symbol && c.score?.status === "ADVANCE").length !== 1) {
    throw new Error("AG_WORKER_CANDIDATE_NOT_IN_COMPLETED_DISCOVERY");
  }

  // Duplicate callbacks must reuse completed evidence, never rerun LLM calls.
  const { data: prior, error: readError } = await db.rpc(
    "ag_worker_read_cycle_symbol_checkpoints", {
      p_authorization_id: auth.authorizationId,
      p_cycle_id: auth.cycleId,
      p_token_hash: auth.tokenHash,
      p_parent_stage: "catalyst_deep_research",
    },
  );
  if (readError || !Array.isArray(prior)) {
    throw new Error("AG_WORKER_CANDIDATE_STATUS_UNAVAILABLE");
  }
  const matches = prior.filter(row => row.symbol === symbol);
  if (matches.length > 1) throw new Error("AG_WORKER_CANDIDATE_DUPLICATE_CHECKPOINT");
  if (matches.length === 1) {
    const checkpoint = matches[0];
    if (checkpoint.status === "completed") {
      const saved = checkpoint.output as { symbol?: unknown } | null;
      if (!saved || saved.symbol !== symbol) {
        throw new Error("AG_WORKER_CANDIDATE_OUTPUT_MISMATCH");
      }
      return { symbol, reused: true, output: checkpoint.output };
    }
    if (checkpoint.status !== "pending") {
      throw new Error("AG_WORKER_CANDIDATE_REQUIRES_MANUAL_REVIEW");
    }
  }

  const { data: claims, error: claimError } = await db.rpc(
    "ag_worker_claim_cycle_symbol", {
      p_authorization_id: auth.authorizationId,
      p_cycle_id: auth.cycleId,
      p_token_hash: auth.tokenHash,
      p_parent_stage: "catalyst_deep_research",
      p_symbol: symbol,
    },
  );
  const claim = Array.isArray(claims) ? claims[0] : null;
  if (claimError || !claim?.checkpoint_id || !claim?.claim_token) {
    throw new Error("AG_WORKER_CANDIDATE_CLAIM_UNCONFIRMED");
  }

  // An interrupted provider call leaves a claimed row for reconciliation.
  // Never retry an uncertain LLM result automatically.
  const catalyst = await researchAgCatalyst(candidate);
  const research = catalyst.catalystStatus === "NOT_FOUND"
    ? null
    : await researchAgDeepCandidate(candidate, catalyst, input.priorWatch ?? null);
  const output = {
    symbol,
    catalystStatus: catalyst.catalystStatus,
    research,
    completedAt: new Date().toISOString(),
  };
  const { data: completed, error: completionError } = await db.rpc(
    "ag_worker_complete_cycle_symbol", {
      p_authorization_id: auth.authorizationId,
      p_cycle_id: auth.cycleId,
      p_token_hash: auth.tokenHash,
      p_checkpoint_id: claim.checkpoint_id,
      p_claim_token: claim.claim_token,
      p_output: output,
    },
  );
  if (completionError || completed !== true) {
    throw new Error("AG_WORKER_CANDIDATE_COMPLETION_UNCONFIRMED");
  }
  return { symbol, reused: false, output };
}
