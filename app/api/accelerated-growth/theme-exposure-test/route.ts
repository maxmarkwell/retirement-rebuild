import { NextResponse } from "next/server";
import { calculateAgThemeMarketValue } from "@/lib/discovery/accelerated-growth/theme-exposure";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG theme exposure diagnostic is disabled in production." }, { status: 404 });
  }

  const targetThemeKey = "ag-theme-v1:sector:technology";
  const prices = { AAA: 100, BBB: 50 };
  const holdings = [{ ticker: "AAA", quantity: 0.1 }, { ticker: "BBB", quantity: 0.2 }];
  const cleanTransactions = [
    { ticker: "AAA", ag_theme_key: targetThemeKey },
    { ticker: "BBB", ag_theme_key: "ag-theme-v1:sector:industrials" },
  ];

  const sameThemeMarketValue = calculateAgThemeMarketValue({ targetThemeKey, holdings, prices, transactions: cleanTransactions });

  let missingAttributionBlocked = false;
  try {
    calculateAgThemeMarketValue({
      targetThemeKey, holdings, prices,
      transactions: [{ ticker: "AAA", ag_theme_key: targetThemeKey }, { ticker: "BBB", ag_theme_key: null }],
    });
  } catch { missingAttributionBlocked = true; }

  let inconsistentAttributionBlocked = false;
  try {
    calculateAgThemeMarketValue({
      targetThemeKey,
      holdings: [{ ticker: "AAA", quantity: 0.1 }],
      prices,
      transactions: [
        { ticker: "AAA", ag_theme_key: targetThemeKey },
        { ticker: "AAA", ag_theme_key: "ag-theme-v1:sector:industrials" },
      ],
    });
  } catch { inconsistentAttributionBlocked = true; }

  return NextResponse.json({
    themeExposureDiagnostic: true,
    zeroWrite: true,
    sameThemeMarketValue,
    expectedSameThemeMarketValue: 10,
    missingAttributionBlocked,
    inconsistentAttributionBlocked,
    passed: sameThemeMarketValue === 10 && missingAttributionBlocked && inconsistentAttributionBlocked,
  });
}
