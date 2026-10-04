/** Isolated application-side adapter for the draft per-decision RPC.
 * NOT connected to the AG daily-cycle runner. Requires approved live schema
 * and a separately verified persistence-stage claim before use.
 */
import { planAgDecisionWrites, type AgDecisionWrite } from "./atomic-persistence-contract";

export type AgRpcDecisionPayload = {
  thesis: string;
  confidence: number;
  thesisClock: string;
  bullCase?: string | null;
  bearCase?: string | null;
  monitoring?: string | null;
  invalidation?: string | null;
  notes?: string | null;
  agThesisValid?: boolean | null;
  agLiquidityEligible?: boolean | null;
  agEvidenceVersion?: string | null;
  agThemeKey?: string | null;
};
export type AgRpcCall = {
  p_cycle_id: string; p_claim_token: string; p_ticker: string;
  p_kind: "holding_review" | "committee"; p_decision_type: string;
  p_thesis: string; p_confidence: number; p_thesis_clock: string;
  p_bull_case: string | null; p_bear_case: string | null;
  p_monitoring: string | null; p_invalidation: string | null;
  p_notes: string | null; p_ag_thesis_valid: boolean | null;
  p_ag_liquidity_eligible: boolean | null; p_ag_evidence_version: string | null;
  p_ag_theme_key: string | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nullableString = (value: unknown, field: string): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`Invalid AG ${field}`);
  return value;
};
const nullableBoolean = (value: unknown, field: string): boolean | null => {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new Error(`Invalid AG ${field}`);
  return value;
};
export function prepareAgRpcBatch(
  writes: readonly AgDecisionWrite[], claimToken: string,
): readonly AgRpcCall[] {
  if (!UUID.test(claimToken)) throw new Error("Valid AG stage claim token required.");
  return planAgDecisionWrites(writes).map((write) => {
    const p = write.payload;
    if (typeof p.thesis !== "string" || !p.thesis.trim() ||
      typeof p.confidence !== "number" || !Number.isFinite(p.confidence) ||
      p.confidence < 0 || p.confidence > 100 ||
      typeof p.thesisClock !== "string" || !p.thesisClock.trim()) {
      throw new Error(`Invalid AG decision payload for ${write.symbol}`);
    }
    return {
      p_cycle_id: write.cycleId, p_claim_token: claimToken, p_ticker: write.symbol,
      p_kind: write.kind, p_decision_type: write.decisionType,
      p_thesis: p.thesis, p_confidence: p.confidence, p_thesis_clock: p.thesisClock,
      p_bull_case: nullableString(p.bullCase, "bullCase"),
      p_bear_case: nullableString(p.bearCase, "bearCase"),
      p_monitoring: nullableString(p.monitoring, "monitoring"),
      p_invalidation: nullableString(p.invalidation, "invalidation"),
      p_notes: nullableString(p.notes, "notes"),
      p_ag_thesis_valid: nullableBoolean(p.agThesisValid, "agThesisValid"),
      p_ag_liquidity_eligible: nullableBoolean(p.agLiquidityEligible, "agLiquidityEligible"),
      p_ag_evidence_version: nullableString(p.agEvidenceVersion, "agEvidenceVersion"),
      p_ag_theme_key: nullableString(p.agThemeKey, "agThemeKey"),
    };
  });
}
export class AgAmbiguousWriteError extends Error {
  constructor(readonly ticker: string, readonly cause: unknown, readonly acknowledged: readonly { ticker: string; decisionId: string }[] = []) {
    super(`AG write outcome unknown for ${ticker}; reconcile ledger before any retry.`);
    this.name = "AgAmbiguousWriteError";
  }
}
/** Never infer success from an RPC timeout. The caller must verify the
 * committed ledger before claiming stage completion or attempting recovery.
 * Prevalidate the ENTIRE batch before issuing its first write.
 */
export async function commitPreparedAgBatch(
  calls: readonly AgRpcCall[],
  invoke: (args: AgRpcCall) => Promise<string>,
): Promise<readonly string[]> {
  // Defense in depth: reject forged or mutated prepared calls before the first RPC.
  // Callers must not pass arbitrary objects as a prevalidated batch.
  if (!Array.isArray(calls)) throw new Error("Invalid prepared AG batch.");
  const seen = new Set<string>();
  const expectedCycle = calls[0]?.p_cycle_id?.toLowerCase();
  const expectedClaim = calls[0]?.p_claim_token?.toLowerCase();
  for (const call of calls) {
    if (!call || !UUID.test(call.p_cycle_id) || !UUID.test(call.p_claim_token) ||
      call.p_cycle_id.toLowerCase() !== expectedCycle ||
      call.p_claim_token.toLowerCase() !== expectedClaim ||
      typeof call.p_ticker !== "string" || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(call.p_ticker) ||
      !["holding_review", "committee"].includes(call.p_kind) ||
      !["buy", "hold", "sell", "watch", "avoid"].includes(call.p_decision_type) ||
      (call.p_kind === "committee" && !["buy", "watch", "avoid"].includes(call.p_decision_type)) ||
      (call.p_kind === "holding_review" && !["hold", "sell"].includes(call.p_decision_type)) ||
      typeof call.p_thesis !== "string" || !call.p_thesis.trim() ||
      typeof call.p_confidence !== "number" || !Number.isFinite(call.p_confidence) ||
      call.p_confidence < 0 || call.p_confidence > 100 ||
      typeof call.p_thesis_clock !== "string" || !call.p_thesis_clock.trim() ||
      [call.p_bull_case, call.p_bear_case, call.p_monitoring,
        call.p_invalidation, call.p_notes, call.p_ag_evidence_version,
        call.p_ag_theme_key].some((value) => value !== null && typeof value !== "string") ||
      [call.p_ag_thesis_valid, call.p_ag_liquidity_eligible].some(
        (value) => value !== null && typeof value !== "boolean") ||
      Object.keys(call).some((key) => ![
        "p_cycle_id", "p_claim_token", "p_ticker", "p_kind", "p_decision_type",
        "p_thesis", "p_confidence", "p_thesis_clock", "p_bull_case",
        "p_bear_case", "p_monitoring", "p_invalidation", "p_notes",
        "p_ag_thesis_valid", "p_ag_liquidity_eligible", "p_ag_evidence_version",
        "p_ag_theme_key",
      ].includes(key))) {
      throw new Error("Invalid prepared AG RPC arguments.");
    }
    const key = `${call.p_cycle_id.toLowerCase()}:${call.p_ticker}`;
    if (seen.has(key)) throw new Error("Duplicate prepared AG RPC ticker.");
    seen.add(key);
  }
  const ids: string[] = [];
  const acknowledged: { ticker: string; decisionId: string }[] = [];
  for (const call of calls) {
    let id: string;
    try {
      id = await invoke(call);
    } catch (cause) {
      // An RPC rejection can occur after the server committed the transaction.
      throw new AgAmbiguousWriteError(call.p_ticker, cause, acknowledged);
    }
    if (!UUID.test(id)) throw new AgAmbiguousWriteError(call.p_ticker,
      new Error("RPC returned an invalid decision ID"), acknowledged);
    ids.push(id);
    acknowledged.push({ ticker: call.p_ticker, decisionId: id });
  }
  return ids;
}

export type AgCommittedLedgerRow = {
  cycle_id: string;
  ticker: string;
  status: string;
  investment_decision_id: string | null;
  payload_hash: string;
  decision_kind: string;
  user_id: string;
  portfolio_id: string;
  strategy_era_id: string;
};
/** Read-only post-write reconciliation. Never infer completion from RPC return
 * values alone. The database must independently supply committed ledger rows.
 * Hash and ownership integrity are enforced by the RPC; this adapter checks
 * completeness and decision-ID correspondence, not cryptographic identity.
 */
export function reconcileAgCommittedBatch(
  calls: readonly AgRpcCall[],
  decisionIds: readonly string[],
  rows: readonly AgCommittedLedgerRow[],
  scope: { userId: string; portfolioId: string; strategyEraId: string },
): "COMPLETE" | "MANUAL_RECONCILIATION" {
  if (!scope || !UUID.test(scope.userId) || !UUID.test(scope.portfolioId) ||
      !UUID.test(scope.strategyEraId) || !Array.isArray(calls) || !Array.isArray(decisionIds) ||
      !Array.isArray(rows) || calls.length !== decisionIds.length ||
      rows.length !== calls.length) return "MANUAL_RECONCILIATION";
  const expected = new Map<string, string>();
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const id = decisionIds[i];
    if (!call || !UUID.test(call.p_cycle_id) ||
        typeof call.p_ticker !== "string" || !UUID.test(id)) return "MANUAL_RECONCILIATION";
    const key = `${call.p_cycle_id.toLowerCase()}:${call.p_ticker}`;
    if (expected.has(key)) return "MANUAL_RECONCILIATION";
    expected.set(key, id.toLowerCase());
  }
  const observed = new Set<string>();
  const observedDecisionIds = new Set<string>();
  for (const row of rows) {
    if (!row || !UUID.test(row.cycle_id) || typeof row.ticker !== "string") {
      return "MANUAL_RECONCILIATION";
    }
    const key = `${row.cycle_id.toLowerCase()}:${row.ticker}`;
    if (!expected.has(key) || observed.has(key) ||
        row.status !== "committed" || !row.investment_decision_id ||
        !UUID.test(row.investment_decision_id) ||
        row.investment_decision_id.toLowerCase() !== expected.get(key) ||
        !/^[a-f0-9]{64}$/.test(row.payload_hash) ||
        !["holding_review", "committee"].includes(row.decision_kind) ||
        row.user_id?.toLowerCase() !== scope.userId.toLowerCase() ||
        row.portfolio_id?.toLowerCase() !== scope.portfolioId.toLowerCase() ||
        row.strategy_era_id?.toLowerCase() !== scope.strategyEraId.toLowerCase()) {
      return "MANUAL_RECONCILIATION";
    }
    const call = calls.find((item) =>
      item.p_cycle_id.toLowerCase() === row.cycle_id.toLowerCase() &&
      item.p_ticker === row.ticker);
    if (!call || call.p_kind !== row.decision_kind) return "MANUAL_RECONCILIATION";
    const decisionId = row.investment_decision_id!.toLowerCase();
    if (observedDecisionIds.has(decisionId)) return "MANUAL_RECONCILIATION";
    observedDecisionIds.add(decisionId);
    observed.add(key);
  }
  return observed.size === expected.size ? "COMPLETE" : "MANUAL_RECONCILIATION";
}

/** Read-only database boundary. An actual Supabase caller must implement this
 * scoped SELECT after approved migrations; this module never opens a client.
 * No stage completion or automatic retry occurs here.
 */
export async function verifyAgBatchFromLedger(
  calls: readonly AgRpcCall[],
  decisionIds: readonly string[],
  scope: { userId: string; portfolioId: string; strategyEraId: string },
  selectCommittedLedger: (query: {
    cycleId: string; userId: string; portfolioId: string; strategyEraId: string;
  }) => Promise<readonly AgCommittedLedgerRow[]>,
): Promise<"COMPLETE" | "MANUAL_RECONCILIATION"> {
  if (!Array.isArray(calls) || calls.length === 0 ||
      !scope || !UUID.test(scope.userId) || !UUID.test(scope.portfolioId) ||
      !UUID.test(scope.strategyEraId) ||
      !Array.isArray(decisionIds) || decisionIds.length !== calls.length) {
    return "MANUAL_RECONCILIATION";
  }
  const cycleId = calls[0]?.p_cycle_id;
  if (!UUID.test(cycleId) || calls.some((call) =>
    !call || !UUID.test(call.p_cycle_id) ||
    call.p_cycle_id.toLowerCase() !== cycleId.toLowerCase())) {
    return "MANUAL_RECONCILIATION";
  }
  try {
    const rows = await selectCommittedLedger({
      cycleId, userId: scope.userId,
      portfolioId: scope.portfolioId, strategyEraId: scope.strategyEraId,
    });
    return reconcileAgCommittedBatch(calls, decisionIds, rows, scope);
  } catch {
    // Failed/ambiguous reads are never evidence of a completed stage.
    return "MANUAL_RECONCILIATION";
  }
}

/** Classify a timed-out batch using independently read ledger rows.
 * This does NOT authorize replay: a row without a client-verifiable canonical
 * payload hash is insufficient to prove an ambiguous write is safe to retry.
 */
export function classifyAgAmbiguousBatch(
  calls: readonly AgRpcCall[],
  rows: readonly AgCommittedLedgerRow[],
  scope: { userId: string; portfolioId: string; strategyEraId: string },
): "ALL_RECORDED_REQUIRES_PAYLOAD_VERIFICATION" | "MANUAL_RECONCILIATION" {
  if (!scope || !UUID.test(scope.userId) || !UUID.test(scope.portfolioId) ||
      !UUID.test(scope.strategyEraId) || !Array.isArray(calls) ||
      !Array.isArray(rows) || calls.length === 0 || rows.length !== calls.length) {
    return "MANUAL_RECONCILIATION";
  }
  const expected = new Map<string, AgRpcCall>();
  const cycle = calls[0]?.p_cycle_id?.toLowerCase();
  if (!cycle || !UUID.test(cycle)) return "MANUAL_RECONCILIATION";
  for (const call of calls) {
    if (!call || !UUID.test(call.p_cycle_id) || call.p_cycle_id.toLowerCase() !== cycle ||
        !/^[A-Z][A-Z0-9.-]{0,14}$/.test(call.p_ticker)) return "MANUAL_RECONCILIATION";
    if (expected.has(call.p_ticker)) return "MANUAL_RECONCILIATION";
    expected.set(call.p_ticker, call);
  }
  const observed = new Set<string>();
  const observedDecisionIds = new Set<string>();
  for (const row of rows) {
    const call = row && expected.get(row.ticker);
    if (!call || observed.has(row.ticker) || row.cycle_id?.toLowerCase() !== cycle ||
        row.status !== "committed" || !row.investment_decision_id ||
        !UUID.test(row.investment_decision_id) ||
        !/^[a-f0-9]{64}$/.test(row.payload_hash) ||
        row.decision_kind !== call.p_kind ||
        row.user_id?.toLowerCase() !== scope.userId.toLowerCase() ||
        row.portfolio_id?.toLowerCase() !== scope.portfolioId.toLowerCase() ||
        row.strategy_era_id?.toLowerCase() !== scope.strategyEraId.toLowerCase()) {
      return "MANUAL_RECONCILIATION";
    }
    const decisionId = row.investment_decision_id.toLowerCase();
    if (observedDecisionIds.has(decisionId)) return "MANUAL_RECONCILIATION";
    observedDecisionIds.add(decisionId);
    observed.add(row.ticker);
  }
  return observed.size === expected.size
    ? "ALL_RECORDED_REQUIRES_PAYLOAD_VERIFICATION"
    : "MANUAL_RECONCILIATION";
}

/** Diagnostic-only partial-batch report. Never grants permission to retry or
 * mark a persistence checkpoint complete; ledger hashes are not payload proof.
 */
export function reportAgPartialBatch(
  calls: readonly AgRpcCall[],
  acknowledged: readonly { ticker: string; decisionId: string }[],
  rows: readonly AgCommittedLedgerRow[],
  scope: { userId: string; portfolioId: string; strategyEraId: string },
): {
  status: "REQUIRES_MANUAL_RECONCILIATION";
  acknowledged: readonly string[];
  recordedUnacknowledged: readonly string[];
  missing: readonly string[];
  conflicting: readonly string[];
} {
  const empty = {
    status: "REQUIRES_MANUAL_RECONCILIATION" as const,
    acknowledged: [] as string[], recordedUnacknowledged: [] as string[],
    missing: [] as string[], conflicting: [] as string[],
  };
  if (!scope || !UUID.test(scope.userId) || !UUID.test(scope.portfolioId) ||
      !UUID.test(scope.strategyEraId) || !Array.isArray(calls) ||
      !Array.isArray(acknowledged) || !Array.isArray(rows) || calls.length === 0) {
    return { ...empty, conflicting: ["INVALID_INPUT"] };
  }
  const cycle = calls[0]?.p_cycle_id?.toLowerCase();
  const claim = calls[0]?.p_claim_token?.toLowerCase();
  const expected = new Map<string, AgRpcCall>();
  for (const call of calls) {
    if (!call || !UUID.test(call.p_cycle_id) || call.p_cycle_id.toLowerCase() !== cycle ||
        !UUID.test(call.p_claim_token) || call.p_claim_token.toLowerCase() !== claim ||
        typeof call.p_ticker !== "string" ||
        !/^[A-Z][A-Z0-9.-]{0,14}$/.test(call.p_ticker) ||
        expected.has(call.p_ticker)) return { ...empty, conflicting: ["INVALID_BATCH"] };
    expected.set(call.p_ticker, call);
  }
  const acknowledgments = new Map<string, string>();
  for (const [index, ack] of acknowledged.entries()) {
    if (!ack || !expected.has(ack.ticker) ||
        calls[index]?.p_ticker !== ack.ticker || !UUID.test(ack.decisionId) ||
        acknowledgments.has(ack.ticker)) {
      return { ...empty, conflicting: ["INVALID_ACKNOWLEDGMENTS"] };
    }
    acknowledgments.set(ack.ticker, ack.decisionId.toLowerCase());
  }
  if (new Set(acknowledgments.values()).size !== acknowledgments.size) {
    return { ...empty, conflicting: ["DUPLICATE_ACKNOWLEDGED_ID"] };
  }
  const ledger = new Map<string, AgCommittedLedgerRow>();
  const conflicting = new Set<string>();
  const decisionIds = new Set<string>();
  for (const row of rows) {
    const call = row && expected.get(row.ticker);
    if (!call || ledger.has(row.ticker)) {
      conflicting.add(row?.ticker || "UNEXPECTED_ROW");
      continue;
    }
    ledger.set(row.ticker, row);
    const id = row.investment_decision_id?.toLowerCase();
    if (!id || !UUID.test(id) || decisionIds.has(id) ||
        row.cycle_id?.toLowerCase() !== cycle ||
        row.status !== "committed" || !/^[a-f0-9]{64}$/.test(row.payload_hash) ||
        row.decision_kind !== call.p_kind ||
        row.user_id?.toLowerCase() !== scope.userId.toLowerCase() ||
        row.portfolio_id?.toLowerCase() !== scope.portfolioId.toLowerCase() ||
        row.strategy_era_id?.toLowerCase() !== scope.strategyEraId.toLowerCase() ||
        (acknowledgments.has(row.ticker) && acknowledgments.get(row.ticker) !== id)) {
      conflicting.add(row.ticker);
    }
    if (id) decisionIds.add(id);
  }
  const confirmed = [...acknowledgments.keys()].filter((ticker) =>
    ledger.has(ticker) && !conflicting.has(ticker));
  return {
    status: "REQUIRES_MANUAL_RECONCILIATION",
    acknowledged: confirmed,
    recordedUnacknowledged: [...expected.keys()].filter((ticker) =>
      !acknowledgments.has(ticker) && ledger.has(ticker) && !conflicting.has(ticker)),
    missing: [...expected.keys()].filter((ticker) => !ledger.has(ticker)),
    conflicting: [...conflicting],
  };
}
