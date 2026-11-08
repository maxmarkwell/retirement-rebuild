import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 assessAgConditionalScenarioGrid,type ConditionalGridInput,
} from "@/lib/discovery/accelerated-growth/cour-conditional-scenario-grid";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const sec="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000072/cour-20260930.htm";
const quote="https://stockanalysis.com/stocks/cour/history/";
/**
 * Explicit research sandbox: quote is actual Nov 6 closing data and SEC
 * values are rounded, date-correct snapshots. Every 2029 economic input
 * (FCF/multiple/excess cash/diluted shares) is UNVERIFIED.
 * Full Committee or deterministic BUY workflow is NOT invoked.
 */
const snapshot:ConditionalGridInput={
 symbol:"COUR",asOf:"2026-11-08",
 quoteDate:"2026-11-06",quoteUsd:3.74,quoteSourceUrl:quote,
 filingDate:"2026-10-29",filingSourceUrl:sec,
 currentBasicShares:253_300_000,
 currentLiquidAssetsUsd:775_500_000,
 currentDeferredRevenueUsd:461_700_000,
 currentReportedNineMonthFcfUsd:-25_000_000,
 currentNineMonthStockCompensationUsd:83_000_000,
 managementSynergyTargetAnnualUsd:115_000_000,
 horizonYears:3,
 sensitivityPricesUsd:[2.74,3.74,4.74],
 scenarios:[
  {
   id:"adverse",sustainableAnnualFcfUsdHypothesis:15_000_000,
   enterpriseToFcfMultipleHypothesis:8,
   terminalExcessNetCashUsdHypothesis:75_000_000,
   terminalDilutedSharesHypothesis:330_000_000,
   economicMechanism:"Postmerger cash conversion remains weak, high integration costs persist and dilution rises.",
   evidenceGap:"No independently verified 2029 owner FCF, excess cash, dilution, or sustainable 8x exit valuation.",
   invalidationCondition:"Recurring cash flow improves materially or expected dilution does not occur over the horizon.",
  },
  {
   id:"base",sustainableAnnualFcfUsdHypothesis:65_000_000,
   enterpriseToFcfMultipleHypothesis:12,
   terminalExcessNetCashUsdHypothesis:300_000_000,
   terminalDilutedSharesHypothesis:290_000_000,
   economicMechanism:"Integration spending normalizes gradually and modest recurring owner cash is retained.",
   evidenceGap:"The $65m cash-flow, $300m excess cash and 290m terminal diluted shares are unverified hypotheses.",
   invalidationCondition:"Owner cash conversion remains negative after integration or the business persistently consumes cash.",
  },
  {
   id:"favorable",sustainableAnnualFcfUsdHypothesis:130_000_000,
   enterpriseToFcfMultipleHypothesis:15,
   terminalExcessNetCashUsdHypothesis:450_000_000,
   terminalDilutedSharesHypothesis:270_000_000,
   economicMechanism:"Cost synergies become durable cash savings and enterprise retention stabilizes after merger.",
   evidenceGap:"Management synergy targets are not validated owner FCF and the $130m sustained level is unverified.",
   invalidationCondition:"Enterprise retention weakens or management synergies fail to convert into sustainably positive cash.",
  },
 ],
};
export async function GET(){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({
  error:"AUTH_REQUIRED",executionEnabled:false,transactionsWritten:false,
 },{status:401,headers:noStore});
 const report=assessAgConditionalScenarioGrid(snapshot);
 return NextResponse.json({
  ...report,inputs:snapshot,
  selectionMode:"FIXED_EXPLICIT_COUR_RESEARCH_CASE",
  latestKnownQuoteDate:snapshot.quoteDate,
  lastFinancialPeriod:"2026-09-30",
  sec2026IncomeCashBalanceReconciledByXbrl:false,
  valuationMethod:"ILLUSTRATIVE_TERMINAL_MULTIPLE_EXCESS_CASH_NO_INTERIM_CASHFLOW",
  committeeDecisionsIssued:0,
 },{headers:noStore});
}
