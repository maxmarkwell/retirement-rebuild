import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CommitteeRunForm from "@/components/committee-run-form";

type ResearchPageProps = {
  searchParams: Promise<{
    ticker?: string;
    mode?: string;
    reassessment?: string;
  }>;
};

function formatScore(
  value: number | string | null
) {
  if (value == null) {
    return "—";
  }

  return Number(value).toFixed(2);
}

function formatBucket(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

export default async function ResearchPage({
  searchParams,
}: ResearchPageProps) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    ticker: requestedTicker,
    mode: requestedMode,
      reassessment:
    reassessmentId,
  } =
    await searchParams;

  const defaultTicker =
    requestedTicker
      ?.trim()
      .toUpperCase() ??
    "";

  const { data: portfolios, error: portfoliosError } =
    await supabase
      .from("portfolios")
      .select(
        "id, name, type"
      )
      .in(
        "type",
        [
          "paper_active",
          "paper_long_term",
          "real",
        ]
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (portfoliosError) {
    throw new Error(
      `Unable to load research portfolios: ${portfoliosError.message}`
    );
  }

  const defaultPortfolio =
    portfolios?.find(
      (portfolio) =>
        portfolio.type ===
        requestedMode
    ) ??
    null;

  // ---------------------------------------------------------
  // Load latest Discovery V2 context
  // ---------------------------------------------------------

  let discoveryCandidate:
    {
      id: string;
      ticker: string;
      portfolio_type: string;

      quality_score:
        number | string | null;

      growth_score:
        number | string | null;

      valuation_score:
        number | string | null;

      trend_quality_score:
        number | string | null;

      capital_discipline_score:
        number | string | null;

      deep_score:
        number | string | null;

      portfolio_fit_score:
        number | string | null;

      total_score:
        number | string | null;

      selector_score:
        number | string | null;

      market_cap_bucket:
        string | null;

      sector:
        string | null;

      industry:
        string | null;

      scoring_version:
        string | null;

      reason_summary:
        string | null;

      discovery_date:
        string;
    } |
    null = null;

  if (
    defaultTicker &&
    requestedMode
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "stock_discovery_candidates"
        )
        .select(
          `
          id,
          ticker,
          portfolio_type,

          quality_score,
          growth_score,
          valuation_score,

          trend_quality_score,
          capital_discipline_score,

          deep_score,
          portfolio_fit_score,
          total_score,
          selector_score,

          market_cap_bucket,
          sector,
          industry,

          scoring_version,
          reason_summary,
          discovery_date
          `
        )
        .eq(
          "ticker",
          defaultTicker
        )
        .eq(
          "portfolio_type",
          requestedMode
        )
        .order(
          "discovery_date",
          {
            ascending:
              false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to load discovery context: ${error.message}`
      );
    }

    discoveryCandidate =
      data;
  }

  const {
    data: runs,
    error: runsError,
  } =
    await supabase
      .from(
        "ai_committee_runs"
      )
      .select(
        "id, decision_id, portfolio_id, ticker, run_date, market_price, status, final_recommendation, final_confidence, final_risk_level"
      )
      .order(
        "run_date",
        {
          ascending:
            false,
        }
      );

  if (runsError) {
    throw new Error(
      `Unable to load committee runs: ${runsError.message}`
    );
  }

  const portfolioNames =
    new Map(
      (
        portfolios ??
        []
      ).map(
        (portfolio) => [
          portfolio.id,
          portfolio.name,
        ]
      )
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

        {discoveryCandidate &&
          discoveryCandidate.scoring_version ===
            "v2" && (
            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl font-bold text-gray-900">
                      {
                        discoveryCandidate.ticker
                      }
                    </span>

                    <span className="rounded bg-gray-900 px-2 py-1 text-xs font-semibold uppercase text-white">
                      Discovery V2
                    </span>

                    {discoveryCandidate.market_cap_bucket && (
                      <span className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600">
                        {formatBucket(
                          discoveryCandidate.market_cap_bucket
                        )}{" "}
                        Cap
                      </span>
                    )}

                    {discoveryCandidate.sector && (
                      <span className="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600">
                        {
                          discoveryCandidate.sector
                        }
                      </span>
                    )}
                  </div>

                  {discoveryCandidate.industry && (
                    <p className="mt-2 text-sm text-gray-500">
                      {
                        discoveryCandidate.industry
                      }
                    </p>
                  )}

                  {discoveryCandidate.reason_summary && (
                    <p className="mt-4 max-w-4xl text-sm text-gray-600">
                      {
                        discoveryCandidate.reason_summary
                      }
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Discovery Score
                  </p>

                  <p className="mt-1 text-3xl font-bold text-gray-900">
                    {formatScore(
                      discoveryCandidate.total_score
                    )}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    Deep score{" "}
                    {formatScore(
                      discoveryCandidate.deep_score
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Quality
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {formatScore(
                      discoveryCandidate.quality_score
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Growth
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {formatScore(
                      discoveryCandidate.growth_score
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Valuation
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {formatScore(
                      discoveryCandidate.valuation_score
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Trend Quality
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {formatScore(
                      discoveryCandidate.trend_quality_score
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Capital Discipline
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {formatScore(
                      discoveryCandidate.capital_discipline_score
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase text-gray-500">
                    Portfolio Fit
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {formatScore(
                      discoveryCandidate.portfolio_fit_score
                    )}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-xs text-gray-500">
                Discovery date:{" "}
                {
                  discoveryCandidate.discovery_date
                }{" "}
                · Selector score:{" "}
                {formatScore(
                  discoveryCandidate.selector_score
                )}
              </p>
            </div>
          )}

        <div className="mt-8">
          <CommitteeRunForm
            portfolios={
              portfolios ??
              []
            }
            defaultTicker={
              defaultTicker
            }
            defaultPortfolioId={
              defaultPortfolio
                ?.id ??
              ""
            }
            reassessmentId={
              reassessmentId ??
              ""
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
              {runs.map(
                (run) => {
                  const content = (
                    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">
                            {
                              run.ticker
                            }
                          </span>

                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                              run.status ===
                              "completed"
                                ? "bg-green-50 text-green-700"
                                : run.status ===
                                    "failed"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {
                              run.status
                            }
                          </span>

                          {run.final_recommendation && (
                            <span
                              className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                                run.final_recommendation ===
                                "buy"
                                  ? "bg-green-50 text-green-700"
                                  : run.final_recommendation ===
                                      "sell"
                                    ? "bg-red-50 text-red-700"
                                    : run.final_recommendation ===
                                        "hold"
                                      ? "bg-blue-50 text-blue-700"
                                      : run.final_recommendation ===
                                          "watch"
                                        ? "bg-yellow-50 text-yellow-700"
                                        : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {
                                run.final_recommendation
                              }
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-gray-500">
                          {portfolioNames.get(
                            run.portfolio_id
                          ) ??
                            "Unknown Portfolio"}
                        </p>

                        {run.status ===
                          "completed" && (
                          <div className="mt-4 grid gap-4 sm:grid-cols-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Confidence
                              </p>

                              <p className="mt-1 font-medium text-gray-900">
                                {run.final_confidence !=
                                null
                                  ? `${Number(
                                      run.final_confidence
                                    ).toFixed(
                                      0
                                    )}/100`
                                  : "—"}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Risk
                              </p>

                              <p className="mt-1 font-medium capitalize text-gray-900">
                                {
                                  run.final_risk_level ??
                                  "—"
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Reference Price
                              </p>

                              <p className="mt-1 font-medium text-gray-900">
                                {run.market_price !=
                                null
                                  ? `$${Number(
                                      run.market_price
                                    ).toFixed(
                                      2
                                    )}`
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-left text-sm text-gray-600 lg:text-right">
                        <p>
                          {run.market_price !=
                          null
                            ? `$${Number(
                                run.market_price
                              ).toFixed(
                                2
                              )}`
                            : "Price unavailable"}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(
                            run.run_date
                          ).toLocaleString(
                            "en-US",
                            {
                              timeZone:
                                "America/Denver",

                              year:
                                "numeric",

                              month:
                                "short",

                              day:
                                "numeric",

                              hour:
                                "numeric",

                              minute:
                                "2-digit",
                            }
                          )}
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
                      key={
                        run.id
                      }
                      href={`/decisions/${run.decision_id}`}
                      className="block p-6 transition hover:bg-gray-50"
                    >
                      {
                        content
                      }
                    </Link>
                  ) : (
                    <div
                      key={
                        run.id
                      }
                      className="p-6"
                    >
                      {
                        content
                      }
                    </div>
                  );
                }
              )}
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