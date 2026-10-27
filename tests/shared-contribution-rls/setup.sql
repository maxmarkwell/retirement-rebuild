\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. Model the auth.uid() ownership predicate
-- without connecting to Supabase production.
CREATE ROLE contribution_app NOLOGIN;
CREATE TABLE contribution_rls_test (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id text NOT NULL,
 portfolio_id text NOT NULL,
 amount numeric NOT NULL CHECK (amount > 0),
 contribution_date date NOT NULL,
 idempotency_key text,
 CONSTRAINT contribution_rls_key_format CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$')
);
CREATE UNIQUE INDEX contribution_rls_user_key_unique ON contribution_rls_test(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE contribution_rls_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_rls_test FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON contribution_rls_test TO contribution_app;
GRANT USAGE, SELECT ON SEQUENCE contribution_rls_test_id_seq TO contribution_app;
CREATE POLICY own_contributions ON contribution_rls_test
  FOR ALL TO contribution_app
  USING (user_id = current_setting('app.test_user_id', true))
  WITH CHECK (user_id = current_setting('app.test_user_id', true));
BEGIN;
SET LOCAL ROLE contribution_app;
SELECT set_config('app.test_user_id','user-a',true);
INSERT INTO contribution_rls_test(user_id,portfolio_id,amount,contribution_date,idempotency_key)
 VALUES ('user-a','real-a',100,'2026-10-27','rls_key_user_a_0001');
DO $$
BEGIN
 IF (SELECT count(*) FROM contribution_rls_test) <> 1 THEN RAISE EXCEPTION 'Owner cannot read own contribution'; END IF;
END $$;
COMMIT;
-- Other user's records should not be visible.
BEGIN;
SET LOCAL ROLE contribution_app;
SELECT set_config('app.test_user_id','user-b',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM contribution_rls_test) <> 0 THEN RAISE EXCEPTION 'RLS leaked another user''s contribution'; END IF;
END $$;
COMMIT;
