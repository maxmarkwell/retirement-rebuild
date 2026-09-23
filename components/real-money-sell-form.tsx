"use client";

import { useActionState, useEffect, useState } from "react";
import { recordRealMoneySell } from "@/app/real-money-execution-actions";
import { initialActionState, type ActionState } from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type Props = {
  decisionId: string;
  ticker: string;
  recommendedQuantity: number | string | null;
  status: string;
  hasTransaction: boolean;
};

export default function RealMoneySellForm({ decisionId, ticker, recommendedQuantity, status, hasTransaction }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordRealMoneySell, initialActionState);
  const [sharesOwned, setSharesOwned] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/decisions/${decisionId}/holding`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled && typeof payload?.quantity === "number" && Number.isFinite(payload.quantity)) {
          setSharesOwned(Math.max(0, payload.quantity));
        }
      })
      .catch((error) => console.error(`Unable to load ${ticker} position:`, error));
    return () => { cancelled = true; };
  }, [decisionId, ticker]);

  const recommended = recommendedQuantity != null ? Number(recommendedQuantity) : null;
  const suggestedQuantity = recommended != null && Number.isFinite(recommended) && recommended > 0
    ? (sharesOwned != null ? Math.min(recommended, sharesOwned) : recommended)
    : sharesOwned;
  const alreadyExecuted = hasTransaction || status === "executed";

  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Real Money</span>
        <h2 className="text-lg font-semibold text-gray-900">Record Brokerage Sale Fill</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-700">
        Place the SELL order with your brokerage first. After it fills, record the actual quantity, fill price, fees, and execution time. Retirement Rebuild does not place the brokerage order.
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800">
        <p>Current shares: <span className="font-semibold">{sharesOwned == null ? "Loading…" : sharesOwned.toLocaleString("en-US", { maximumFractionDigits: 8 })}</span></p>
        {suggestedQuantity != null && Number.isFinite(suggestedQuantity) && suggestedQuantity > 0 && (
          <p className="mt-1">Decision-linked sale quantity: <span className="font-semibold">{suggestedQuantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}</span></p>
        )}
        <p className="mt-2 text-xs text-gray-500">FIFO cost basis and realized gain/loss are calculated from the Retirement Rebuild transaction ledger when the fill is recorded.</p>
      </div>

      <div className="mt-4"><FormMessage state={state} /></div>

      {alreadyExecuted ? (
        <p className="mt-5 text-sm font-medium text-gray-600">This decision has already been executed.</p>
      ) : (
        <form action={formAction} className="mt-5 space-y-5">
          <input type="hidden" name="decision_id" value={decisionId} />
          <div>
            <label htmlFor="sell_quantity" className="block text-sm font-medium text-gray-700">Actual shares sold</label>
            <input id="sell_quantity" name="quantity" type="number" inputMode="decimal" step="any" min="0" required defaultValue={suggestedQuantity ?? undefined} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
          </div>
          <div>
            <label htmlFor="sell_price" className="block text-sm font-medium text-gray-700">Actual fill price per share</label>
            <input id="sell_price" name="price_per_share" type="number" inputMode="decimal" step="0.0001" min="0" required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
          </div>
          <div>
            <label htmlFor="sell_fees" className="block text-sm font-medium text-gray-700">Fees</label>
            <input id="sell_fees" name="fees" type="number" inputMode="decimal" step="0.01" min="0" defaultValue="0" className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
          </div>
          <div>
            <label htmlFor="sell_date" className="block text-sm font-medium text-gray-700">Brokerage execution date and time</label>
            <input id="sell_date" name="transaction_date" type="datetime-local" required className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">Confirm before recording</p>
            <p className="mt-1 text-sm leading-6 text-red-800">Submit only after the brokerage SELL has actually filled. These values should match the brokerage confirmation.</p>
          </div>
          <button type="submit" disabled={pending || sharesOwned === 0} className="rounded bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Recording…" : `Record Actual ${ticker} Sale`}
          </button>
        </form>
      )}
    </div>
  );
}
