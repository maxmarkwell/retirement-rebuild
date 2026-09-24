-- Retirement Rebuild
-- High-water-mark advancement is trusted server state. Ordinary authenticated
-- clients must not be able to inflate it and manufacture a false drawdown.

revoke all on function public.advance_ag_high_water_mark(uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.advance_ag_high_water_mark(uuid, numeric)
  to service_role;
