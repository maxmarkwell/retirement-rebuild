\set ON_ERROR_STOP on
CREATE TABLE contribution_test (
  id bigint generated always as identity primary key,
  user_id text not null,
  portfolio_id text not null,
  amount numeric not null,
  contribution_date date not null,
  idempotency_key text,
  CONSTRAINT contributions_idempotency_key_format CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$')
);
CREATE UNIQUE INDEX contributions_user_idempotency_key_uidx
  ON contribution_test (user_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key)
VALUES ('user-a','real-a',100,'2026-10-27','deposit_unique_00001');
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM contribution_test WHERE user_id='user-a' AND amount=100) THEN RAISE EXCEPTION 'initial insert failed'; END IF;
END $$;
-- Different users can reuse a key, but the same user cannot.
INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key)
VALUES ('user-b','real-b',100,'2026-10-27','deposit_unique_00001');
INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key)
VALUES ('legacy','real-c',50,'2026-10-26',NULL);
INSERT INTO contribution_test(user_id,portfolio_id,amount,contribution_date,idempotency_key)
VALUES ('legacy','real-c',75,'2026-10-26',NULL);
