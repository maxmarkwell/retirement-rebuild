-- Retirement Rebuild
-- Persist authoritative Accelerated Growth sleeve high-water marks by strategy era.
-- HWM is strategy-era state, not legacy paper_active portfolio history.

alter table public.portfolio_strategy_eras
  add column if not exists high_water_mark numeric(14,2);

update public.portfolio_strategy_eras
   set high_water_mark = reference_total_capital
 where strategy_key = 'accelerated_growth'
   and high_water_mark is null;

alter table public.portfolio_strategy_eras
  add constraint portfolio_strategy_eras_high_water_mark_nonnegative
  check (high_water_mark is null or high_water_mark >= 0);

create or replace function public.advance_ag_high_water_mark(
  p_era_id uuid,
  p_current_equity numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hwm numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_current_equity is null or p_current_equity < 0 then
    raise exception 'Current AG equity must be nonnegative';
  end if;

  update public.portfolio_strategy_eras
     set high_water_mark = greatest(
       coalesce(high_water_mark, reference_total_capital),
       round(p_current_equity, 2)
     ),
         updated_at = now()
   where id = p_era_id
     and user_id = v_user_id
     and strategy_key = 'accelerated_growth'
     and ended_at is null
  returning high_water_mark into v_hwm;

  if not found then
    raise exception 'Open Accelerated Growth era not found';
  end if;

  return v_hwm;
end;
$$;

revoke all on function public.advance_ag_high_water_mark(uuid, numeric) from public;
grant execute on function public.advance_ag_high_water_mark(uuid, numeric) to authenticated;
