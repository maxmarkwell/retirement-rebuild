import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
 assessAgPriceImpliedFcfHurdle,
 type PriceHurdleInput,
} from "@/lib/discovery/accelerated-growth/price-implied-fcf-hurdle";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const SEC="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000072/cour-20260930.htm";
const QUOTE="https://markets.ptc.ft.markitdigital.com/data/equities/tearsheet/historical?s=COUR%3ANYQ";
/**
 * Curated research snapshot, NOT a live vendor quote or 10-Q facts fetch.
 * 10-Q numbers rounded to 0.1m as printed in the statements.
 * 253.3m common shares on Oct 29 differs from Sep 30's 258.6m and
 * quarterly weighted-average diluted counts. Neither is projected dilution.
 * Quote on Nov 6, 2026 is $3.74 as reported by FT and other sources.
 */
const COUR_SNAPSHOT:PriceHurdleInput={
 symbol:"COUR",asOf:"2026-11-06",
 quoteUsd:3.74,quoteDate:"2026-11-06",quoteEvidenceRef:QUOTE,
 shareCount:253_300_000,sharesAsOf:"2026-10-29",
 sharesEvidenceRef:SEC,
 sharesBasis:"253.3 million common shares issued and outstanding, 10-Q cover",
 balanceDate:"2026-09-30",balanceEvidenceRef:SEC,
 cashAndEquivalentsUsd:670_600_000,
 marketableSecuritiesUsd:104_900_000,
 totalLiabilitiesUsd:748_100_000,
 deferredRevenueUsd:461_700_000,
 historicalCashFromOperationsUsd:10_300_000,
 historicalSoftwareAndContentAndEquipmentPurchasesUsd:35_300_000,
 historicalStockCompensationUsd:83_000_000,
 cashFlowPeriod:"Nine months ended September 30, 2026",
 normalizedFcfVerified:false,netDebtReconciled:false,
};
export async function GET(){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({
  error:"AUTH_REQUIRED",executionEnabled:false,transactionsWritten:false,
 },{status:401,headers});
 const report=assessAgPriceImpliedFcfHurdle(COUR_SNAPSHOT);
 return NextResponse.json({
  ...report,inputs:COUR_SNAPSHOT,
  snapshotKind:"MANUALLY_CURATED_DATED_PUBLIC_EVIDENCE",
  secAnnualMarginsVerifiedOnlyThrough:"2025-12-31",
  secQuarterlyFinancialsIndependentlyXbrlReconciled:false,
  timeFramesAligned:false,
  priceSensitiveScenarioValuationPerformed:false,
  committeeDecisionsIssued:0,persisted:false,
 },{headers});
}
