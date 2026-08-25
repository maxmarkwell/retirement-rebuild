import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DiscoveryRunForm from "@/components/discovery-run-form";

type DiscoveryPageProps = {
  searchParams: Promise<{
    mode?: string;
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
    return null;
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

export default async function DiscoveryPage({
  searchParams,
}: DiscoveryPageProps) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { mode } =
    await searchParams;

  const selectedMode =
    mode === "paper_active"
      ? "paper_active"
      : "paper_long_term";

  const discoveryDate =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Denver",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    ).format(
      new Date()
    );

  const {
    data: candidates,
    error: candidatesError,
  } =
    await supabase
      .from(
        "stock_discovery_candidates"
      )
      .select(
        `
        id,
        portfolio_type,
        ticker,
        discovery_date,

        quality_score,
        growth_score,
        valuation_score,

        earnings_score,
        risk_score,

        trend_quality_score,
        capital_discipline_score,
        deep_score,
        selector_score,

        portfolio_fit_score,
        total_score,

        market_cap_bucket,
        sector,
        industry,
        scoring_version,

        reason_summary,
        status
        `
      )
      .eq(
        "portfolio_type",
        selectedMode
      )
      .eq(
        "discovery_date",
        discoveryDate
      )
      .order(
        "total_score",
        {
          ascending: false,
        }
      );

  if (candidatesError) {
    throw new Error(
      `Unable to load discovery candidates: ${candidatesError.message}`
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Stock Discovery
          </h1>

          <p className="mt-2 text-gray-600">
            Screen the investable universe before spending AI research dollars.
          </p>
        </div>

        <div className="mt-8">
          <DiscoveryRunForm />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/discovery?mode=paper_long_term"
            className={`rounded px-4 py-2 text-sm font-medium ${
              selectedMode ===
              "paper_long_term"
                ? "bg-black text-white"
                : "border border-gray-300 bg-white text-gray-700"
            }`}
          >
            AI Long-Term
          </Link>

          <Link
            href="/discovery?mode=paper_active"
            className={`rounded px-4 py-2 text-sm font-medium ${
              selectedMode ===
              "paper_active"
                ? "bg-black text-white"
                : "border border-gray-300 bg-white text-gray-700"
            }`}
          >
            AI Active
          </Link>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Today&apos;s Candidates
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Ranked by Discovery V2 deterministic scoring and portfolio fit.
                </p>
              </div>

              <div className="text-sm text-gray-500">
                {candidates?.length ?? 0} scored
              </div>
            </div>
          </div>

          {candidates?.length ? (
            <div className="divide-y divide-gray-100">
              {candidates.map(
                (
                  candidate,
                  index
                ) => {
                  const isV2 =
                    candidate.scoring_version ===
                    "v2";

                  return (
                    <div
                      key={
                        candidate.id
                      }
                      className="p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-6">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-semibold text-gray-400">
                              #
                              {index +
                                1}
                            </span>

                            <span className="text-xl font-bold text-gray-900">
                              {
                                candidate.ticker
                              }
                            </span>

                            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">
                              {
                                candidate.status
                              }
                            </span>

                            {candidate.market_cap_bucket && (
                              <span className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600">
                                {formatBucket(
                                  candidate.market_cap_bucket
                                )}{" "}
                                Cap
                              </span>
                            )}

                            {candidate.sector && (
                              <span className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600">
                                {
                                  candidate.sector
                                }
                              </span>
                            )}

                            {isV2 && (
                              <span className="rounded bg-gray-900 px-2 py-1 text-xs font-semibold uppercase text-white">
                                V2
                              </span>
                            )}
                          </div>

                          {candidate.industry && (
                            <p className="mt-2 text-xs text-gray-400">
                              {
                                candidate.industry
                              }
                            </p>
                          )}

                          <p className="mt-3 text-sm text-gray-500">
                            {
                              candidate.reason_summary
                            }
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Discovery
                            Score
                          </p>

                          <p className="mt-1 text-2xl font-bold text-gray-900">
                            {formatScore(
                              candidate.total_score
                            )}
                          </p>

                          {isV2 &&
                            candidate.deep_score !=
                              null && (
                              <p className="mt-1 text-xs text-gray-500">
                                Deep score{" "}
                                {formatScore(
                                  candidate.deep_score
                                )}
                              </p>
                            )}
                        </div>
                      </div>

                      {isV2 ? (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Quality
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.quality_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Growth
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.growth_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Valuation
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.valuation_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Trend Quality
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.trend_quality_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Capital Discipline
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.capital_discipline_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Portfolio Fit
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.portfolio_fit_score
                              )}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Quality
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.quality_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Growth
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.growth_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Valuation
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.valuation_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Earnings
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.earnings_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Risk
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.risk_score
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-gray-500">
                              Portfolio Fit
                            </p>

                            <p className="mt-1 font-medium text-gray-900">
                              {formatScore(
                                candidate.portfolio_fit_score
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/research?ticker=${encodeURIComponent(
                            candidate.ticker
                          )}&mode=${encodeURIComponent(
                            candidate.portfolio_type
                          )}`}
                          className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
                        >
                          Research Candidate
                        </Link>

                        <p className="text-xs text-gray-500">
                          Opens Research for review. No AI cost until you start the committee run.
                        </p>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-gray-500">
                No discovery scan has been saved for this portfolio today.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}