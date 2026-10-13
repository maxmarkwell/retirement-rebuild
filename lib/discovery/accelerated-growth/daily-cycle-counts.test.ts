import { strict as assert } from "node:assert";
import { validateAgCycleCounts } from "./daily-cycle-counts";

const good = {
  universeCount: 1741, preselectedCount: 22, evaluatedCount: 22,
  discoveryAdvanceCount: 5, catalystSupportedCount: 3,
  deepResearchCompletedCount: 2, deepResearchFailedCount: 0,
  proceedCount: 1, committeeDecisionCount: 1, persistedDecisionCount: 1,
};
assert.doesNotThrow(() => validateAgCycleCounts(good));
assert.throws(() => validateAgCycleCounts(undefined), /AG_CYCLE_MISSING_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, universeCount: undefined }), /AG_CYCLE_INVALID_COUNT:universeCount/);
assert.throws(() => validateAgCycleCounts({ ...good, evaluatedCount: -1 }), /AG_CYCLE_INVALID_COUNT:evaluatedCount/);
assert.throws(() => validateAgCycleCounts({ ...good, evaluatedCount: 1.5 }), /AG_CYCLE_INVALID_COUNT:evaluatedCount/);
assert.throws(() => validateAgCycleCounts({ ...good, preselectedCount: 2000 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, discoveryAdvanceCount: 23 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, persistedDecisionCount: 2 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, catalystSupportedCount: 6 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, deepResearchCompletedCount: 4 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, proceedCount: 3 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, deepResearchFailedCount: 2 }), /AG_CYCLE_INCONSISTENT_COUNTS/);
assert.throws(() => validateAgCycleCounts({ ...good, universeCount: 0, preselectedCount: 0, evaluatedCount: 0, discoveryAdvanceCount: 0, catalystSupportedCount: 0, deepResearchCompletedCount: 0, proceedCount: 0 }), /AG_CYCLE_EMPTY_UNIVERSE/);
assert.throws(() => validateAgCycleCounts({ ...good, evaluatedCount: 0, discoveryAdvanceCount: 0, catalystSupportedCount: 0, deepResearchCompletedCount: 0, proceedCount: 0 }), /AG_CYCLE_NO_EVALUATIONS/);
