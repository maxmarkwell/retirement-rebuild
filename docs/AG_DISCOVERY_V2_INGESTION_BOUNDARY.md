# Accelerated Growth Discovery v2 — evidence ingestion boundary

Status: feature-branch prototype. **No live ingestion, daily-cycle wiring, or trading authorization.**

## Source roles

- `v2-sec-companyfacts.ts`: pure parser for SEC Company Facts JSON **already obtained by a trusted transport**. A URL string supplied to the parser does not authenticate the data. A production transport must verify HTTPS response origin, status, content type, request bounds, rate limits, CIK and accession identity, and SEC access policies.
- `v2-vendor-normalizer.ts`: pure adapter for quarterly vendor income and cash-flow records. Vendor records are `MARKET_DATA`, **not** `FILING`.
- `v2-cross-source-reconciliation.ts`: compares like-for-like observations and rejects unmatched issuer, period, units, values beyond tolerance, and reused extraction/document identities.
- `v2-lineage-builder.ts`: constructs expected-value requirements from independently normalized observations; it does not authenticate either input.
- `v2-research-gate.ts`: opt-in `requireLineage` rejects missing or contradictory provenance. Legacy callers retain the prior behavior.

## Non-negotiable safety rules

1. Never promote an FMP vendor response into `FILING` merely because it reflects a regulatory report.
2. SEC `companyfacts` duration facts may be quarter-to-date, year-to-date, or annual. Only explicitly matching single-quarter durations are accepted. Do not infer free cash flow from ambiguous capex signs or subtract arbitrary YTD observations.
3. Do not infer fiscal quarter from calendar quarter for off-calendar issuers without a validated issuer-specific fiscal mapping. A `CY2026Q2` frame is not inherently fiscal `2026-Q2`.
4. Do not accept source URLs, document IDs, issuer IDs, extraction IDs, or expected values from AI output as independently authenticated facts. These are claims until the trusted ingestion boundary verifies them.
5. Do not automatically allow a reconciliation tolerance to grow with a disagreement. Tolerances must be independently configured and metric/unit-specific.
6. If filings and vendor data disagree, preserve both observations and return an explicit discrepancy. Do not average them or silently choose the most favorable value.
7. Do not enable strict research eligibility on live data until the real transport, extraction provenance, and fixture-to-live mapping are audited. Screening qualification is not a BUY recommendation.
8. Keep AG paper-only and leave production execution, Supabase schema/data, and portfolio positions unchanged.

## Implementation sequence

1. Add a trusted, read-only SEC transport behind an explicit disabled-by-default feature flag.
2. Verify accession, CIK, filing period, extraction and fiscal-calendar mapping using actual SEC fixtures (including amendments, non-calendar fiscal years and restatements).
3. Normalize comparable FMP metrics to the same canonical units and periods.
4. Reconcile with explicit tolerances, immutable discrepancy logs and failure reasons.
5. Run shadow-mode v2 research against v1 outputs with no decision persistence or trading.
6. Only after review, consider separately authorized integration into the daily cycle.

## Known limitations

The SEC adapter currently receives caller-supplied data and URL metadata; it cannot prove the data came from SEC servers. It requires one unique quarterly fact per metric and fails closed on alternate taxonomy tags. It also does not yet map vendor `freeCashFlow` to SEC operating cash flow minus correctly signed capital spending. Source/document independence checks compare asserted identifiers; they cannot independently verify the identities without a trusted retrieval and extraction layer.
