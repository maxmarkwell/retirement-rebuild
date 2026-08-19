type ScoreboardRow = {
  name: string;
  currentValue: number;
  returnPct: number;
  excessReturnPct: number | null;
};

type ExperimentScoreboardProps = {
  rows: ScoreboardRow[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  const prefix =
    value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}

export default function ExperimentScoreboard({
  rows,
}: ExperimentScoreboardProps) {
  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Phase 1 Experiment Scoreboard
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Compare the AI portfolios against the passive VOO benchmark.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">
                Portfolio
              </th>

              <th className="px-6 py-3 text-right">
                Current Value
              </th>

              <th className="px-6 py-3 text-right">
                Return
              </th>

              <th className="px-6 py-3 text-right">
                vs VOO
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="px-6 py-4 font-medium text-gray-900">
                  {row.name}
                </td>

                <td className="px-6 py-4 text-right text-gray-700">
                  {formatCurrency(row.currentValue)}
                </td>

                <td
                  className={`px-6 py-4 text-right font-medium ${
                    row.returnPct > 0
                      ? "text-green-700"
                      : row.returnPct < 0
                        ? "text-red-700"
                        : "text-gray-900"
                  }`}
                >
                  {formatPercent(row.returnPct)}
                </td>

                <td
                  className={`px-6 py-4 text-right font-medium ${
                    row.excessReturnPct == null
                      ? "text-gray-500"
                      : row.excessReturnPct > 0
                        ? "text-green-700"
                        : row.excessReturnPct < 0
                          ? "text-red-700"
                          : "text-gray-900"
                  }`}
                >
                  {row.excessReturnPct == null
                    ? "—"
                    : formatPercent(row.excessReturnPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}