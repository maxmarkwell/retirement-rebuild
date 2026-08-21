import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CommitteeRunForm from "@/components/committee-run-form";

type ResearchPageProps = {
  searchParams: Promise<{
    ticker?: string;
    mode?: string;
  }>;
};

export default async function ResearchPage({
  searchParams,
}: ResearchPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    ticker: requestedTicker,
    mode: requestedMode,
  } = await searchParams;

  const defaultTicker =
    requestedTicker
      ?.trim()
      .toUpperCase() ?? "";

  const { data: portfolios, error: portfoliosError } =
    await supabase
      .from("portfolios")
      .select("id, name, type")
      .in("type", [
        "paper_active",
        "paper_long_term",
      ])
      .order("created_at", { ascending: true });

  if (portfoliosError) {
    throw new Error(
      `Unable to load research portfolios: ${portfoliosError.message}`
    );
  }

  const defaultPortfolio =
    portfolios?.find(
      (portfolio) =>
        portfolio.type === requestedMode
    ) ?? null;

  const { data: runs, error: runsError } =
    await supabase
      .from("ai_committee_runs")
      .select(
        "id, decision_id, portfolio_id, ticker, run_date, market_price, status, final_recommendation, final_confidence, final_risk_level"
      )
      .order("run_date", { ascending: false });

  if (runsError) {
    throw new Error(
      `Unable to load committee runs: ${runsError.message}`
    );
  }

  const portfolioNames = new Map(
    (portfolios ?? []).map((portfolio) => [
      portfolio.id,
      portfolio.name,
    ])
  );

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Research
          </h1>

          <p className="mt-2 text-gray-600">
            Run the AI Investment Committee and preserve its analysis.
          </p>
        </div>

        <div className="mt-8">
          <CommitteeRunForm
            portfolios={portfolios ?? []}
            defaultTicker={defaultTicker}
            defaultPortfolioId={
              defaultPortfolio?.id ?? ""
            }
          />
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Committee Runs
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Research runs awaiting or containing committee analysis.
            </p>
          </div>

          {runs?.length ? (
            <div className="divide-y divide-gray-100">
              {runs.map((run) => {
                const content = (
                  <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-lg font-bold text-gray-900">
                          {run.ticker}
                        </span>

                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                            run.status === "completed"
                              ? "bg-green-50 text-green-700"
                              : run.status === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {run.status}
                        </span>

                        {run.final_recommendation && (
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                              run.final_recommendation === "buy"
                                ? "bg-green-50 text-green-700"
                                : run.final_recommendation === "sell"
                                  ? "bg-red-50 text-red-700"
                                  : run.final_recommendation === "hold"
                                    ? "bg-blue-50 text-blue-700"
                                    : run.final_recommendation === "watch"
                                      ? "bg-yellow-50 text-yellow-700"
                                      : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {run.final_recommendation}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-gray-500">
                        {portfolioNames.get(
                          run.portfolio_id
                        ) ?? "Unknown Portfolio"}
                      </p>

                      {run.status === "completed" && (
                        <div className="mt-4 grid gap-4 sm:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Confidence
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {run.final_confidence != null
                                ? `${Number(
                                    run.final_confidence
                                  ).toFixed(0)}/100`
                                : "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Risk
                            </p>

                            <p className="mt-1 font-medium capitalize text-gray-900">
                              {run.final_risk_level ?? "—"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Reference Price
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {run.market_price != null
                                ? `$${Number(
                                    run.market_price
                                  ).toFixed(2)}`
                                : "—"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-left text-sm text-gray-600 lg:text-right">
                      <p>
                        {run.market_price != null
                          ? `$${Number(
                              run.market_price
                            ).toFixed(2)}`
                          : "Price unavailable"}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(
                          run.run_date
                        ).toLocaleString("en-US", {
                          timeZone: "America/Denver",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>

                      {run.decision_id && (
                        <p className="mt-3 text-xs font-medium text-gray-900">
                          View Decision →
                        </p>
                      )}
                    </div>
                  </div>
                );

                return run.decision_id ? (
                  <Link
                    key={run.id}
                    href={`/decisions/${run.decision_id}`}
                    className="block p-6 transition hover:bg-gray-50"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={run.id}
                    className="p-6"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-gray-500">
                No committee runs recorded yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}