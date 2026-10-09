# AG immutable intent capture: implementation handoff

**Isolated capture implementation; not wired to the active runner.** Existing `daily-cycle-work.ts`
still fails closed before legacy persistence. This handoff ties the proposed
checkpoint manifest to the *existing* AG research and holding pipelines; it
does not create a second research or Committee implementation.

## Implemented isolated capture boundary

The pure `immutable-intent-capture.ts` now builds both manifests from existing decision types, validated upstream `eligibleSymbols`, `failedCount` **and** `errors`. Both existing pipeline result types now expose the actual eligible symbols. Its combined preflight rejects cross-stage duplicates and mixed cycles. The module is tested but **not called by the active runner**, and a successful in-memory snapshot is not durable evidence until checkpoint completion stores it atomically. It intentionally does not authorize persistence RPC writes. `stage-checkpoint-capture.ts` plus `stage-checkpoint-supabase.ts` now provide an isolated authenticated claim/completion boundary for making those manifests durable; CI forbids that layer from decision/watch persistence, transaction execution, direct recovery-table access, or active-runner imports.

## Existing output boundaries

- `runAgHoldingReviewPipeline()` returns `candidateCount`,
  `completedCount`, `failedCount`, `decisions`, `errors`, and now
  `eligibleSymbols`.
  The existing loop collects one `AgHoldingReviewDecision` per successful
  candidate. Freeze the complete candidate identity list and the full
  validated review outputs **before** marking `holding_review` completed.
- `runAgCommitteePipeline()` returns `requestedCount`,
  `completedCount`, `failedCount`, `decisions`, `errors`, and now
  `eligibleSymbols`.
  It derives `proceed` from the existing deep-research pipeline. Freeze
  the complete `proceed` identity list, full validated Committee outputs,
  and the canonical persistence arguments **before** completing `committee`.
- Existing `daily-cycle-work.ts` checks both batches for unique tickers and
  disjoint membership and refuses to persist when Committee pipeline errors
  or failures exist. Preserve these checks; move them to each stage boundary
  and the combined persistence preflight rather than bypassing them.

## Required evidence before completing stages

1. Persist source identities, source result count, output decision count,
   failure count and the full typed decisions together in the checkpoint.
   Require exact set equality between eligible input identities and output
   identities, not merely equal counts. For a legitimate empty batch, preserve an explicit empty-batch representation;
   do not invent a decision merely to make persistence nonempty.
2. Convert each validated Committee decision to the exact 16-element typed
   `ag_commit_cycle_decision` argument array. Build
   `persistence_tickers` from those same validated decisions, never from a
   separate caller-supplied list. The array and ticker set must agree exactly.
   Do not accept a client-provided hash; the database derives SHA-256 from
   PostgreSQL `jsonb_build_array(typed arguments)::text`.
3. Freeze both the original decision and the canonical RPC arguments in one
   immutable completed checkpoint. Reject missing fields, unexpected
   decisions, duplicate tickers, failed or partial upstream results and
   mismatched source identities. A checkpoint cannot be marked completed
   solely because a request supplies a syntactically valid JSON manifest.
4. Holding reviews need their **own** canonical typed manifest, derived from
   `AgHoldingReviewDecision`. The existing holding writer maps:
   `ownershipThesis` to thesis, `confidence` to confidence,
   `thesisClock` to holding period, `strongestEvidence.join("\\n")`
   to bull case, `strongestCounterEvidence.join("\\n")` to bear case,
   `requiredMonitoring.join("\\n")` to monitoring and
   `invalidation.join("\\n")` to invalidation. Preserve its JSON
   `notes` provenance (rationale/model/promptVersion) and decide whether
   a new-cycle same-type decision snapshot intentionally replaces the old
   holding writer's `REUSE` behavior. Never silently change existing
   ownership semantics without a regression test.
5. Before enabling persistence completion, validate the disjoint union of
   frozen holding and Committee manifests and require exact committed-ledger
   coverage for **both** kinds. The draft completion now verifies both payload kinds and the exact disjoint
   mixed batch in disposable PostgreSQL tests. Watchlist changes remain separate mutation streams, but persistence completion must not be considered safe until their frozen deep-research manifest has exact committed-ledger coverage and verified row postconditions.

## Transaction and recovery boundary

The draft `ag_complete_persistence_stage` locks the persistence checkpoint,
checks the disjoint combined ledger coverage and calls both
`ag_verify_committee_payload_manifest` and
`ag_verify_holding_payload_manifest` inside that lock. The decision RPC
locks the same checkpoint. This is necessary but not sufficient: it verifies
the **stored** manifest, not whether the upstream Committee truly produced
every entry. A timeout after any write must trigger read-only ledger inspection
and manual reconciliation for uncertain partial batches; never blind replay.

**Next acceptance tests:** exact source-to-output identity match, incomplete
Committee/holding results, duplicate cross-stage ticker, empty legitimate
batch, altered typed argument, mutated linked decision, mixed-kind coverage,
and watchlist interruption. Run against a verified actual-schema disposable
database. No live migrations, AG enablement or production deployment are
authorized by this design.

## Outstanding capture integration risk

The existing Committee writer derives BUY execution evidence by fetching the dynamic discovery universe **at persistence time**. A resumable implementation must freeze the same evidence at Committee completion (or an explicitly versioned prior research checkpoint), then pass that exact evidence to the isolated capture builder. Never re-fetch a changed universe after a retry and silently change the persisted BUY evidence. Capture the original stage result and derived evidence together; a syntactically correct client-provided evidence map is not upstream provenance. The holding stage claim token and Committee stage claim token are distinct from the later persistence claim token: frozen argument arrays deliberately exclude claim tokens. `persistence-stage-plan.ts` now reconstructs decision RPC calls from those frozen canonical arrays under the current persistence claim, and its isolation contract forbids Supabase access or write execution.

## Watchlist intent boundary

The isolated `watchlist-intent-capture.ts` now snapshots all three legacy watchlist mutation streams after a clean upstream research result, without any database writes. Its tests cover distinct streams, duplicate/conflicting ticker operations, incomplete research, immutable output and the normalized 0–1 confidence scale. The live research-watchlist constraint audit confirmed the `QUANTITATIVE_*` resolution strings used by the legacy writer are allowed. Deep-research outcomes now preserve `priorWatchRowId` through `committee-pipeline.ts`, so reassessed WATCH intent retains the exact source row identity. See `ag-watchlist-recovery-gate.md` for durable replay requirements. Do not infer that a passing pure planner proves the watchlist can be persisted or safely resumed.


## Persistence reconciliation status

The draft watchlist SQL now includes `ag_verify_cycle_watch_manifest`, a read-only aggregate verifier that requires exact ledger cardinality and rechecks every frozen watch operation through the existing postcondition verifier. The decision completion proposal now accepts an explicit zero-decision expected set. The final persistence completion authority now requires the aggregate watch verifier at the same locked database completion boundary. The Committee stage validator/verifier and persistence completion tests now cover an explicit zero-decision path without inventing work. Active-runner wiring remains unauthorized until equivalent audited-actual-schema behavioral coverage and the remaining security/migration review are complete.
