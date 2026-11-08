import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {assessAgMergerCashConversion,type CashConversionInput}
 from "@/lib/discovery/accelerated-growth/merger-cash-conversion";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const SEC_Q2="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000059/cour-20260630xshareholde.htm";
const SEC_Q3="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000068/cour-20260930xshareholde.htm";
/**
 * Curated issuer SEC-submitted quarterly shareholder letters (rounded $0.1m).
 * NOT independently reconciling XBRL against SEC 10-Q in this phase.
 * No reported historical values are forecasts or annualized.
 */
const snapshot:CashConversionInput={
 symbol:"COUR",asOf:"2026-11-07",
 quarterly:[
  {quarterEnd:"2026-06-30",cfoUsd:-19_800_000,reportedFcfUsd:-32_600_000,
   integrationCashPaymentsUsd:39_100_000,severanceCashPaymentsUsd:18_100_000,
   adjustedEbitdaUsd:42_700_000,sourceUrl:SEC_Q2},
  {quarterEnd:"2026-09-30",cfoUsd:15_500_000,reportedFcfUsd:4_600_000,
   integrationCashPaymentsUsd:6_700_000,severanceCashPaymentsUsd:21_000_000,
   adjustedEbitdaUsd:61_500_000,sourceUrl:SEC_Q3},
 ],
 sixMonthCfoUsd:-5_200_000,sixMonthFcfUsd:-29_600_000,
 nineMonthCfoUsd:10_300_000,nineMonthFcfUsd:-25_000_000,
 nineMonthSbcUsd:83_000_000,nineMonthCapexContentSoftwareUsd:35_300_000,
 nineMonthIntegrationCashPaymentsUsd:56_900_000,
 nineMonthSeveranceCashPaymentsUsd:39_100_000,
 nineMonthEvidenceUrl:SEC_Q3,
 managementAnnualNetSynergyTargetUsd:115_000_000,
 synergySourceUrl:SEC_Q3,
};
export async function GET(){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({
  error:"AUTH_REQUIRED",executionEnabled:false,transactionsWritten:false,
 },{status:401,headers:noStore});
 const result=assessAgMergerCashConversion(snapshot);
 return NextResponse.json({
  ...result,inputs:snapshot,
  sourceBasis:"CURATED_SEC_SUBMITTED_SHAREHOLDER_LETTERS",
  cashAdjustmentsAreForecasts:false,
  secXbrlQuarterlyReconciled:false,
  valuationPerformed:false,committeeDecisionsIssued:0,persisted:false,
 },{headers:noStore});
}
