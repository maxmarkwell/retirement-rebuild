import { strict as assert } from "node:assert";
import { planSharedContribution } from "./shared-contribution-contract";
const portfolios = [
  { id: "real-account", type: "real", isRealMoney: true },
  { id: "paper-active", type: "paper_active", isRealMoney: false },
  { id: "benchmark", type: "benchmark", isRealMoney: false },
];
const request = { amount: 100, contributionDate: "2026-10-27", idempotencyKey: "contribution_request_0001" };
const plan = planSharedContribution(portfolios, request);
assert.equal(plan.destinationPortfolioId, "real-account");
assert.equal(plan.contributionCents, 10000);
assert.equal(plan.ledgerEntriesPlanned, 1);
assert.equal(plan.fundsTransferred, false);
assert.equal(plan.postingMode, "not_implemented");
assert.throws(() => planSharedContribution(portfolios, {...request,amount:0}),/positive whole-cent/);
assert.throws(() => planSharedContribution(portfolios, {...request,amount:12.345}),/positive whole-cent/);
assert.throws(() => planSharedContribution(portfolios, {...request,contributionDate:"2026-02-30"}),/date/);
assert.throws(() => planSharedContribution(portfolios, {...request,idempotencyKey:"short"}),/key/);
assert.throws(() => planSharedContribution(portfolios.filter(p=>p.type!=="real"),request),/Exactly one/);
assert.throws(() => planSharedContribution([...portfolios,portfolios[0]],request),/Exactly one/);

// Valid cent amounts must survive ordinary floating-point representation.
for (const amount of [0.01, 0.29, 1.01, 5.04, 19.99, 100.29]) {
  assert.equal(planSharedContribution(portfolios, { ...request, amount }).contributionCents, Math.round(amount * 100));
}
for (const amount of [0.001, 0.299, 1.005, Number.NaN, Infinity, -0.01]) {
  assert.throws(() => planSharedContribution(portfolios, { ...request, amount }), /positive whole-cent/);
}
console.log("Shared contribution posting contract tests passed");
