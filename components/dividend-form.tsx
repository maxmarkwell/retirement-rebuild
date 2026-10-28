"use client";
import { useActionState } from "react";
import { addDividend } from "@/app/actions";
import { initialActionState } from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type PortfolioOption={id:string;label:string};
export default function DividendForm({portfolios}:{portfolios:PortfolioOption[]}) {
  const [state,action,pending]=useActionState(addDividend,initialActionState);
  return <div className="space-y-4">
    <h3 className="text-lg font-semibold text-slate-900">Record Dividend</h3>
    <p className="text-sm text-slate-600">Record cash already received. This does not contact your brokerage or place a trade.</p>
    <FormMessage state={state}/>
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium text-slate-800 sm:col-span-2">Portfolio
        <select name="portfolio_id" required defaultValue="" className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2">
          <option value="" disabled>Select portfolio</option>
          {portfolios.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-800">Stock Symbol
        <input name="ticker" required maxLength={12} autoCapitalize="characters" placeholder="INTU" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 uppercase"/>
      </label>
      <label className="block text-sm font-medium text-slate-800">Dividend Amount ($)
        <input name="amount" required type="number" min="0.01" step="0.01" placeholder="0.02" className="mt-1 w-full rounded border border-slate-300 px-3 py-2"/>
      </label>
      <label className="block text-sm font-medium text-slate-800 sm:col-span-2">Payment Date
        <input name="payment_date" required type="date" className="mt-1 w-full rounded border border-slate-300 px-3 py-2"/>
      </label>
      <p className="sm:col-span-2 text-xs text-slate-600">Check the amount and payment date against your brokerage notification. A dividend credits portfolio cash; it is not a contribution.</p>
      <button disabled={pending || portfolios.length===0} className="rounded bg-cyan-800 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2">{pending?"Recording...":"Record Dividend"}</button>
    </form>
  </div>;
}
