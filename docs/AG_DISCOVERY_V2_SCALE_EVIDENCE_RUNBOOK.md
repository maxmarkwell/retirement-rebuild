# AG Discovery v2 — Vendor monetary-scale evidence runbook

Status: **not verified**. This is an offline, human-reviewed research protocol, not authorization to turn on live vendor ingestion.

## Required source material

1. Obtain original, unmodified quarterly FMP `/stable/income-statement?symbol=...&period=quarter` and `/stable/cash-flow-statement?symbol=...&period=quarter` JSON response bytes through an approved credentialed workflow. Do not commit API keys, URLs containing secrets, or proprietary raw responses to Git.
2. Archive the contemporaneous FMP endpoint specifications, original response bytes, retrieval time, and SHA-256 hashes in an approved access-controlled evidence store.
3. Independently obtain SEC EDGAR accession/companyfacts source records and identify the issuer CIK, quarter end, filing accession, filing date, accounting metric, and units. Keep source links and original evidence.
4. Compare at least two issuers and two fiscal quarters. Use **the same economic metric and quarter definition** on each side; reject ambiguous year-to-date versus discrete-quarter cash-flow values, restatements that do not align, differing fiscal calendars, and inconsistent accounting concepts. Record all exclusions and why.
5. Independently review the FMP monetary unit/scale claim and run `auditV2VendorScaleArtifacts` and `diagnoseV2VendorMonetaryScale` offline. A diagnostic factor of 1 is a *necessary signal*, not proof of correctness. Factors of 1,000 or 1,000,000 indicate a unit mismatch requiring investigation, not automatic conversion.
6. Require a named reviewer to sign off on specification provenance, response authenticity, SEC comparability, and exception handling. Preserve the attestation review dates and scope. If any evidence is missing or ambiguous, keep ingestion blocked.

## Evidence register (complete per comparison)

| Field | Meaning |
| --- | --- |
| issuer CIK / symbol | Independently matched issuer |
| fiscal year / quarter / end | Exact same reporting period |
| metric / accounting concept | Like-for-like definition, including sign |
| SEC accession / fact / units | Filing evidence and USD amount |
| FMP endpoint / archived response digest | Vendor evidence and raw numeric amount |
| publication / retrieval timestamps | Temporal integrity |
| difference / implied scale | Calculated result, not a claim of authenticity |
| reviewer / review date / decision | Human accountability and unresolved issues |

## Hard boundaries

The scale diagnostic accepts caller-supplied numbers and **cannot prove** the records are genuine, independent, or accounting-equivalent. No synthetic fixture, public documentation example, passing CI run, or matching scale ratio substitutes for original source evidence. Do not merge, deploy, change database state, authorize trades, or enable vendor ingestion on the basis of this runbook.

## Observation-level preflight

After independent SEC and FMP extraction, pass source-linked `V2VerifiedObservation` records through `diagnoseV2ScaleFromObservations` before reviewing any implied scale. This offline bridge requires USD records, one matched filing and vendor observation per issuer/quarter/metric, distinct source-document and extraction identities, valid lineage, no as-of lookahead, and the diagnostic's cross-issuer and cross-quarter coverage. It reports problems without changing records or enabling ingestion. The bridge cannot establish the authenticity of caller-provided IDs, URLs, or financial figures, and matching revenue does not validate other accounting metrics.
