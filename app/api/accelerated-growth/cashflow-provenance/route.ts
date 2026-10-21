import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Diagnostic only. Does not import evaluation/scoring or write any decisions.
const SYMBOLS = new Set(["VICR", "GOOG", "LITE", "SMCI", "PBF"]);
type Row = {
  date?: string; fiscalYear?: string; period?: string;
  revenue?: number; freeCashFlow?: number; operatingCashFlow?: number;
  capitalExpenditure?: number; capitalExpenditures?: number;
};
function finite(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
async function fetchQuarterly(path: string, symbol: string): Promise<Row[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY not configured");
  const url = new URL(`https://financialmodelingprep.com/stable/${path}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", "quarter");
  url.searchParams.set("limit", "8");
  url.searchParams.set("apikey", key);
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`FMP ${path} status ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error(`FMP ${path} returned non-array`);
  return data as Row[];
}
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "VICR").trim().toUpperCase();
  if (!SYMBOLS.has(symbol)) return NextResponse.json({ error: "Symbol outside frozen audit shortlist" }, { status: 400 });
  try {
    const [income, cash] = await Promise.all([
      fetchQuarterly("income-statement", symbol),
      fetchQuarterly("cash-flow-statement", symbol),
    ]);
    const dateCounts = new Map<string, number>();
    for (const row of cash) if (row.date) dateCounts.set(row.date, (dateCounts.get(row.date) ?? 0) + 1);
    const byDate = new Map(cash.filter(r => r.date).map(r => [r.date!, r]));
    const matched = income.map((row, index) => {
      const exact = row.date ? byDate.get(row.date) : undefined;
      const selected = exact ?? cash[index];
      const matchMethod = exact ? "EXACT_DATE" : selected ? "POSITIONAL_FALLBACK" : "MISSING";
      const vendorFcf = finite(selected?.freeCashFlow);
      const operatingCashFlow = finite(selected?.operatingCashFlow);
      const capex = finite(selected?.capitalExpenditure ?? selected?.capitalExpenditures);
      const computedFcf = operatingCashFlow != null && capex != null ? operatingCashFlow + capex : null;
      const selectedFcf = vendorFcf ?? computedFcf;
      return {
        incomeDate: row.date ?? null, incomeFiscalYear: row.fiscalYear ?? null,
        incomePeriod: row.period ?? null, revenue: finite(row.revenue),
        cashFlowDate: selected?.date ?? null, cashFlowFiscalYear: selected?.fiscalYear ?? null,
        cashFlowPeriod: selected?.period ?? null, matchMethod,
        cashDateDuplicateCount: selected?.date ? (dateCounts.get(selected.date) ?? 0) : 0,
        vendorFreeCashFlow: vendorFcf, operatingCashFlow, capitalExpenditure: capex,
        computedFreeCashFlow: computedFcf,
        selectedFreeCashFlow: selectedFcf,
        freeCashFlowSource: vendorFcf != null ? "VENDOR" : computedFcf != null ? "OPERATING_PLUS_SIGNED_CAPEX" : "MISSING",
        fallbackDateMismatch: matchMethod === "POSITIONAL_FALLBACK" && !!row.date && !!selected?.date && row.date !== selected.date,
      };
    });
    const repeatedAdjacentFcf = matched.slice(0, -1).flatMap((row, i) =>
      row.selectedFreeCashFlow != null && row.selectedFreeCashFlow === matched[i + 1].selectedFreeCashFlow
        ? [{ firstIncomeDate: row.incomeDate, secondIncomeDate: matched[i + 1].incomeDate, freeCashFlow: row.selectedFreeCashFlow }]
        : []);
    return NextResponse.json({
      mode: "READ_ONLY_AG_CASHFLOW_PROVENANCE", symbol, evaluatedAt: new Date().toISOString(),
      incomeRows: income.length, cashFlowRows: cash.length, matched,
      summary: {
        exactDateMatches: matched.filter(r => r.matchMethod === "EXACT_DATE").length,
        positionalFallbacks: matched.filter(r => r.matchMethod === "POSITIONAL_FALLBACK").length,
        missing: matched.filter(r => r.matchMethod === "MISSING").length,
        fallbackDateMismatches: matched.filter(r => r.fallbackDateMismatch).length,
        duplicateCashDates: [...dateCounts].filter(([, n]) => n > 1).map(([date, count]) => ({ date, count })),
        repeatedAdjacentFcf,
      },
      caveat: "Vendor values are live/cached, not SEC-verified. Duplicate values are flags, not proof of an error. The scoring engine is unchanged.",
      decisionsWritten: false, transactionsWritten: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Diagnostic failed" }, { status: 502 });
  }
}
