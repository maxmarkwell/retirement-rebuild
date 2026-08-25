import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatMoney(
  value: number | string | null
) {
  if (value == null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(Number(value));
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
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
    }
  ).format(
    new Date(value)
  );
}

export default async function WatchlistPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ---------------------------------------------------------
  // Load active reassessments
  // ---------------------------------------------------------

  const {
    data: reassessments,
    error: reassessmentsError,
  } =
    await supabase
      .from(
        "investment_reassessments"
      )
      .select(
        `
        id,
        portfolio_id,
        decision_id,
        ticker,
        status,
        trigger_type,
        scheduled_for,
        triggered_at,
        trigger_reason,
        prior_decision_type,
        prior_confidence,
        prior_price,
        created_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .in(
        "status",
        [
          "pending",
          "ready",
        ]
      )
      .order(
        "scheduled_for",
        {
          ascending: true,
          nullsFirst: false,
        }
      );

  if (
    reassessmentsError
  ) {
    throw new Error(
      `Unable to load watchlist: ${reassessmentsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load portfolio names
  // ---------------------------------------------------------

  const {
    data: portfolios,
    error: portfoliosError,
  } =
    await supabase
      .from(
        "portfolios"
      )
      .select(
        "id, name"
      );

  if (
    portfoliosError
  ) {
    throw new Error(
      `Unable to load portfolios: ${portfoliosError.message}`
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

  const readyCount =
    (
      reassessments ??
      []
    ).filter(
      (item) =>
        item.status ===
        "ready"
    ).length;

  const pendingCount =
    (
      reassessments ??
      []
    ).filter(
      (item) =>
        item.status ===
        "pending"
    ).length;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Watchlist
          </h1>

          <p className="mt-2 max-w-3xl text-gray-600">
            Securities the AI Investment Committee
            decided deserve continued attention but
            not portfolio action yet.
          </p>
        </div>

        {/* Summary */}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Active Watchlist
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {
                reassessments
                  ?.length ??
                0
              }
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Pending Review
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {pendingCount}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Ready for Review
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {readyCount}
            </p>
          </div>
        </div>

        {/* Watchlist */}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Active Reassessments
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              What we are watching, why we are
              watching it, and when the investment
              case should be reviewed again.
            </p>
          </div>

          {reassessments?.length ? (
            <div className="divide-y divide-gray-100">
              {reassessments.map(
                (
                  reassessment
                ) => (
                  <div
                    key={
                      reassessment.id
                    }
                    className="p-6"
                  >
                    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-xl font-bold text-gray-900">
                            {
                              reassessment.ticker
                            }
                          </span>

                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                              reassessment.status ===
                              "ready"
                                ? "bg-yellow-50 text-yellow-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {
                              reassessment.status
                            }
                          </span>

                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">
                            {
                              reassessment.trigger_type
                            }
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-gray-500">
                          {portfolioNames.get(
                            reassessment.portfolio_id
                          ) ??
                            "Unknown Portfolio"}
                        </p>

                        <div className="mt-5">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            What We&apos;re
                            Waiting For
                          </p>

                          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-700">
                            {
                              reassessment.trigger_reason ??
                              "No reassessment conditions recorded."
                            }
                          </p>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <Link
                            href={`/decisions/${reassessment.decision_id}`}
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            View Original Decision
                          </Link>

                          <Link
                            href={`/research?ticker=${encodeURIComponent(
                              reassessment.ticker
                            )}`}
                            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
                          >
                            Open Research
                          </Link>
                        </div>
                      </div>

                      <div className="min-w-52 lg:text-right">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Next Review
                        </p>

                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {formatDate(
                            reassessment.scheduled_for
                          )}
                        </p>

                        <div className="mt-5">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Original Decision
                          </p>

                          <p className="mt-1 font-medium uppercase text-gray-900">
                            {
                              reassessment.prior_decision_type ??
                              "—"
                            }
                          </p>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Confidence
                          </p>

                          <p className="mt-1 font-medium text-gray-900">
                            {reassessment.prior_confidence !=
                            null
                              ? `${Number(
                                  reassessment.prior_confidence
                                ).toFixed(
                                  0
                                )}/100`
                              : "—"}
                          </p>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Reference Price
                          </p>

                          <p className="mt-1 font-medium text-gray-900">
                            {formatMoney(
                              reassessment.prior_price
                            )}
                          </p>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Added
                          </p>

                          <p className="mt-1 text-sm text-gray-700">
                            {formatDate(
                              reassessment.created_at
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-gray-500">
                No securities are currently awaiting
                reassessment.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}