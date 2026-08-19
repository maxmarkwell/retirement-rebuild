type PerformanceSummaryProps = {
  portfolioName: string;
  latestValue: number | null;
  snapshotCount: number;
  latestGrowth: number | null;
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PerformanceSummary({
  portfolioName,
  latestValue,
  snapshotCount,
  latestGrowth,
}: PerformanceSummaryProps) {
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">
          Selected Portfolio
        </p>

        <p className="mt-2 text-xl font-semibold text-gray-900">
          {portfolioName}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">
          Latest Portfolio Value
        </p>

        <p className="mt-2 text-3xl font-bold text-gray-900">
          {latestValue != null
            ? formatCurrency(latestValue)
            : "—"}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">
          Snapshot History
        </p>

        <p className="mt-2 text-3xl font-bold text-gray-900">
          {snapshotCount}
        </p>

        <p className="mt-2 text-sm text-gray-500">
          Latest growth:{" "}
          {latestGrowth != null
            ? formatCurrency(latestGrowth)
            : "—"}
        </p>
      </div>
    </div>
  );
}