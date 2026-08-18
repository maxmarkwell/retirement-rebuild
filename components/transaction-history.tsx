type Transaction = {
  id: string;
  portfolio_id: string;
  transaction_type: string;
  ticker: string | null;
  quantity: number | string | null;
  price_per_share: number | string | null;
  gross_amount: number | string | null;
  fees: number | string | null;
  transaction_date: string;
};

type Portfolio = {
  id: string;
  name: string;
};

type TransactionHistoryProps = {
  transactions: Transaction[];
  portfolios: Portfolio[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

export default function TransactionHistory({
  transactions,
  portfolios,
}: TransactionHistoryProps) {
  const portfolioNames = new Map(
    portfolios.map((portfolio) => [
      portfolio.id,
      portfolio.name,
    ])
  );

  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      new Date(b.transaction_date).getTime() -
      new Date(a.transaction_date).getTime()
  );

  return (
    <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Transaction History
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Permanent ledger of recorded portfolio buys and sells.
        </p>
      </div>

      {sortedTransactions.length === 0 ? (
        <p className="text-sm text-gray-500">
          No transactions recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Portfolio</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Ticker</th>
                <th className="px-3 py-3 text-right">
                  Quantity
                </th>
                <th className="px-3 py-3 text-right">
                  Price
                </th>
                <th className="px-3 py-3 text-right">
                  Gross
                </th>
                <th className="px-3 py-3 text-right">
                  Fees
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {sortedTransactions.map((transaction) => {
                const quantity =
                  Number(transaction.quantity ?? 0);

                const price =
                  Number(transaction.price_per_share ?? 0);

                const gross =
                  Number(transaction.gross_amount ?? 0);

                const fees =
                  Number(transaction.fees ?? 0);

                return (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-600">
                      {new Date(
  transaction.transaction_date
).toLocaleString("en-US", {
  timeZone: "America/Denver",
  month: "numeric",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                      {portfolioNames.get(
                        transaction.portfolio_id
                      ) ?? "Unknown"}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`font-semibold uppercase ${
                          transaction.transaction_type ===
                          "buy"
                            ? "text-blue-700"
                            : transaction.transaction_type ===
                                "sell"
                              ? "text-green-700"
                              : "text-gray-700"
                        }`}
                      >
                        {transaction.transaction_type}
                      </span>
                    </td>

                    <td className="px-3 py-3 font-semibold text-gray-900">
                      {transaction.ticker ?? "—"}
                    </td>

                    <td className="px-3 py-3 text-right text-gray-700">
                      {formatQuantity(quantity)}
                    </td>

                    <td className="px-3 py-3 text-right text-gray-700">
                      {formatCurrency(price)}
                    </td>

                    <td className="px-3 py-3 text-right text-gray-700">
                      {formatCurrency(gross)}
                    </td>

                    <td className="px-3 py-3 text-right text-gray-700">
                      {formatCurrency(fees)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}