-- Retirement Rebuild
-- Harden Accelerated Growth BUY execution authorization storage.
-- RLS already has no anon/authenticated policies; revoke table privileges too
-- so the table matches the service-role-only execution boundary.

revoke all on table public.ag_execution_authorizations from anon, authenticated;
grant all on table public.ag_execution_authorizations to service_role;
