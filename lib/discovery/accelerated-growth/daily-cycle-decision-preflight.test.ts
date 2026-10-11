import { strict as assert } from "node:assert";
import { assertAgDecisionBatchIsUnambiguous } from "./daily-cycle-decision-preflight";

assert.doesNotThrow(() => assertAgDecisionBatchIsUnambiguous({
  holdingSymbols: ["MSFT"], committeeSymbols: ["ADBE", "APP"],
}));
assert.doesNotThrow(() => assertAgDecisionBatchIsUnambiguous({
  holdingSymbols: [], committeeSymbols: [],
}));
assert.throws(() => assertAgDecisionBatchIsUnambiguous({
  holdingSymbols: ["MSFT"], committeeSymbols: ["msft"],
}), /AG_DECISION_DUPLICATE_SYMBOL:MSFT/);
assert.throws(() => assertAgDecisionBatchIsUnambiguous({
  holdingSymbols: [], committeeSymbols: ["APP", "app"],
}), /AG_DECISION_DUPLICATE_SYMBOL:APP/);
assert.throws(() => assertAgDecisionBatchIsUnambiguous({
  holdingSymbols: [" "], committeeSymbols: [],
}), /AG_DECISION_INVALID_SYMBOL/);
