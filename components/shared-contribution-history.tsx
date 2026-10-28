type Entry = {
  id: string;
  amount: number;
  contribution_date: string;
  external_deposit_reference: string | null;
  idempotency_key: string | null;
};
type Props = { entries: Entry[]; currentCash: number | null; historyAvailable: boolean };

export default function SharedContributionHistory({entries,currentCash,historyAvailable}: Props) {
  const totalCents=entries.reduce((sum,e)=>sum+Math.round(Number(e.amount)*100),0);
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Real contribution history">
      <h2 className="text-lg font-semibold text-slate-900">Real portfolio contribution ledger</h2>
      <p className="mt-1 text-sm text-slate-600">
        Entries recorded in Retirement Rebuild only. A ledger entry is not independent confirmation that cash settled at E*TRADE.
        Compare each deposit with the brokerage activity statement before relying on available cash.
      </p>
      {!historyAvailable ? (
        <p role="alert" className="mt-3 text-sm font-medium text-amber-900">Contribution history unavailable. Do not use the displayed cash balance for reconciliation until the ledger can be checked.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <p>Recorded entries: <strong>{entries.length}</strong></p>
            <p>Recorded deposits: <strong>${(totalCents/100).toFixed(2)}</strong></p>
            <p>Current calculated ledger cash: <strong>{currentCash==null?"Unavailable":`$${currentCash.toFixed(2)}`}</strong></p>
          </div>
          {entries.length===0 ? (
            <p className="mt-4 text-sm text-slate-600">No real portfolio contributions have been recorded. Starting capital is accounted for separately.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-slate-600"><th className="p-2">Settlement date</th><th className="p-2">Amount</th><th className="p-2">Brokerage reference</th><th className="p-2">Ledger status</th></tr></thead>
                <tbody>{entries.map(e=><tr key={e.id} className="border-b border-slate-100">
                  <td className="p-2">{e.contribution_date}</td>
                  <td className="p-2">${Number(e.amount).toFixed(2)}</td>
                  <td className="p-2 break-all">{e.external_deposit_reference??"Legacy entry — no reference"}</td>
                  <td className="p-2">Recorded; external settlement not independently verified</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Cash is derived from starting capital, real contributions, and real transactions—not the sum of deposits alone. AG paper activity is excluded.</p>
        </>
      )}
    </section>
  );
}
