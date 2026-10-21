/*
 * Regression tests for the experimental Accelerated Growth FCF date-alignment fix.
 * Run: node --test tests/ag-fundamentals-cashflow.test.cjs
 *
 * Uses the repository's existing TypeScript dependency to load the real
 * fundamentals module without introducing a test-runner dependency.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(
  path.join(__dirname, "../lib/discovery/accelerated-growth/fundamentals.ts"),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function incomeRows(dates) {
  return dates.map((date, index) => ({
    date,
    fiscalYear: "2026",
    period: `Q${(index % 4) + 1}`,
    revenue: 200 - index * 10,
    operatingIncome: 30,
    netIncome: 20,
  }));
}

function cashRows(dates) {
  return dates.map((date, index) => ({
    date,
    freeCashFlow: 100 - index,
    operatingCashFlow: 120 - index,
    capitalExpenditure: -20,
  }));
}

const calendarDates = [
  "2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31",
  "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31",
];

async function evaluate(income, cash) {
  const exports = {};
  const fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/income-statement") ? income : cash,
  });
  vm.runInNewContext(compiled, {
    exports,
    require,
    fetch,
    URL,
    process: { env: { FMP_API_KEY: "test-only" } },
  }, { filename: "fundamentals.ts" });
  return exports.getAcceleratedGrowthFundamentals(" test ");
}

test("VICR regression: missing newest cash flow never borrows the prior quarter", async () => {
  const income = incomeRows(calendarDates);
  const cash = cashRows(calendarDates.slice(1));
  const result = await evaluate(income, cash);
  assert.equal(result.quarters[0].date, "2026-09-30");
  assert.equal(result.quarters[0].freeCashFlow, null);
  assert.equal(result.quarters[0].freeCashFlowMargin, null);
  assert.equal(result.quarters[1].freeCashFlow, 100);
  assert.equal(result.dataQuality.eligibleForScoring, false);
});

test("all four newest quarters matched by exact date remain eligible", async () => {
  const result = await evaluate(incomeRows(calendarDates), cashRows(calendarDates));
  assert.equal(result.dataQuality.eligibleForScoring, true);
  assert.equal(result.quarters[0].freeCashFlow, 100);
  assert.equal(result.quarters[3].freeCashFlow, 97);
});

test("non-calendar fiscal quarter ends match by date rather than position", async () => {
  const dates = [
    "2026-06-27", "2026-03-28", "2025-12-27", "2025-09-27",
    "2025-06-28", "2025-03-29", "2024-12-28", "2024-09-28",
  ];
  const cash = cashRows([...dates].reverse());
  const result = await evaluate(incomeRows(dates), cash);
  assert.equal(result.dataQuality.eligibleForScoring, true);
  assert.equal(result.quarters[0].freeCashFlow, 93);
  assert.equal(result.quarters[3].freeCashFlow, 96);
});

test("missing a middle quarter in the latest four blocks eligibility", async () => {
  const cash = cashRows(calendarDates.filter((date) => date !== "2026-03-31"));
  const result = await evaluate(incomeRows(calendarDates), cash);
  assert.equal(result.quarters[2].freeCashFlow, null);
  assert.equal(result.dataQuality.eligibleForScoring, false);
});

test("FCF fallback uses operating cash flow plus signed capital expenditure only for the matching date", async () => {
  const cash = cashRows(calendarDates);
  delete cash[0].freeCashFlow;
  const result = await evaluate(incomeRows(calendarDates), cash);
  assert.equal(result.quarters[0].freeCashFlow, 100);
  assert.equal(result.dataQuality.eligibleForScoring, true);
});
