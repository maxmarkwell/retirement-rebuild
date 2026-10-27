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
console.log("Shared contribution posting contract tests passed");
