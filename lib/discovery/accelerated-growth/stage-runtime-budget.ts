/**
 * AG stage runtime budget contract.
 *
 * The durable checkpoint stage must finish comfortably inside both the Vercel
 * request ceiling and its DB lease. Long multi-symbol AI loops are not safe.
 */
export const AG_ROUTE_MAX_SECONDS=300;
export const AG_STAGE_LEASE_SECONDS=360;
export const AG_STAGE_FINISH_RESERVE_SECONDS=45;
export const AG_STAGE_WORK_BUDGET_SECONDS=
 Math.min(AG_ROUTE_MAX_SECONDS,AG_STAGE_LEASE_SECONDS)-AG_STAGE_FINISH_RESERVE_SECONDS;

export function assertAgStageRuntimeContract(input:{
 routeMaxSeconds:number;leaseSeconds:number;reserveSeconds:number;
}):number{
 const {routeMaxSeconds,leaseSeconds,reserveSeconds}=input;
 if(!Number.isFinite(routeMaxSeconds)||!Number.isFinite(leaseSeconds)||
    !Number.isFinite(reserveSeconds)||routeMaxSeconds<=0||leaseSeconds<=0||
    reserveSeconds<15) throw new Error("Invalid AG runtime budget.");
 const budget=Math.min(routeMaxSeconds,leaseSeconds)-reserveSeconds;
 if(budget<60)throw new Error("AG stage work budget is too small.");
 return budget;
}

/** Current research stages may perform only one expensive symbol work item per
 * durable claim. This bounds blast radius and prevents a 5-symbol sequential
 * model loop from consuming one lease. Further splitting catalyst from deep
 * research can be considered if observed one-symbol latency still exceeds the
 * work budget.
 */
export const AG_MAX_EXPENSIVE_SYMBOLS_PER_STAGE_CLAIM=1;
