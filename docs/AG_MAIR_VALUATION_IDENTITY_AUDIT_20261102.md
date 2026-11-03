# AG MAIR valuation / security-identity audit — 2026-11-02

**Scope:** Read-only investigation of the saved AG scan `90a8c1d9-3746-438a-979e-8c16ce2ca264`. No historical decision edits or trading authorization.

## Confirmed external primary-source identity
- Issuer: MAIRE S.p.A.; primary listing: Borsa Italiana / Euronext Milan; ticker **MAIRE**; ISIN **IT0004931058**; quote currency **EUR**.
- Borsa Italiana's October 30, 2026 market record: closing share price **€12.73**, exchange market capitalization **€4,183,592,699**.
- MAIRE's shareholder page (last updated April 27, 2026): **328,640,432** ordinary shares; historical issued-share reference, not contemporaneous independently reconciled diluted shares.
- The original saved Deep Research uses ~€12.73 and ~€4.17bn; these are broadly corroborated.
- Original Committee vendor snapshot instead cited ~€22.98 and €11.53bn, with unreconciled ~€14.34bn enterprise value. These figures cannot be trusted for MAIRE ownership evaluation without confirming exact security, exchange, currency, dates, shares and corporate actions.
- The scan stores candidate symbol **MAIR**, not the exchange primary-listing ticker **MAIRE**. We have NOT yet proved which FMP instrument the MAIR key actually resolves to, whether an alias exists, or why the vendor values differ.

## Primary source references
- https://www.borsaitaliana.it/borsa/azioni/dati-completi.html?isin=IT0004931058
- https://www.groupmaire.com/en/investors/shareholders/
- https://www.borsaitaliana.it/borsa/azioni/scheda/IT0004931058-MTAA.html?lang=en

## Source-to-code observations
- `lib/company-data/fmp.ts` builds fundamentals from multiple FMP endpoints using a caller-provided symbol; the returned profile fields don't currently establish exchange, currency, or ISIN identity.
- `lib/discovery/accelerated-growth/valuation-snapshot.ts` retrieves FMP quotation and fundamentals using the same bare symbol, but does not verify an expected ISIN/exchange/currency before presenting numeric values for Committee evaluation.
- `getSecShares` relies on the US SEC's ticker lookup; no SEC match for a foreign listing is not itself evidence that shares are incorrect.
- The comparison endpoint uses saved original Committee **valuation prose**, not the original raw FMP snapshot. It is a reasoning comparison, not a corrected-valuation rerun.

## Decision and acceptance
1. Treat the historical MAIR valuation as **CONFLICTED**; never promote a BUY on the unreconciled snapshot.
2. Do not silently substitute MAIRE for MAIR in saved scan identities, company databases, or historical results. Confirm FMP vendor symbol/exchange/ISIN mapping, data entitlements, and quote/balance-sheet currency units first.
3. Next production-quality fix: introduce independently checked security identity (issuer/ISIN, exchange, quote currency, source timestamp) before applying market capitalization, enterprise value and multiple computations. Fail closed if identity cannot be established. Avoid MAIR-only hacks.
4. After verifying identity, run a *separately labeled* fresh-evidence Committee evaluation. Never portray it as same-input historical replay and never overwrite original WATCH records.

**No change made here to valuation production behavior or historical research.**
