-- AG drawdown is defined against the dedicated 20% risk sleeve.
-- Existing HWM was initialized from total reference capital before this
-- definition was finalized; normalize untouched AG eras to sleeve capital.
update public.portfolio_strategy_eras
   set high_water_mark = round(reference_total_capital * 0.20, 2),
       updated_at = now()
 where strategy_key = 'accelerated_growth'
   and ended_at is null
   and high_water_mark = round(reference_total_capital, 2);
