# AG transactional persistence schema compatibility gate

Status: diagnostics branch only. Do not apply a migration or enable AG based on the disposable fixture passing.

## Confirmed repository mismatch

The checked-in initial `investment_decisions` migration (`20260819214033_create_investment_decisions.sql`) does **not** define `notes`. The proposed `ag_commit_cycle_decision` SQL inserts into `investment_decisions.notes`; the disposable fixture deliberately defines that column to let the draft's transaction behavior run. Consequently, isolated PostgreSQL green status **does not prove** the proposed RPC can run against the deployed database.

Before any integration or migration, perform a **read-only** live catalog query (no schema writes):

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'investment_decisions'
ORDER BY ordinal_position;

SELECT extname, extnamespace::regnamespace::text AS extension_schema
FROM pg_extension WHERE extname = 'pgcrypto';

SELECT to_regclass('public.ag_cycle_stage_checkpoints') AS checkpoint_table,
       to_regclass('public.ag_cycle_decision_writes') AS ledger_table;
```

Record whether `notes` was introduced outside version-controlled migrations, and compare **all** proposed RPC INSERT columns and constraints against the live schema. Verify `public.digest` is available in the target database's actual extension schema. If `notes` is absent, propose a separately reviewed migration or a documented provenance-preserving alternate mapping. Do not silently remove the field.

## Live audit result — 2026-10-05

The required read-only audit is complete. See
`ag-live-schema-audit-2026-10-05.md`.

Confirmed: `notes` is absent; `pgcrypto` is installed in `extensions`;
the live quantitative watchlist constraint accepts the legacy
`QUANTITATIVE_*` values; recovery checkpoint/ledger tables and recovery RPCs
are absent; and the active-AI uniqueness index is cross-era. Supabase migration
history stops at Sep. 17 despite later AG schema being present, so migration
history must be reconciled before any DDL is applied.

The draft SQL now targets `extensions.digest` and explicitly fails closed on
a pre-era active AI decision. A nullable `notes text` addition is documented
in `ag-decision-provenance-schema-proposal.sql` but has **not** been applied.

## Release gate

1. Obtain read-only live schema evidence and reconcile it with committed migrations.
2. Run a disposable integration fixture matching that confirmed schema, including RLS/roles and relevant uniqueness constraints.
3. Prove that a batch interrupted after an individual decision commit can resume using the ledger without duplicating or omitting writes.
4. Wire stage claiming, per-decision RPC, watchlist persistence and stage completion with explicit recovery semantics; never mark a stage complete based solely on an application response.
5. Review a migration and deployment plan separately. Keep the legacy persistence hard block and AG default-OFF gate until approval.
