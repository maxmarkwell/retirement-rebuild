# AG Discovery v2 — Historical shadow input capture checklist

**Status: design-only.** This checklist does not authorize production reads, historical exports, backfills, ingestion, migrations, trades, or deployment.

## Per-cycle evidence to retain

| Item | Minimum evidence |
| --- | --- |
| Cycle identity | Immutable original v1 run ID, pipeline version, research cutoff, actual capture timestamp |
| Universe | All candidates available at the research cutoff, including rejected and delisted names; membership source and original timestamp |
| v1 shortlist | Original ordered selected symbols, slot capacity, WATCH reassessment versus new-discovery origin |
| v2 assessments | All five-path assessments for the same point-in-time universe, with missing evidence recorded as missing rather than inferred |
| Issuer identities | Historical CIK-to-symbol mapping for **every** candidate, effective at or before the cutoff, with SEC/source references |
| Filing and vendor records | Original source and retrieval times, accession/document IDs, fiscal-quarter definitions, accounting units and extraction versions |
| Reproducibility | Snapshot digests, approved storage location, source provenance, code revision, operator and independent reviewer |
| Exceptions | Renames, symbol reuse, mergers, delistings, stale filings, ambiguous quarter alignment, missing WATCH history |

## Comparison workflow

1. **Read-only acquisition requires a separate reviewed authorization.** Never infer a historical v2 result from today's fundamentals without recording the resulting lookahead limitation.
2. Confirm that all v1 cycles use comparable selection definitions and that every v2 assessment is reconstructed using only information known by the historical research cutoff.
3. Validate each cycle with `compareV2ResearchSlots`; then validate the ordered series with `compareV2ResearchHistory` and issuer mappings with `compareV2ResearchHistoryWithIssuers`. Reject the complete comparison if any preflight fails.
4. Review displacement, overlap, per-path unique issuer counts, repeated research, and cycles without new discoveries. Manually examine representative disagreements and all source-identity exceptions.
5. Do not interpret more unique companies or fewer WATCH slots as better investment returns. A later study must predefine research-quality outcomes, point-in-time market data, and controls for survivorship, selection, liquidity and risk.

## Stop conditions

Stop and mark **NOT EVALUABLE** if original run timestamps, full historical candidate-universe membership, issuer identities, or historical evidence publication times cannot be established. Never silently fill missing cycles or treat today's surviving tickers as the historical universe. Do not merge the feature branch or enable the production scheduler on the strength of an offline report alone.

## Offline capture envelope

`verifyV2HistoryCapture` checks a versioned `ag-history-capture-v1` envelope containing the 40-character source-code revision, independently named operator and reviewer, a 64-character SHA-256 source-manifest digest, and the complete versioned historical issuer-identity comparison input. It produces a deterministic SHA-256 digest of the canonical JSON-compatible envelope after the existing history and identity preflights pass. Reordering object keys does not change the digest; changing captured evidence or metadata does. The digest is an integrity fingerprint **only**. It does not authenticate the operator, reviewer, manifest, source documents, SEC issuer mapping, capture timestamp, or whether evidence was genuinely available historically. An external, independently reviewed archival process must establish those claims before a historical study is trusted.

`compareV2HistoryCaptureReplay` checks whether two independently supplied capture envelopes produce the same digest and identifies changed source revisions, source-manifest digests, or reviewer identities. `verifyV2HistorySourceManifest` additionally hashes actual supplied UTF-8 source-manifest bytes (maximum 1 MiB) and checks them against the envelope's declared digest; whitespace and byte changes are significant. Neither operation retrieves documents or verifies that a manifest's listed sources exist or were available at the historical cutoff.

## Source-byte archive preflight

`verifyV2ArchivedSources` checks a caller-supplied JSON source manifest and corresponding UTF-8 source payloads offline. Each source has a unique ID, type (`V1_CYCLE`, `UNIVERSE`, `ISSUER_MAPPING`, `SEC_FILING`, or `VENDOR_RAW`), SHA-256, published/retrieved UTC timestamps, and an HTTPS source URL without credentials or fragments. Every listed source must have exactly one matching payload with matching bytes, and no extra payloads are accepted. The manifest must include a v1 cycle, historical universe, and issuer mapping; timestamps must not exceed the declared research cutoff. **Important scope:** one shared archive is constrained to evidence available by the *first* historical cycle; subsequent cycles need separately captured source archives if they rely on newer evidence. The function validates supplied records, not SEC/FMP authenticity, historical availability, or source completeness. No live network requests, DB reads, or trading effects occur.

## Semantic cycle-to-archive linkage

`verifyV2HistoricalCycleLinkage` now adds a strict **single-cycle** preflight beyond byte hashes. Its archived `V1_CYCLE` JSON must include the exact run ID, research cutoff, capacity and ordered `selectedSymbols`; `UNIVERSE` must include the same run ID and cutoff plus the full sorted candidate `symbols`; `ISSUER_MAPPING` must include the same run ID and cutoff plus sorted `identities` (`symbol`, `issuerId`, `effectiveAt`) matching every candidate. Exactly one source record of each required kind is permitted. This detects a validly hashed but unrelated archive, such as a historical v1 selection from another day. It does not authenticate the source or prove the universe was historically complete. For multiple cycles, run this linkage independently against each cycle's own envelope and archive; do not reuse a first-cycle archive for later research cutoffs.

## Integrated multi-cycle archive preflight

`verifyV2HistoricalArchiveBatch` accepts 1–100 **separate single-cycle** capture envelopes, source manifests, and payload sets. It validates each archive's bytes and semantic linkage, rejects duplicate run IDs and reused manifest fingerprints, then enforces historical chronology and issuer mapping consistency across the complete batch. Its output includes unique v1/v2 issuers and v2 research slots by origin and unique issuer by opportunity path. This is a synthetic-testable offline gate for a future authorized historical pilot, **not** a collector or backtester. Every cycle must retain its own point-in-time archive. It does not fetch Supabase records, authenticate externally supplied timestamps, or measure returns.

## Pilot report and interpretation

`buildV2HistoricalPilotReport` accepts only a fully validated multi-cycle archive batch. It produces per-cycle v1/v2 selections, overlap, v2-only research-slot selections, displaced v1 selections, WATCH/new-discovery slots, and mapped CIKs. The aggregate `uniqueIncrementalIssuers` counts CIKs selected by v2 that were **never selected by v1 anywhere in the supplied period**, whereas `totalNewlySelectedSlots` counts per-cycle v2-only slots and can include repeat appearances. `uniqueDisplacedIssuers` is the inverse. These are research-coverage comparisons, **not** return, alpha, causal uplift, BUY, or investment-performance estimates. The output cannot establish historical authenticity or independently reconstruct candidate assessments; real pilot inputs still require separate source capture and review.

## Portable offline pilot input

The portable bundle has the exact top-level shape `{"schemaVersion":"ag-history-pilot-bundle-v1","archives":[...]}`, where each archive contains `envelope`, `manifestUtf8` (the **exact** source-manifest JSON byte string), and `payloads` (source IDs and exact UTF-8 content). The bundle is limited to 32 MiB and 100 cycles. For a locally supplied, reviewed bundle, run:

```bash
npx tsx lib/discovery/accelerated-growth/v2-history-pilot-cli.ts /absolute/path/to/reviewed-bundle.json
```

The command prints an accepted/rejected JSON report to standard output and exits nonzero on failure. It performs **no automatic historical acquisition**, database reads, network requests, or writes. The bundle SHA-256 identifies the exact supplied file bytes and does not authenticate their origin. The pilot still requires independently reviewed real source snapshots and authentic as-of provenance; synthetic fixtures do not establish discovery lift.

## Archived v2 assessment linkage

The single-cycle linkage gate now requires exactly one `V2_ASSESSMENTS` source alongside `V1_CYCLE`, `UNIVERSE`, and `ISSUER_MAPPING`. Its archived JSON must contain the matching `runId`, `researchAsOf`, and **exact ordered `candidates` array**, including origin and five-path assessment contents. The source bytes must match their manifest SHA-256. This prevents a researcher from substituting unarchived or changed v2 assessments while retaining a valid v1 archive. Equality and hashes establish internal consistency only; a separate reviewer must still validate the assessments' independent, point-in-time evidentiary basis. Previously prepared three-source pilot bundles must be recaptured under this stronger four-source contract.

## Path-level incremental discovery breadth

The pilot report also emits `v2PathIncrementalIssuerCounts`: for each v2 path, the number of distinct CIKs selected through that path that **never appeared in any v1 selected research slot across the supplied historical window**. A company qualifying for multiple paths counts once within each path, so these path totals must **not** be summed to claim unique overall discoveries. `v2PathUniqueIssuerCounts` includes all selected issuers, including those also researched by v1. These are descriptive research-coverage metrics only; they are not per-path performance or investment merit.
