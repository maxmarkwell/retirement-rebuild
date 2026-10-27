-- Review-only migration. DO NOT apply until contribution posting endpoint is ready.
-- Existing legacy contributions remain valid with NULL idempotency keys.
-- Future server-side contribution posting must require a key and ensure
-- the target portfolio is the authenticated user's real-money account.
ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.contributions
  ADD CONSTRAINT contributions_idempotency_key_format
  CHECK (
    idempotency_key IS NULL
    OR idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS contributions_user_idempotency_key_uidx
  ON public.contributions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- NOTE: uniqueness prevents repeated writes using the SAME key only.
-- The posting API must compare the persisted payload on repeated keys;
-- it must reject key reuse with a different amount/date.
-- No privileged function or RLS bypass is added in this migration.
