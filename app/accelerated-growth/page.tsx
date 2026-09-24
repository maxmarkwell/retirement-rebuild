import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAgOperationalState } from "@/lib/discovery/accelerated-growth/operational-state";
import { getAgDailyCycleStatus } from "@/lib/discovery/accelerated-growth/daily-cycle-status";
import AgDailyCycleControl from "@/components/ag-daily-cycle-control";

export const dynamic = "force-dynamic";

export default async function AcceleratedGrowthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [state, cycleStatus] = await Promise.all([
    getAgOperationalState(),
    getAgDailyCycleStatus(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">RETIREMENT REBUILD</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Accelerated Growth</h1>
            <p className="mt-2 text-gray-600">Research, Committee decisions, holdings and risk controls.</p>
          </div>
          <Link href="/" className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm">Dashboard</Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AG Sleeve</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">${state.valuation.currentEquity.toFixed(2)}</p>
            <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Reference Capital</span><span className="font-medium">${state.accounting.referenceTotalCapital.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Risk Sleeve</span><span className="font-medium">${state.accounting.sleeveCap.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Available Cash</span><span className="font-medium">${state.accounting.sleeveCash.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Holdings Market Value</span><span className="font-medium">${state.valuation.holdingsMarketValue.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Drawdown</span><span className="font-medium">{(state.valuation.drawdownPct * 100).toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Circuit Breaker</span><span className={state.valuation.circuitBreakerActive ? "font-semibold text-red-700" : "font-semibold text-green-700"}>{state.valuation.circuitBreakerActive ? "PAUSED" : "READY"}</span></div>
            </div>
            <AgDailyCycleControl initialStatus={cycleStatus} />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Holdings</p>
            {state.holdings.length === 0 ? <p className="mt-4 text-sm text-gray-500">No AG positions currently held.</p> : (
              <div className="mt-4 space-y-3">
                {state.holdings.map((holding) => (
                  <div key={holding.ticker} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="flex justify-between text-sm"><span className="font-semibold">{holding.ticker}</span><span className="font-medium">${holding.marketValue.toFixed(2)}</span></div>
                    <div className="mt-1 flex justify-between text-xs text-gray-500"><span>{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })} shares</span><span>@ ${holding.price.toFixed(2)}</span></div>
                    <p className="mt-1 text-xs text-gray-500">{holding.themeKey}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active Committee</p>
            {state.activeDecisions.length === 0 ? <p className="mt-4 text-sm text-gray-500">No active Committee decisions.</p> : (
              <div className="mt-4 space-y-2">
                {state.activeDecisions.map((decision) => (
                  <div key={decision.id} className="flex justify-between text-sm"><span className="font-semibold">{decision.ticker}</span><span className="uppercase text-gray-700">{decision.decision_type === "avoid" ? "REJECT" : decision.decision_type}</span></div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Research Watchlist</p>
            {state.researchWatchlist.length === 0 ? <p className="mt-4 text-sm text-gray-500">No active Deep Research watches.</p> : (
              <div className="mt-4 space-y-3">
                {state.researchWatchlist.slice(0, 5).map((watch) => (
                  <div key={watch.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="flex justify-between text-sm"><span className="font-semibold">{watch.ticker}</span><span>WATCH · {(Number(watch.confidence) * 100).toFixed(0)}%</span></div>
                    <p className="mt-2 text-xs text-gray-700">{watch.thesis}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
