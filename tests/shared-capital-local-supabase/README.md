# Isolated shared-capital Supabase fixture

This CI test uses a disposable Supabase project inside `.contribution-supabase-ci`.

The full repository migration replay failed before reaching contributions because the
20261015010000 AG worker migration references `public.ag_cycle_stage_checkpoints`
before that relation exists in the replay. That migration dependency is a **separate
schema-reproducibility defect**, not a contribution endpoint failure.

To avoid changing AG migration history or misrepresenting what is tested, this
workflow constructs only minimal base portfolio/transaction/contribution fixture
tables, then applies the **exact** tracked contribution idempotency migration
`20261027170000_contribution_idempotency.sql` through local Supabase.

It verifies idempotency column, unique index and enabled contribution RLS.
It does **not** establish that all production migrations replay successfully,
that test base tables mirror production in full, or that authenticated HTTP
contribution posting is ready. Those require separate follow-up integration work.

Never run `supabase link` or `supabase db push` in this workflow.
No hosted project credentials are supplied.
