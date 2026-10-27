-- Defense against representing one external brokerage deposit with multiple HTTP keys.
-- Legacy contribution rows remain NULL; new posting API requires a reference.
-- The reference is a brokerage-provided transaction identifier, not an app-generated key.
ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS external_deposit_reference text;

ALTER TABLE public.contributions
  ADD CONSTRAINT contributions_external_deposit_reference_format
  CHECK (external_deposit_reference IS NULL OR
    external_deposit_reference ~ '^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$');

CREATE UNIQUE INDEX IF NOT EXISTS contributions_user_external_reference_uidx
  ON public.contributions (user_id, external_deposit_reference)
  WHERE external_deposit_reference IS NOT NULL;

-- This is NOT automatic proof that a brokerage deposit occurred. The user must
-- reconcile the supplied external reference with their brokerage statement.
