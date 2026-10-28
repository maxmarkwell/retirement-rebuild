"use client";

import { useState } from "react";

type Props = { currentSharedCash: number | null; postingUiEnabled: boolean };

export default function SharedContributionPreview({ currentSharedCash, postingUiEnabled }: Props) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");
  const edit = () => { setReviewOpen(false); setReviewAcknowledged(false); setRequestKey(null); setResult(""); };
  const parsed = Number(amount);
  const wholeCents = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0 &&
    Math.abs(parsed * 100 - Math.round(parsed * 100)) < 1e-8;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date + "T00:00:00Z")) &&
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date;
  const validReference = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(reference);
  const ready = wholeCents && validDate && validReference && confirmed;
  async function recordReviewedDeposit() {
    if (!postingUiEnabled || !ready || !reviewOpen || !reviewAcknowledged || submitting || !requestKey) return;
    setSubmitting(true);
    setResult("");
    try {
      const response = await fetch("/api/shared-capital/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          confirmedExternalDeposit: true,
          amount: Math.round(parsed * 100) / 100,
          contributionDate: date,
          externalDepositReference: reference,
          idempotencyKey: requestKey,
        }),
      });
      const data: { status?: string; error?: string; contributionId?: string } = await response.json();
      if (response.ok && (data.status === "recorded" || data.status === "already_recorded") && data.contributionId) {
        setResult(`Contribution ${data.status === "recorded" ? "recorded" : "already recorded"} (ID: ${data.contributionId}). Refresh the dashboard and reconcile against E*TRADE.`);
        setReviewAcknowledged(false);
        setReviewOpen(false);
        setRequestKey(null);
      } else {
        setResult(`Not recorded or not confirmed: ${data.error ?? "Unexpected server response"}. Check the contribution ledger before trying again.`);
      }
    } catch {
      setResult("Unable to confirm the server outcome. Check the contribution ledger before retrying; the same request key remains reserved.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div>
        <h3 className="font-semibold text-amber-950">Shared cash contribution preview</h3>
        <p className="mt-1 text-sm text-amber-900">
          {postingUiEnabled ? "Recording is available only after final review. This does not transfer brokerage funds." : "Planning only. This preview cannot submit a contribution, update balances, or transfer brokerage funds."}
          Enter only deposits already settled at your brokerage.
        </p>
      </div>
      <p className="text-sm text-slate-800">
        Current ledger cash: <strong>{currentSharedCash == null ? "Unavailable" : `$${currentSharedCash.toFixed(2)}`}</strong>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-800">
          Settled deposit amount ($)
          <input type="number" min="0.01" step="0.01" value={amount}
            onChange={(e) => { setAmount(e.target.value); edit(); }}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2" placeholder="25.00" />
        </label>
        <label className="text-sm font-medium text-slate-800">
          Settlement date
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); edit(); }}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-800 sm:col-span-2">
          Brokerage transaction reference
          <input type="text" value={reference} onChange={(e) => { setReference(e.target.value); edit(); }}
            maxLength={128} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2"
            placeholder="Reference copied from settled brokerage activity" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-800">
        <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); edit(); }}
          className="mt-1" />
        I have independently verified this deposit is settled in the brokerage account.
      </label>
      {ready ? (
        <p role="status" className="text-sm font-semibold text-slate-900">
          Preview ready: +${parsed.toFixed(2)}. Estimated shared ledger cash after a future verified entry:
          {" "}{currentSharedCash == null ? "unavailable" : `$${(currentSharedCash + parsed).toFixed(2)}`}.
          No entry has been saved.
        </p>
      ) : (
        <p role="status" className="text-sm text-amber-900">
          Complete a positive whole-cent amount, valid date, brokerage reference (8–128 characters),
          and settlement confirmation to preview.
        </p>
      )}
      <button type="button" disabled={!ready} onClick={() => { setReviewOpen(true); setReviewAcknowledged(false); setRequestKey(crypto.randomUUID().replace(/-/g, "")); }} className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-700">
        Review proposed deposit
      </button>
      {reviewOpen && ready && (
        <div className="rounded-lg border border-slate-300 bg-white p-4 space-y-3" role="region" aria-label="Contribution confirmation review">
          <h4 className="font-semibold text-slate-900">Review before any future recording</h4>
          <dl className="grid grid-cols-2 gap-2 text-sm text-slate-800">
            <dt>Amount</dt><dd className="font-semibold">${parsed.toFixed(2)}</dd>
            <dt>Settlement date</dt><dd>{date}</dd>
            <dt>Brokerage reference</dt><dd className="break-all">{reference}</dd>
            <dt>Cash after proposed entry</dt><dd>{currentSharedCash == null ? "Unavailable" : `${(currentSharedCash + parsed).toFixed(2)}`}</dd>
          </dl>
          <p className="text-sm text-amber-900">The brokerage statement remains the source of truth. This interface cannot independently verify that the deposit settled.</p>
          <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" checked={reviewAcknowledged} onChange={(e) => setReviewAcknowledged(e.target.checked)} className="mt-1" />I checked the amount, settlement date, and transaction reference against my brokerage statement.</label>
          <p role="status" className="text-sm font-medium text-slate-800">{reviewAcknowledged ? "Review completed locally. No record was written." : "Review the statement details before acknowledging."}</p>
        </div>
      )}
      {postingUiEnabled ? (
        <button type="button" disabled={!ready || !reviewOpen || !reviewAcknowledged || !requestKey || submitting}
          onClick={recordReviewedDeposit}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-700">
          {submitting ? "Recording..." : "Record confirmed deposit"}
        </button>
      ) : (
        <button type="button" disabled className="rounded bg-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Posting locked — review only
        </button>
      )}
      {result && <p role="status" className="text-sm font-medium text-slate-900">{result}</p>}
    </div>
  );
}
