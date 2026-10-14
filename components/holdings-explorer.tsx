"use client";

import { useMemo, useState } from "react";

type Holding = {
  ticker: string;
  quantity: number;
  averageCost: number;
  marketPrice: number | null;
  marketValue: number;
  unrealizedGainLoss: number;
};
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
type Sort = "ticker" | "value" | "return";

export default function HoldingsExplorer({ holdings }: { holdings: Holding[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("ticker");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = useMemo(() => {
    const results = holdings.filter((h) => h.ticker.toLowerCase().includes(search.trim().toLowerCase()));
    return results.sort((a, b) => {
      const comparison = sort === "ticker" ? a.ticker.localeCompare(b.ticker) : sort === "value" ? a.marketValue - b.marketValue : a.unrealizedGainLoss - b.unrealizedGainLoss;
      return descending ? -comparison : comparison;
    });
  }, [holdings, search, sort, descending]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  function changeSort(value: Sort) { setSort(value); setPage(1); }
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div><h2 className="text-lg font-semibold text-slate-900">Open holdings</h2><p className="text-xs text-slate-500">{filtered.length} of {holdings.length} positions</p></div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 sm:flex sm:flex-wrap">
        <label className="sr-only" htmlFor="holding-search">Search ticker</label>
        <input id="holding-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search ticker" className="min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-44" />
        <label className="sr-only" htmlFor="holding-sort">Sort holdings</label>
        <select id="holding-sort" value={sort} onChange={(event) => changeSort(event.target.value as Sort)} className="min-w-0 max-w-32 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"><option value="ticker">Ticker</option><option value="value">Market value</option><option value="return">Unrealized P/L</option></select>
        <button type="button" onClick={() => setDescending((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" aria-label={descending ? "Sort ascending" : "Sort descending"}>{descending ? "↓" : "↑"}</button>
      </div>
    </div>
    <div className="mt-5 space-y-3 md:hidden">
      {visible.map((h) => <details key={h.ticker} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3"><span className="font-bold text-slate-900">{h.ticker}<span className="mt-1 block text-xs font-normal text-slate-500">{h.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })} shares</span></span><span className="min-w-0 text-right"><span className="block font-semibold">{h.marketPrice == null ? "Price unavailable" : money(h.marketValue)}</span><span className={`text-xs ${h.unrealizedGainLoss < 0 ? "text-red-700" : "text-emerald-700"}`}>{h.marketPrice == null ? "P/L unavailable" : money(h.unrealizedGainLoss)}</span></span></summary>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-sm [overflow-wrap:anywhere]"><div><dt className="text-slate-500">Average cost</dt><dd>{money(h.averageCost)}</dd></div><div><dt className="text-slate-500">Market price</dt><dd>{h.marketPrice == null ? "Unavailable" : money(h.marketPrice)}</dd></div></dl>
      </details>)}
    </div>
    <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Ticker", "Shares", "Avg cost", "Market price", "Value", "Unrealized"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{visible.map((h) => <tr key={h.ticker} className="border-t border-slate-100"><td className="px-3 py-4 font-bold">{h.ticker}</td><td className="px-3 py-4 tabular-nums">{h.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</td><td className="px-3 py-4">{money(h.averageCost)}</td><td className="px-3 py-4">{h.marketPrice == null ? "Unavailable" : money(h.marketPrice)}</td><td className="px-3 py-4">{h.marketPrice == null ? "—" : money(h.marketValue)}</td><td className={`px-3 py-4 ${h.unrealizedGainLoss < 0 ? "text-red-700" : "text-emerald-700"}`}>{h.marketPrice == null ? "—" : money(h.unrealizedGainLoss)}</td></tr>)}</tbody></table></div>
    {visible.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No holdings match your search.</p>}
    {totalPages > 1 && <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>}
  </section>;
}
