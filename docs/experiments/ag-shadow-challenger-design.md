# Accelerated Growth: Fundamentals-Aware Shadow Challenger — Design Gate

Status: EXPERIMENTAL DESIGN ONLY. No production selector, scoring, Committee, decision, or trading changes authorized.

## Evidence as of 2026-10-20

- Original 12-company prescreen: 5 preliminary growth candidates, 1 flagged, 4 unflagged; 12/12 sufficient history.
- Sector-coverage 12-company control: 4 preliminary growth candidates, 0 flagged, 4 unflagged; 10/12 sufficient history.
- Fixed-membership replay returned identical metrics and classifications across 24 tickers; it did **not** freeze vendor statements.
- This is not proof of superior investment outcomes. Sector control is not a fundamentals-aware challenger.
- Preliminary growth screening is not quantitative ADVANCE, Investment Committee BUY, or investment merit.

## Objective

Test whether a fundamentals-aware challenger identifies *incremental*, high-quality, financially verifiable companies missed by the production liquidity/price selector, without weakening any existing decision gates.

## Non-negotiable boundaries

1. Shadow-only: no writes to production candidate queues, decisions, portfolio, or trades.
2. No BUY quotas, relaxed thresholds, AI sizing, or automatic E*TRADE execution.
3. Retain existing 22-stock production selector and existing scoring and Committee criteria.
4. Run only through authenticated, explicitly invoked research endpoints with vendor request caps, throttling, and auditable run identifiers.
5. Do not conflate a flag-free screen with verified fundamentals; reconcile anomalies to filings before promotion.
6. Exclude overlapping names when reporting *incremental* discovery; report overlap separately.
7. Review prior WATCH/REJECT decisions and only reconsider when new evidence meets a defined trigger; do not erase decision history.

## Fair sampling design

- Freeze one eligible-universe snapshot with ticker, market-cap bucket, sector, market cap, price, dollar volume, eligibility reason, source timestamp, and selector version.
- Produce baseline and challenger rankings **from the same frozen universe**. Maintain identical bucket quotas (8 small, 8 mid, 4 large, 2 mega) and an identical per-arm financial-data budget. Record all candidate ranks and missing-data outcomes.
- Prefer paired, bucket-matched comparisons; keep overlapping candidates as a distinct cohort and never double-count them as incremental wins.
- Challenger prescreen inputs: quarterly revenue history completeness, latest YoY revenue growth, trend/slope, operating margin, and cash-flow context. These are *ranking inputs*, not BUY gates.
- For early-stage companies without 8 quarters, label INSUFFICIENT_DATA; do not silently treat as zero growth or force a negative investment conclusion.
- Use the same existing quantitative evaluation on both arms, followed by the same Deep Research and Committee process only if separately approved.
- Avoid look-ahead bias: timestamp vendor statements and use only information available at selection time.

## Data integrity and repeatability

Each experimental run should record immutable cohort membership, source statement dates/periods, raw input hashes (or retained raw vendor payloads subject to policy), scoring/prompt versions, computed metrics, flags, errors, request counts, and run timestamps. A membership hash alone does not reproduce historical vendor data.

Audit flagged cases first: SNDK extreme growth/dual margins, ASTS extreme negative margins and growth, and the prior COHR operating-profit/negative-FCF mismatch. Source validation must distinguish vendor normalization issues, low-denominator effects, one-time events, and actual economics.

## Outcome measures (no BUY-rate target)

Primary: incremental *verified* ADVANCE candidates per 12 newly evaluated, bucket matched.
Secondary: completeness, source-verification pass rate, research rejection reasons, incremental sector coverage, API cost, runtime, and Committee outcomes (if authorized).
Guardrails: no production writes, no unexpected request bursts, no duplicate Committee decisions, no changes to deterministic BUY sizing.
Use several frozen snapshots across different dates; a single 12-vs-12 comparison is exploratory and not statistically decisive.

## Stage gates

1. **Specification review:** approve universe schema, cohort matching, rate/cost limits, and duplicate-research policy.
2. **Read-only implementation:** construct frozen-universe snapshot and paired candidate lists; dry-run only.
3. **Validation:** verify financial data against filings for selected cases; audit request usage and output reproducibility.
4. **Research evaluation:** run existing quant model on balanced samples; compare verified ADVANCE rates and incremental merit.
5. **Production proposal only if evidence supports it:** separate explicit approval and safety checks before any deployment or workflow changes.

## Open questions

- Which durable store and retention period are appropriate for raw vendor data and snapshots?
- What is the daily FMP budget and maximum per-request execution time?
- What precise financial or market event allows a previously WATCH/REJECT ticker to be reassessed?
- Should shadow discovery be run on a scheduled cadence or manually only during the pilot?
