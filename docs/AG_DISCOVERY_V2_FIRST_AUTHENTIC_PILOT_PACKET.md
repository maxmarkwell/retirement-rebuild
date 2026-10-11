# AG Discovery v2 — First authentic historical pilot acquisition packet

**Status: proposed, not authorized.** This packet is a bounded decision request, not permission to access production, run backfills, fetch historical vendor data, or execute trades. The feature branch remains isolated.

## Question and preregistered comparison

For the **same** historically eligible universe, research cutoff, and fixed research-slot capacity, does the five-path AG v2 process surface independently supportable issuer research opportunities that v1 did not select? Report both incremental and displaced selections; do not label incremental selection as investment alpha.

Predeclare the dates, universe membership method, candidate exclusions, v1 selection definition, research capacity, source publishers, and reviewer **before** examining v2 outcomes. Do not choose cycles because they favor v2. Start with **three consecutive eligible historical cycles** (or record why fewer exist); expand only after a clean provenance review. This is a process feasibility pilot, not a statistically powered performance study.

## Authorization needed before acquisition

A separately approved, read-only capture plan must identify:

1. **Source system and access boundary:** precise v1 run records, original candidate-universe records (including rejected/delisted issuers), WATCH/new-discovery provenance, issuer-identity history, and source data archives. List allowed tables/files/API endpoints explicitly; no unrestricted production queries.
2. **Capture operator and independent reviewer:** distinct named people; reviewer verifies original source timestamps and independently checks a sample of original records against archives. Names recorded in metadata are not signatures.
3. **Storage and retention:** approved access-controlled storage for original bytes, immutable digests, versioned manifest, retention and deletion schedule, and restrictions on confidential or licensed vendor material. Do not commit raw vendor data or sensitive production exports to GitHub.
4. **Budget and licensing:** permitted historical vendor usage, rate limits, cost ceiling, and permission to retain/reproduce raw responses. Stop if historical entitlements cannot be established.
5. **As-of rule:** distinguish original **publication**, original **availability/observation**, and today's **retrospective retrieval**. The existing archive verifier requires `retrievedAt <= researchAsOf`; therefore a document first fetched today must **not** be falsely stamped as historically retrieved. If original contemporaneous retrieval cannot be substantiated, mark the cycle **NOT EVALUABLE** under the current contract. Changing that contract requires separate review, not a quiet timestamp workaround.

## Minimum acceptance criteria for each cycle

| Gate | Reviewer evidence | Fail-closed outcome |
| --- | --- | --- |
| Original v1 decision | Original run ID, ordered shortlist, capacity, cutoff, WATCH origin | Reject cycle if reconstructed from current state |
| Full candidate universe | Point-in-time membership, excluded/delisted issuers, membership source | Reject cycle if survivorship cannot be ruled out |
| Issuer identity | Historical issuer ID / ticker effective-date mapping for **every** candidate | Reject ambiguous symbol reuse or unmapped issuers |
| External source availability | Original document/accession IDs, publisher timestamp, observed retrieval record, fiscal period, units | Reject unsupported as-of availability |
| v2 assessment provenance | Five-path inputs and counterevidence grounded in records available at cutoff | Reject hindsight assessments |
| Independence | Independent reviewer cross-checks raw source and capture manifest | Mark authenticity unverified until completed |
| Replay | Unchanged source bytes and digests, successful offline linkage and batch preflight | Reject on any validation failure |

## Execution order after separate authorization

1. Freeze and document the eligible date range, v1 comparison baseline, source access scope, and reviewer.
2. Capture **one** complete cycle read-only, preserve original bytes and original timestamps, and record exceptions. Do not synthesize missing historical inputs.
3. Independently audit that cycle, including issuer mapping and representative candidate/source correspondence. Stop on unresolved provenance.
4. Capture the remaining preregistered consecutive cycles under the same rules; verify archive linkage, chronology, and digests offline.
5. Run `v2-history-pilot-cli.ts` on the local bundle. A valid bundle currently returns `researchConclusion: NOT_EVALUABLE` and CLI exit code 3 because automated authenticity certification does not exist; an independent signed review must be considered **outside** that tool.
6. Review all v2-only and displaced issuers, path explanations, contradictions, and invalidation criteria. Record disagreements and missing evidence; do not force a positive result.

## Decision record and stop/go

The initial decision is **whether evidence capture is feasible and lawful**, not whether AG should trade. Report (a) how many preregistered cycles were attempted/accepted/rejected and why, (b) original-universe completeness, (c) source authenticity and as-of gaps, (d) research-slot overlap/displacement and first-seen differences, and (e) manual review of disagreements. If any provenance gate fails, publish **NOT EVALUABLE** rather than omitting the cycle.

**Explicitly excluded:** production migrations, write queries, scheduler enablement, vendor normalization changes, AG live trades, and feature-branch merge/deployment. Any such action requires separate authorization.
