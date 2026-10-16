import { strict as assert } from "node:assert";
import { test } from "node:test";
import { computeTtmFreeCashFlow } from "./valuation-snapshot";

const quarters = ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31"];

test("sums four consecutive quarters of reported free cash flow", () => {
  const result = computeTtmFreeCashFlow(quarters.map((date, index) => ({ date, freeCashFlow: 100 + index * 10 })));
  assert.equal(result.value, 460);
  assert.equal(result.error, null);
});

test("derives cash flow as operating cash flow less absolute capital expenditure", () => {
  const result = computeTtmFreeCashFlow(quarters.map(date => ({ date, operatingCashFlow: 200, capitalExpenditure: -50 })));
  assert.equal(result.value, 600);
});

test("rejects missing or nonconsecutive quarterly reports", () => {
  assert.equal(computeTtmFreeCashFlow([{ date: quarters[0], freeCashFlow: 100 }]).value, null);
  assert.equal(computeTtmFreeCashFlow([
    { date: quarters[0], freeCashFlow: 100 },
    { date: quarters[1], freeCashFlow: 100 },
    { date: "2025-03-31", freeCashFlow: 100 },
    { date: "2024-12-31", freeCashFlow: 100 },
  ]).value, null);
});

test("does not invent free cash flow when quarterly figures are missing", () => {
  const result = computeTtmFreeCashFlow(quarters.map((date, index) => ({ date, freeCashFlow: index === 0 ? undefined : 100 })));
  assert.equal(result.value, null);
});

test("preserves negative free cash flow rather than treating it as missing", () => {
  const result = computeTtmFreeCashFlow(quarters.map(date => ({ date, freeCashFlow: -25 })));
  assert.equal(result.value, -100);
});
