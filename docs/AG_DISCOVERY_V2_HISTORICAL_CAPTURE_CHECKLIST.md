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
