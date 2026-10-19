import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAgOperationalState } from "@/lib/discovery/accelerated-growth/operational-state";
import { getAgDailyCycleStatus } from "@/lib/discovery/accelerated-growth/daily-cycle-status";
import AgDailyCycleControl from "@/components/ag-daily-cycle-control";
import AgHistoricalReassessmentControl from "@/components/ag-historical-reassessment-control";

export const dynamic = "force-dynamic";

export default async function AcceleratedGrowthPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "overview" } = await searchParams;
  const currentTab = ["overview", "positions", "committee", "research"].includes(tab) ? tab : "overview";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [state, cycleStatus] = await Promise.all([
    getAgOperationalState(),
    getAgDailyCycleStatus(),
  ]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">RETIREMENT REBUILD</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Accelerated Growth</h1>
            <p className="mt-2 text-gray-600">Research, Committee decisions, holdings and risk controls.</p>
          </div>
          <Link href="/" className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm">Dashboard</Link>
        </div>

        <nav aria-label="Accelerated Growth sections" className="mb-6 grid grid-cols-2 gap-2 border-b border-slate-300 pb-3 sm:grid-cols-4">
          {(["overview", "positions", "committee", "research"] as const).map((item) => <Link key={item} href={`/accelerated-growth?tab=${item}`} aria-current={currentTab === item ? "page" : undefined} className={`min-w-0 rounded-lg px-2 py-3 text-center text-sm font-semibold capitalize sm:px-4 ${currentTab === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}>{item}</Link>)}
        </nav>
        <div className="grid min-w-0 grid-cols-1 gap-4">
          {currentTab === "overview" && <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AG Sleeve</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">${state.valuation.currentEquity.toFixed(2)}</p>
            <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span className="text-gray-500">Reference Capital</span><span className="font-medium">${state.accounting.referenceTotalCapital.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Risk Sleeve</span><span className="font-medium">${state.accounting.sleeveCap.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Available Cash</span><span className="font-medium">${state.accounting.sleeveCash.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Holdings Market Value</span><span className="font-medium">${state.valuation.holdingsMarketValue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Drawdown</span><span className="font-medium">{(state.valuation.drawdownPct * 100).toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Circuit Breaker</span><span className={state.valuation.circuitBreakerActive ? "font-semibold text-red-700" : "font-semibold text-green-700"}>{state.valuation.circuitBreakerActive ? "PAUSED" : "READY"}</span></div>
            </div>
            <AgDailyCycleControl initialStatus={cycleStatus} />
            {cycleStatus.cycle?.status === "completed" && <p className="mt-3 text-sm text-gray-600">The cycle’s persisted-decision count includes reused active decisions. Open the Committee tab to inspect current recommendations and their original record dates.</p>}
          </section>}

          {currentTab === "positions" && <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Holdings</p>
            {state.holdings.length === 0 ? <p className="mt-4 text-sm text-gray-500">No AG positions currently held.</p> : (
              <div className="mt-4 space-y-3">
                {state.holdings.map((holding) => (
                  <div key={holding.ticker} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">{holding.ticker}</span><span className="font-medium">${holding.marketValue.toFixed(2)}</span></div>
                    <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-gray-500"><span>{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })} shares</span><span>@ ${holding.price.toFixed(2)}</span></div>
                    <p className="mt-1 text-xs text-gray-500">{holding.themeKey}</p>
                  </div>
                ))}
              </div>
            )}
          </section>}

          {currentTab === "committee" && <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active Committee</p>
            <p className="mt-2 text-sm text-gray-600">Current active recommendations. An existing decision may be reused by a later research cycle without creating a new row.</p>
            {state.activeDecisions.length === 0 ? <p className="mt-4 text-sm text-gray-500">No active Committee decisions.</p> : (
              <div className="mt-4 space-y-2">
                {state.activeDecisions.map((decision) => (
                  <div key={decision.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-slate-900">{decision.ticker}</span><span className="font-medium uppercase text-gray-700">{decision.decision_type === "avoid" ? "REJECT" : decision.decision_type}</span></div><p className="mt-1 text-xs text-gray-500">Decision recorded {new Date(decision.created_at).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "short" })} MT</p>{decision.thesis && <p className="mt-2 break-words text-sm text-gray-700">{decision.thesis}</p>}<details className="mt-3 border-t border-gray-200 pt-3"><summary className="cursor-pointer font-semibold text-slate-800">View saved committee evidence</summary><div className="mt-3 space-y-3 text-sm text-gray-700">{([["Bull case", decision.bull_case], ["Bear case", decision.bear_case], ["Reassessment conditions", decision.reassessment_conditions], ["Exit conditions", decision.exit_conditions]] as const).map(([label, value]) => <div key={label}><p className="font-semibold text-slate-900">{label}</p><p className="mt-1 whitespace-pre-wrap break-words">{value || "Not recorded for this decision."}</p></div>)}<p className="text-xs text-gray-500">Saved decision evidence only. The original research dossier and valuation snapshot may not have been persisted with this record.</p></div></details></div>
                ))}
              </div>
            )}
          </section>}

          {currentTab === "research" && <AgHistoricalReassessmentControl />}
          {currentTab === "research" && <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Research Watchlist</p>
            {state.researchWatchlist.length === 0 ? <p className="mt-4 text-sm text-gray-500">No active Deep Research watches.</p> : (
              <div className="mt-4 space-y-3">
                {state.researchWatchlist.slice(0, 5).map((watch) => (
                  <div key={watch.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="flex justify-between text-sm"><span className="font-bold text-slate-900">{watch.ticker}</span><span className="font-semibold text-slate-700">WATCH · {(Number(watch.confidence) * 100).toFixed(0)}%</span></div>
                    <p className="mt-2 break-words text-xs text-gray-700">{watch.thesis}</p>
                  </div>
                ))}
              </div>
            )}
          </section>}
        </div>
      </div>
    </main>
  );
}
