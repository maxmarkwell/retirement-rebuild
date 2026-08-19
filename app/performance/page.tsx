import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildPerformanceSeries,
  type PortfolioSnapshotRecord,
} from "@/lib/portfolio/performance";
import PerformanceSummary from "@/components/performance-summary";
import PerformanceChart from "@/components/performance-chart";

type PerformancePageProps = {
  searchParams: Promise<{
    portfolio?: string;
  }>;
};

export default async function PerformancePage({
  searchParams,
}: PerformancePageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { portfolio: selectedPortfolioId } =
    await searchParams;

  const { data: portfolios, error: portfoliosError } =
    await supabase
      .from("portfolios")
      .select("id, name, type")
      .order("created_at", { ascending: true });

  if (portfoliosError) {
    throw new Error(
      `Unable to load portfolios: ${portfoliosError.message}`
    );
  }

  const selectedPortfolio =
    portfolios?.find(
      (portfolio) =>
        portfolio.id === selectedPortfolioId
    ) ??
    portfolios?.[0] ??
    null;

  const { data: snapshots, error: snapshotsError } =
    selectedPortfolio
      ? await supabase
          .from("portfolio_snapshots")
          .select(
            "portfolio_id, snapshot_date, total_value, cash_value, holdings_value, cumulative_contributions, cumulative_withdrawals, investment_growth"
          )
          .eq(
            "portfolio_id",
            selectedPortfolio.id
          )
          .order(
            "snapshot_date",
            { ascending: true }
          )
      : {
          data: [],
          error: null,
        };

  if (snapshotsError) {
    throw new Error(
      `Unable to load performance history: ${snapshotsError.message}`
    );
  }

  const performanceSeries =
    buildPerformanceSeries(
      (snapshots ?? []) as PortfolioSnapshotRecord[]
    );

  const latestPoint =
    performanceSeries.length > 0
      ? performanceSeries[
          performanceSeries.length - 1
        ]
      : null;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Performance
          </h1>

          <p className="mt-2 text-gray-600">
            Track portfolio growth and measure results against the benchmark.
          </p>
        </div>

        <div className="mt-8">
          <form>
            <label
              htmlFor="portfolio"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Portfolio
            </label>

            <select
              id="portfolio"
              name="portfolio"
              defaultValue={
                selectedPortfolio?.id ?? ""
              }
              className="w-full max-w-sm rounded border border-gray-300 bg-white px-3 py-2"
            >
              {portfolios?.map(
                (portfolio) => (
                  <option
                    key={portfolio.id}
                    value={portfolio.id}
                  >
                    {portfolio.name}
                  </option>
                )
              )}
            </select>

            <button
              type="submit"
              className="ml-3 rounded bg-black px-4 py-2 text-white"
            >
              View
            </button>
          </form>
        </div>

        <PerformanceSummary
          portfolioName={
            selectedPortfolio?.name ??
            "No portfolio"
          }
          latestValue={
            latestPoint?.totalValue ?? null
          }
          snapshotCount={
            performanceSeries.length
          }
          latestGrowth={
            latestPoint?.investmentGrowth ??
            null
          }
        />

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Portfolio Value Over Time
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Daily portfolio snapshots will populate this chart.
          </p>

<div className="mt-6">
  <PerformanceChart
    data={performanceSeries.map((point) => ({
      date: point.date,
      totalValue: point.totalValue,
    }))}
  />
</div>          
        </div>
      </div>
    </main>
  );
}