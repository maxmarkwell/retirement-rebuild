import { assert } from "node:assert/strict";
import { test } from "node:test";
import {
  assertAgPaperBuyAuthorized,
  assertAgSellDisabled,
  type AgExecutionAuthorization,
} from "./buy-activation-policy";

const ready: AgExecutionAuthorization = {
  mode: "paper_buy_only",
  explicitlyApproved: true,
  researchReconciled: true,
  buyControlsValidated: true,
};

test("AG paper BUY activation fails closed without explicit approval", () => {
  assert.throws(() => assertAgPaperBuyAuthorized({ ...ready, explicitlyApproved: false }), /AG_PAPER_BUY_NOT_AUTHORIZED/);
});
test("AG paper BUY activation fails closed in disabled mode", () => {
  assert.throws(() => assertAgPaperBuyAuthorized({ ...ready, mode: "disabled" }), /AG_PAPER_BUY_NOT_AUTHORIZED/);
});
test("AG paper BUY activation requires reconciled research", () => {
  assert.throws(() => assertAgPaperBuyAuthorized({ ...ready, researchReconciled: false }), /AG_RESEARCH_RECONCILIATION_REQUIRED/);
});
test("AG paper BUY activation requires validated controls", () => {
  assert.throws(() => assertAgPaperBuyAuthorized({ ...ready, buyControlsValidated: false }), /AG_BUY_CONTROLS_NOT_VALIDATED/);
});
test("fully approved and validated paper BUY passes", () => {
  assert.doesNotThrow(() => assertAgPaperBuyAuthorized(ready));
});
test("AG SELL execution remains disabled", () => {
  assert.throws(() => assertAgSellDisabled(), /AG_SELL_EXECUTION_DISABLED/);
});
