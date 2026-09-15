import Link from "next/link";
import { redirect } from "next/navigation";
import DiscoveryRunForm from "@/components/discovery-run-form";
import { createClient } from "@/lib/supabase/server";

type DiscoveryPageProps = {
  searchParams: Promise<{
    mode?: string;
    view?: string;
  }>;
};

type DecisionSummary = {
  id: string;
  ticker: string;
  decision_type: string;
  decision_date: string;
  status: string;
};

function formatScore(value: number | string | null) {
  return value == null ? "—" : Number(value).toFixed(2);
}

function formatBucket(value: string | null) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDecisionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getPortfolioFitExplanation(
  value: number | string | null,
  isCurrentHolding: boolean
) {
  const score = value == null ? null : Number(value);

  if (isCurrentHolding) {
    if (score != null && score < 75) {
      return "Current holding. Existing position size, sector exposure, or cash is reducing portfolio fit.";
    }
    return "Current holding. Fit reflects existing position size, sector exposure, and available cash.";
  }

  if (score != null && score >= 90) {
    return "New position. Strong fit after current diversification and available cash are considered.";
  }
  if (score != null && score >= 75) {
    return "New position. Favorable fit after current sector exposure and available cash are considered.";
  }
  return "New position. Current sector exposure or available cash is limiting portfolio fit.";
}

function decisionBadgeClass(decisionType: string) {
  switch (decisionType) {
    case "buy":
      return "border-emerald-300 bg-emerald-100 text-emerald-800";
    case "watch":
      return "border-amber-300 bg-amber-100 text-amber-800";
    case "avoid":
    case "sell":
      return "border-red-300 bg-red-100 text-red-800";
    default:
      return "border-gray-300 bg-gray-100 text-gray-800";
  }
}

export default async function DiscoveryPage({ searchParams }: DiscoveryPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { mode, view } = await searchParams;
  const selectedMode =
    mode === "paper_active"
      ? "paper_active"
      : mode === "paper_long_term"
        ? "paper_long_term"
        : "real";
  const isRealPortfolio = selectedMode === "real";
  const selectedRealView =
    view === "holdings"
      ? "holdings"
      : view === "watchlist"
        ? "watchlist"
        : "opportunities";

  const discoveryDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data: candidates, error: candidatesError } = await supabase
    .from("stock_discovery_candidates")
    .select(`
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
    `)
    .eq("user_id", user.id)
    .eq("portfolio_type", selectedMode)
    .eq("discovery_date", discoveryDate)
    .order("total_score", { ascending: false });

  if (candidatesError) {
    throw new Error(`Unable to load discovery candidates: ${candidatesError.message}`);
  }

  const { data: selectedPortfolio, error: selectedPortfolioError } = await supabase
    .from("portfolios")
    .select("id")
    .eq("type", selectedMode)
    .eq("is_active", true)
    .maybeSingle();

  if (selectedPortfolioError) {
    throw new Error(`Unable to load selected portfolio: ${selectedPortfolioError.message}`);
  }

  const currentHoldingTickers = new Set<string>();

  if (isRealPortfolio && selectedPortfolio) {
    const { data: transactions, error: transactionsError } = await supabase
      .from("transactions")
      .select("transaction_type, ticker, quantity")
      .eq("portfolio_id", selectedPortfolio.id);

    if (transactionsError) {
      throw new Error(`Unable to load Real Portfolio holdings: ${transactionsError.message}`);
    }

    const quantities = new Map<string, number>();
    for (const transaction of transactions ?? []) {
      if (!transaction.ticker || transaction.quantity == null) continue;

      const ticker = transaction.ticker.trim().toUpperCase();
      const quantity = Number(transaction.quantity);
      if (!Number.isFinite(quantity)) continue;

      const transactionType = transaction.transaction_type.trim().toLowerCase();
      if (transactionType !== "buy" && transactionType !== "sell") continue;

      quantities.set(
        ticker,
        (quantities.get(ticker) ?? 0) + (transactionType === "sell" ? -quantity : quantity)
      );
    }

    for (const [ticker, quantity] of quantities) {
      if (quantity > 0.0000001) currentHoldingTickers.add(ticker);
    }
  }

  const latestDecisionByTicker = new Map<string, DecisionSummary>();
  const candidateTickers = Array.from(
    new Set((candidates ?? []).map((candidate) => candidate.ticker.trim().toUpperCase()))
  );

  if (selectedPortfolio && candidateTickers.length > 0) {
    const { data: decisions, error: decisionsError } = await supabase
      .from("investment_decisions")
      .select("id, ticker, decision_type, decision_date, status")
      .eq("user_id", user.id)
      .eq("portfolio_id", selectedPortfolio.id)
      .eq("source", "ai_committee")
      .in("status", ["active", "executed"])
      .in("ticker", candidateTickers)
      .order("decision_date", { ascending: false });

    if (decisionsError) {
      throw new Error(`Unable to load Committee decision state: ${decisionsError.message}`);
    }

    for (const decision of decisions ?? []) {
      const ticker = decision.ticker.trim().toUpperCase();
      if (!latestDecisionByTicker.has(ticker)) {
        latestDecisionByTicker.set(ticker, decision as DecisionSummary);
      }
    }
  }

  const { data: previousCandidateDate, error: previousCandidateDateError } = await supabase
    .from("stock_discovery_candidates")
    .select("discovery_date")
    .eq("user_id", user.id)
    .eq("portfolio_type", selectedMode)
    .lt("discovery_date", discoveryDate)
    .order("discovery_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousCandidateDateError) {
    throw new Error(
      `Unable to load previous discovery date: ${previousCandidateDateError.message}`
    );
  }

  let previousTickers = new Set<string>();
  if (previousCandidateDate?.discovery_date) {
    const { data: previousCandidates, error: previousCandidatesError } = await supabase
      .from("stock_discovery_candidates")
      .select("ticker")
      .eq("user_id", user.id)
      .eq("portfolio_type", selectedMode)
      .eq("discovery_date", previousCandidateDate.discovery_date);

    if (previousCandidatesError) {
      throw new Error(
        `Unable to load previous discovery candidates: ${previousCandidatesError.message}`
      );
    }

    previousTickers = new Set(
      (previousCandidates ?? []).map((candidate) => candidate.ticker.trim().toUpperCase())
    );
  }

    const realHoldingCandidates = isRealPortfolio
    ? (candidates ?? []).filter((candidate) =>
        currentHoldingTickers.has(
          candidate.ticker.trim().toUpperCase()
        )
      )
    : [];

  const realWatchCandidates = isRealPortfolio
    ? (candidates ?? []).filter((candidate) => {
        const ticker = candidate.ticker.trim().toUpperCase();
        const committeeDecision = latestDecisionByTicker.get(ticker);

        return (
          !currentHoldingTickers.has(ticker) &&
          committeeDecision?.decision_type === "watch"
        );
      })
    : [];

  const realOpportunityCandidates = isRealPortfolio
    ? (candidates ?? []).filter((candidate) => {
        const ticker = candidate.ticker.trim().toUpperCase();
        const committeeDecision = latestDecisionByTicker.get(ticker);

        return (
          !currentHoldingTickers.has(ticker) &&
          !committeeDecision
        );
      })
    : candidates ?? [];

  const displayedCandidates = isRealPortfolio
    ? selectedRealView === "holdings"
      ? realHoldingCandidates
      : selectedRealView === "watchlist"
        ? realWatchCandidates
        : realOpportunityCandidates
    : candidates ?? [];

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">RETIREMENT REBUILD</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            {isRealPortfolio ? "Real Portfolio Discovery" : "Stock Discovery"}
          </h1>
          <p className="mt-2 text-gray-600">
            {isRealPortfolio
              ? "Find opportunities for your current portfolio using deterministic financial scoring and portfolio fit."
              : "Screen the investable universe before spending AI research dollars."}
          </p>
        </div>

        <div className="mt-8">
          <DiscoveryRunForm />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {[
            ["real", "Real Portfolio"],
            ["paper_long_term", "Paper Long-Term"],
            ["paper_active", "AI Active"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/discovery?mode=${value}`}
              className={`rounded px-4 py-2 text-sm font-medium ${
                selectedMode === value
                  ? "bg-black text-white"
                  : "border border-gray-300 bg-white text-gray-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {isRealPortfolio && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/discovery?mode=real&view=opportunities"
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                selectedRealView === "opportunities"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 bg-white text-gray-700"
              }`}
            >
              New Opportunities ({realOpportunityCandidates.length})
            </Link>

            <Link
              href="/discovery?mode=real&view=holdings"
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                selectedRealView === "holdings"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 bg-white text-gray-700"
              }`}
            >
              Current Holdings ({realHoldingCandidates.length})
            </Link>

            <Link
              href="/discovery?mode=real&view=watchlist"
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                selectedRealView === "watchlist"
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 bg-white text-gray-700"
              }`}
            >
              Watchlist ({realWatchCandidates.length})
            </Link>

          </div>
        )}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isRealPortfolio
                    ? selectedRealView === "holdings"
                      ? "Current Holdings in Today's Discovery"
                      : selectedRealView === "watchlist"
                        ? "Watchlist Candidates"
                      : "New Opportunities for Your Real Portfolio"
                    : "Today's Candidates"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {isRealPortfolio
  ? selectedRealView === "holdings"
    ? "Current positions that appeared in today's Discovery, including their latest scoring and Committee state."
    : selectedRealView === "watchlist"
      ? "Unowned companies already placed on WATCH by the Committee. These remain outside the new-opportunity ranking until reassessment is warranted."
      : "Unowned, unreviewed companies ranked by fundamentals and fit with your current holdings, sector exposure, and available cash."
  : "Ranked by Discovery V2 deterministic scoring and portfolio fit."}
</p>
              </div>
              <div className="text-sm text-gray-500">{displayedCandidates.length} shown</div>
            </div>
          </div>

          {displayedCandidates.length ? (
            <div className="divide-y divide-gray-100">
              {displayedCandidates.map((candidate, index) => {
                const isV2 = candidate.scoring_version === "v2";
                const ticker = candidate.ticker.trim().toUpperCase();
                const isCurrentHolding =
                  isRealPortfolio && currentHoldingTickers.has(ticker);
                const isNewCandidate =
                  !isRealPortfolio &&
                  previousCandidateDate != null &&
                  !previousTickers.has(ticker);
                const portfolioFitExplanation = isRealPortfolio
                  ? getPortfolioFitExplanation(
                      candidate.portfolio_fit_score,
                      isCurrentHolding
                    )
                  : null;
                const committeeDecision = latestDecisionByTicker.get(ticker);

                return (
                  <div
                    key={candidate.id}
                    className={`p-6 transition-colors ${
                      isCurrentHolding
                        ? "bg-blue-50/40"
                        : isRealPortfolio || isNewCandidate
                          ? "bg-emerald-50/40"
                          : "bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          {(!isRealPortfolio || selectedRealView === "opportunities") && (
  <span className="text-sm font-semibold text-gray-400">
    #{index + 1}
  </span>
)}
                          <span className="text-xl font-bold text-gray-900">{candidate.ticker}</span>

                          {isRealPortfolio ? (
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                                isCurrentHolding
                                  ? "border-blue-300 bg-blue-100 text-blue-800"
                                  : "border-emerald-300 bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isCurrentHolding ? "Current Holding" : "New Position"}
                            </span>
                          ) : (
                            <>
                              {isNewCandidate && (
                                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
                                  New Candidate
                                </span>
                              )}
                              <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">
                                {candidate.status}
                              </span>
                            </>
                          )}

                          {committeeDecision && (
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${decisionBadgeClass(
                                committeeDecision.decision_type
                              )}`}
                            >
                              Committee: {committeeDecision.decision_type} · {formatDecisionDate(committeeDecision.decision_date)}
                            </span>
                          )}

                          {candidate.market_cap_bucket && (
                            <span className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600">
                              {formatBucket(candidate.market_cap_bucket)} Cap
                            </span>
                          )}
                          {candidate.sector && (
                            <span className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600">
                              {candidate.sector}
                            </span>
                          )}
                          {isV2 && (
                            <span className="rounded bg-gray-900 px-2 py-1 text-xs font-semibold uppercase text-white">
                              V2
                            </span>
                          )}
                        </div>

                        {candidate.industry && (
                          <p className="mt-2 text-xs text-gray-400">{candidate.industry}</p>
                        )}
                        <p className="mt-3 text-sm text-gray-500">{candidate.reason_summary}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Discovery Score</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {formatScore(candidate.total_score)}
                        </p>
                        {isV2 && candidate.deep_score != null && (
                          <p className="mt-1 text-xs text-gray-500">
                            Deep score {formatScore(candidate.deep_score)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                      <div>
                        <p className="text-xs uppercase text-gray-500">Quality</p>
                        <p className="mt-1 font-medium text-gray-900">{formatScore(candidate.quality_score)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-500">Growth</p>
                        <p className="mt-1 font-medium text-gray-900">{formatScore(candidate.growth_score)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-500">Valuation</p>
                        <p className="mt-1 font-medium text-gray-900">{formatScore(candidate.valuation_score)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-500">{isV2 ? "Trend Quality" : "Earnings"}</p>
                        <p className="mt-1 font-medium text-gray-900">
                          {formatScore(isV2 ? candidate.trend_quality_score : candidate.earnings_score)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-500">{isV2 ? "Capital Discipline" : "Risk"}</p>
                        <p className="mt-1 font-medium text-gray-900">
                          {formatScore(isV2 ? candidate.capital_discipline_score : candidate.risk_score)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-gray-500">Portfolio Fit</p>
                        <p className="mt-1 font-medium text-gray-900">{formatScore(candidate.portfolio_fit_score)}</p>
                      </div>
                    </div>

                    {portfolioFitExplanation && (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Portfolio Fit Context
                        </p>
                        <p className="mt-1 text-sm text-gray-700">{portfolioFitExplanation}</p>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      {committeeDecision ? (
                        <>
                          <Link
                            href={`/decisions/${committeeDecision.id}`}
                            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
                          >
                            View Decision
                          </Link>
                          <p className="text-xs text-gray-500">
                            Committee already reviewed this ticker. Open the existing decision before considering a reassessment.
                          </p>
                        </>
                      ) : (
                        <>
                          <Link
                            href={`/research?ticker=${encodeURIComponent(candidate.ticker)}&mode=${encodeURIComponent(candidate.portfolio_type)}`}
                            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
                          >
                            {isCurrentHolding ? "Review Holding" : "Research Candidate"}
                          </Link>
                          <p className="text-xs text-gray-500">
                            {isCurrentHolding
                              ? "Opens Research with this existing Real Portfolio position in context."
                              : "Opens Research for review. No AI cost until you start the committee run."}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
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
