import {
  NextRequest,
  NextResponse,
} from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";
import { calculatePositionSizing } from "@/lib/portfolio/position-sizing";

export async function GET(
  request: NextRequest
) {
  const ticker =
    request.nextUrl.searchParams
      .get("ticker")
      ?.trim()
      .toUpperCase();

  const confidenceRaw =
    request.nextUrl.searchParams.get(
      "confidence"
    );

  const risk =
    request.nextUrl.searchParams.get(
      "risk"
    );

  if (!ticker) {
    return NextResponse.json(
      {
        error:
          "ticker is required.",
      },
      {
        status: 400,
      }
    );
  }

  const confidence =
    confidenceRaw != null
      ? Number(confidenceRaw)
      : NaN;

  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 100
  ) {
    return NextResponse.json(
      {
        error:
          "confidence must be between 0 and 100.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    risk !== "low" &&
    risk !== "medium" &&
    risk !== "high"
  ) {
    return NextResponse.json(
      {
        error:
          "risk must be low, medium, or high.",
      },
      {
        status: 400,
      }
    );
  }

  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "You must be signed in.",
      },
      {
        status: 401,
      }
    );
  }

  const {
    data: portfolio,
    error: portfolioError,
  } = await supabase
    .from("portfolios")
    .select("*")
    .eq(
      "type",
      "paper_long_term"
    )
    .eq(
      "is_active",
      true
    )
    .single();

  if (
    portfolioError ||
    !portfolio
  ) {
    return NextResponse.json(
      {
        error:
          portfolioError?.message ??
          "Unable to load AI Long-Term portfolio.",
      },
      {
        status: 500,
      }
    );
  }

  const {
    data: contributions,
    error: contributionsError,
  } = await supabase
    .from("contributions")
    .select(
      "portfolio_id, amount"
    )
    .eq(
      "portfolio_id",
      portfolio.id
    );

  if (contributionsError) {
    return NextResponse.json(
      {
        error:
          contributionsError.message,
      },
      {
        status: 500,
      }
    );
  }

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select(
      "portfolio_id, transaction_type, ticker, quantity, gross_amount, fees, transaction_date, created_at"
    )
    .eq(
      "portfolio_id",
      portfolio.id
    )
    .order(
      "transaction_date",
      {
        ascending: true,
      }
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (transactionsError) {
    return NextResponse.json(
      {
        error:
          transactionsError.message,
      },
      {
        status: 500,
      }
    );
  }

  const heldTickers =
    Array.from(
      new Set(
        (transactions ?? [])
          .filter(
            (transaction) =>
              transaction.ticker &&
              (
                transaction.transaction_type ===
                  "buy" ||
                transaction.transaction_type ===
                  "sell"
              )
          )
          .map(
            (transaction) =>
              transaction.ticker
                .trim()
                .toUpperCase()
          )
      )
    );

  if (
    !heldTickers.includes(
      ticker
    )
  ) {
    heldTickers.push(
      ticker
    );
  }

  const marketPrices: Record<
    string,
    number
  > = {};

  try {
    const quotes =
      await getMarketQuotes(
        heldTickers
      );

    for (
      const [
        symbol,
        quote,
      ] of Object.entries(
        quotes
      )
    ) {
      marketPrices[
        symbol
      ] = quote.price;
    }
  } catch (error) {
    console.error(
      "Unable to load prices for position sizing:",
      error
    );
  }

  const currentPrice =
    marketPrices[ticker];

  if (
    currentPrice == null ||
    currentPrice <= 0
  ) {
    return NextResponse.json(
      {
        error:
          `Unable to load a current price for ${ticker}.`,
      },
      {
        status: 500,
      }
    );
  }

  const accounting =
    calculatePortfolioAccounting(
      portfolio,
      contributions ?? [],
      transactions ?? [],
      marketPrices
    );

  const holding =
    accounting.holdings.find(
      (item) =>
        item.ticker
          .trim()
          .toUpperCase() ===
        ticker
    );

  const sizing =
    calculatePositionSizing({
      portfolioMode:
        "paper_long_term",

      portfolioTotalValue:
        accounting.permanentCapital,

      availableCash:
        accounting.cash,

      currentPrice,

      currentHoldingMarketValue:
        holding?.marketValue ??
        0,

      confidenceScore:
        confidence,

      riskLevel:
        risk,
    });

  return NextResponse.json({
    ticker,
    currentPrice,

    portfolio: {
      name:
        portfolio.name,

      totalValue:
        accounting.permanentCapital,

      availableCash:
        accounting.cash,

      currentHoldingMarketValue:
        holding?.marketValue ??
        0,
    },

    inputs: {
      confidence,
      risk,
    },

    sizing,
  });
}