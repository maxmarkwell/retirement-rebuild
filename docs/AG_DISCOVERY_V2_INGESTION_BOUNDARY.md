# Accelerated Growth Discovery v2 — evidence ingestion boundary

Status: feature-branch prototype. **No live ingestion, daily-cycle wiring, or trading authorization.**

## Source roles

- `v2-sec-companyfacts.ts`: pure parser for SEC Company Facts JSON **already obtained by a trusted transport**. A URL string supplied to the parser does not authenticate the data. A production transport must verify HTTPS response origin, status, content type, request bounds, rate limits, CIK and accession identity, and SEC access policies.
- `v2-vendor-scale-audit.ts`: offline archive SHA-256 verification and structural validation (ticker, fiscal year/quarter, calendar-valid period end, USD currency, finite income-statement revenue/operating income and cash-flow free cash flow) and SHA-256 duplicate detection for supplied sample response bytes; it cannot authenticate provenance or establish monetary-scale semantics and does not enable vendor ingestion.
- `v2-vendor-scale-policy.ts`: pure attestation completeness/effective-date validator requiring separate income/cash-flow declarations, a named reviewer, a provider-hosted specification reference, a SHA-256 archive digest, and at least two inspected provider-response samples per endpoint. It **does not** verify the content of that reference or independently establish scale. Its passing result is not authorization to enable vendor ingestion.
- `v2-vendor-transport.ts`: disabled-by-default read-only HTTPS retrieval for bounded FMP JSON arrays; allowlists only the income-statement and cash-flow-statement endpoints with exactly one matching ticker parameter, and rejects other query parameters and redirects. It also checks every returned record has the requested ticker, rejecting missing or mismatched symbols. Missing provenance and inconsistent timestamps are rejected before network access. It deliberately **never returns eligible observations** because the payload does not establish a trusted monetary-scale declaration. The mock-only tests do not call the live vendor. This is a transport scaffold, not a production-ready connector.
- `v2-vendor-normalizer.ts`: pure adapter for quarterly vendor income and cash-flow records. It requires explicit unscaled USD metadata, USD declarations on both rows, valid matching fiscal-end dates, HTTPS source URLs without embedded credentials, a nonblank publisher, and publication/retrieval chronology; any violation returns no observations. Vendor records are `MARKET_DATA`, **not** `FILING`. These metadata claims are not independently authenticated by this adapter.
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

## Monetary-scale release gate

The current vendor transport intentionally always returns `VENDOR_TRANSPORT_SCALE_UNVERIFIED` after structurally valid USD responses. Before any future integration, independently inspect and archive the actual provider specification, verify the archived SHA-256 digest and at least two real provider-response samples per endpoint, document monetary unit conventions for each endpoint, verify fiscal-period and issuer mapping, review version/effective dates, and require an explicit separate authorization to wire verified observations. A caller-provided attestation or a provider-looking URL alone must never bypass this gate.

## Known limitations

The SEC adapter currently receives caller-supplied data and URL metadata; it cannot prove the data came from SEC servers. It requires one unique quarterly fact per metric and fails closed on alternate taxonomy tags. It also does not yet map vendor `freeCashFlow` to SEC operating cash flow minus correctly signed capital spending. Source/document independence checks compare asserted identifiers; they cannot independently verify the identities without a trusted retrieval and extraction layer.
