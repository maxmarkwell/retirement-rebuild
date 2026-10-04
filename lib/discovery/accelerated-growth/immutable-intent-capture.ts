/** Pure, isolated manifest builder. NOT connected to the AG runner.
 * Captures the existing pipeline outputs, never accepts caller-authored
 * persistence tickers or hashes. The source candidate set must be supplied
 * from the actual preceding pipeline and verified by its stage executor.
 */
import { prepareAgRpcBatch, type AgRpcCall } from "./atomic-persistence-adapter";
import type { AgCommitteeDecision } from "./committee";
import type { AgHoldingReviewDecision } from "./holding-review";

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function symbols(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values)) throw new Error(`Invalid ${label} identities`);
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !SYMBOL.test(value) || seen.has(value)) {
      throw new Error(`Invalid or duplicate ${label} identity`);
    }
    seen.add(value);
  }
  return [...seen];
}
function validateSource(
  cycleId: string, eligible: readonly string[], decisions: readonly { symbol: string }[],
  failedCount: number, errors: readonly unknown[], label: string,
): string[] {
  if (!UUID.test(cycleId) || !Array.isArray(decisions) ||
      !Number.isSafeInteger(failedCount) || failedCount !== 0 ||
      !Array.isArray(errors) || errors.length !== 0) {
    throw new Error(`Incomplete ${label} stage`);
  }
  const source = symbols(eligible, label);
  const outputs = symbols(decisions.map((d) => d?.symbol), `${label} output`);
  if (source.length !== outputs.length || outputs.some((symbol) => !source.includes(symbol))) {
    throw new Error(`Incomplete or unexpected ${label} decisions`);
  }
  return source;
}
function validDecision(d: AgCommitteeDecision | AgHoldingReviewDecision): boolean {
  return isText(d.ownershipThesis) && isText(d.thesisClock) &&
    isText(d.model) && isText(d.promptVersion) &&
    typeof d.confidence === "number" && Number.isFinite(d.confidence) &&
    d.confidence >= 0 && d.confidence <= 100 &&
    [d.strongestEvidence,d.strongestCounterEvidence,d.requiredMonitoring,d.invalidation]
      .every((a) => Array.isArray(a) && a.length > 0 &&
        a.every((v) => isText(v)));
}
function snapshot(calls: readonly AgRpcCall[]) {
  return calls.map((c) => ({
    ticker: c.p_ticker,
    args: [c.p_cycle_id,c.p_ticker,c.p_kind,c.p_decision_type,c.p_thesis,
      c.p_confidence,c.p_thesis_clock,c.p_bull_case,c.p_bear_case,
      c.p_monitoring,c.p_invalidation,c.p_notes,c.p_ag_thesis_valid,
      c.p_ag_liquidity_eligible,c.p_ag_evidence_version,c.p_ag_theme_key],
  }));
}
export type AgCommitteeEvidence = {
  liquidityEligible: boolean | null;
  evidenceVersion: string;
  themeKey: string | null;
};
export function captureAgCommitteeIntent(input: {
  cycleId: string; claimToken: string; eligibleSymbols: readonly string[];
  decisions: readonly AgCommitteeDecision[]; failedCount: number;
  errors: readonly unknown[];
  evidenceByTicker: Readonly<Record<string, AgCommitteeEvidence>>;
}) {
  const { cycleId, claimToken, decisions } = input;
  const eligible = validateSource(cycleId,input.eligibleSymbols,decisions,input.failedCount,input.errors,"Committee");
  if (!input.evidenceByTicker || typeof input.evidenceByTicker !== "object" ||
      Object.keys(input.evidenceByTicker).some((key) => !eligible.includes(key))) {
    throw new Error("Invalid Committee execution evidence set");
  }
  const writes = decisions.map((d) => {
    if (!validDecision(d) || !isText(d.committeeRationale) ||
        !["BUY","WATCH","REJECT"].includes(d.decision)) {
      throw new Error(`Invalid Committee decision for ${d.symbol}`);
    }
    const evidence = input.evidenceByTicker[d.symbol];
    if (!evidence || (evidence.liquidityEligible !== null &&
        typeof evidence.liquidityEligible !== "boolean") ||
        !isText(evidence.evidenceVersion) ||
        (evidence.themeKey !== null && typeof evidence.themeKey !== "string")) {
      throw new Error(`Missing validated Committee evidence for ${d.symbol}`);
    }
    return {
      cycleId,symbol:d.symbol,kind:"committee" as const,
      decisionType:d.decision === "REJECT" ? "avoid" : d.decision.toLowerCase(),
      payload: {
        thesis:d.ownershipThesis,confidence:d.confidence,thesisClock:d.thesisClock,
        bullCase:d.strongestEvidence.join("\n"),
        bearCase:d.strongestCounterEvidence.join("\n"),
        monitoring:d.requiredMonitoring.join("\n"),
        invalidation:d.invalidation.join("\n"),
        notes:null,
        agThesisValid:d.decision === "BUY" &&
          d.ownershipThesis.trim().length > 0 && d.invalidation.length > 0,
        agLiquidityEligible:evidence.liquidityEligible,
        agEvidenceVersion:evidence.evidenceVersion,
        agThemeKey:evidence.themeKey,
      },
    };
  });
  const calls = prepareAgRpcBatch(writes,claimToken);
  return {
    source_symbols: eligible,
    source_count: eligible.length,
    output_count: decisions.length,
    failure_count: 0,
    source_decisions: structuredClone(decisions),
    persistence_tickers: calls.map((c) => c.p_ticker),
    decision_payloads: snapshot(calls),
    calls,
  };
}
export function captureAgHoldingIntent(input: {
  cycleId: string; claimToken: string; eligibleSymbols: readonly string[];
  decisions: readonly AgHoldingReviewDecision[]; failedCount: number;
  errors: readonly unknown[];
}) {
  const { cycleId, claimToken, decisions } = input;
  const eligible = validateSource(cycleId,input.eligibleSymbols,decisions,input.failedCount,input.errors,"holding review");
  const writes = decisions.map((d) => {
    if (!validDecision(d) || !isText(d.rationale) ||
        !["HOLD","SELL"].includes(d.decision)) {
      throw new Error(`Invalid holding review for ${d.symbol}`);
    }
    return {
      cycleId,symbol:d.symbol,kind:"holding_review" as const,
      decisionType:d.decision.toLowerCase(),
      payload: {
        thesis:d.ownershipThesis,confidence:d.confidence,thesisClock:d.thesisClock,
        bullCase:d.strongestEvidence.join("\n"),
        bearCase:d.strongestCounterEvidence.join("\n"),
        monitoring:d.requiredMonitoring.join("\n"),
        invalidation:d.invalidation.join("\n"),
        notes:JSON.stringify({agHoldingReview:true,rationale:d.rationale,
          model:d.model,promptVersion:d.promptVersion}),
      },
    };
  });
  const calls = prepareAgRpcBatch(writes,claimToken);
  return {
    source_symbols: eligible,
    source_count: eligible.length,
    output_count: decisions.length,
    failure_count: 0,
    source_decisions: structuredClone(decisions),
    persistence_tickers: calls.map((c) => c.p_ticker),
    decision_payloads: snapshot(calls),
    calls,
  };
}

/** Read-only combined preflight. Stage claims are intentionally distinct;
 * persistence must acquire its own claim and reprepare all writes under it.
 * This does not authorize completion or automatic replay.
 */
export function validateAgCombinedIntent(
  committee: ReturnType<typeof captureAgCommitteeIntent>,
  holding: ReturnType<typeof captureAgHoldingIntent>,
): { cycleId: string; tickers: readonly string[] } {
  if (!committee || !holding || !Array.isArray(committee.decision_payloads) ||
      !Array.isArray(holding.decision_payloads)) {
    throw new Error("Both AG intent manifests are required");
  }
  const all = [...holding.decision_payloads,...committee.decision_payloads];
  const cycleIds = new Set(all.map((item) => item.args?.[0]));
  const sourceCycles = [holding.calls[0]?.p_cycle_id,committee.calls[0]?.p_cycle_id]
    .filter((value) => value !== undefined);
  for (const cycle of sourceCycles) cycleIds.add(cycle);
  if (cycleIds.size !== 1 || !UUID.test([...cycleIds][0] as string)) {
    // An entirely empty combined batch needs a separately approved no-op
    // protocol; it must not be treated as a successfully persisted cycle.
    throw new Error("AG combined intent has missing or mixed cycle identity");
  }
  const tickers = symbols(all.map((item) => item.ticker),"combined AG");
  if (committee.output_count !== committee.persistence_tickers.length ||
      holding.output_count !== holding.persistence_tickers.length ||
      committee.failure_count !== 0 || holding.failure_count !== 0) {
    throw new Error("Incomplete combined AG intent");
  }
  return { cycleId:[...cycleIds][0] as string,tickers };
}
