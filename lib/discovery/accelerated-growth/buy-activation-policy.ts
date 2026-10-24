/** Research-to-execution boundary for Accelerated Growth.
 * A Committee BUY is research evidence, never permission to transact.
 * This module intentionally has no database or brokerage side effects.
 */
export type AgExecutionMode = "disabled" | "paper_buy_only";

export type AgExecutionAuthorization = {
  mode: AgExecutionMode;
  explicitlyApproved: boolean;
  researchReconciled: boolean;
  buyControlsValidated: boolean;
};

export function assertAgPaperBuyAuthorized(input: AgExecutionAuthorization): void {
  if (input.mode !== "paper_buy_only" || !input.explicitlyApproved) {
    throw new Error("AG_PAPER_BUY_NOT_AUTHORIZED");
  }
  if (!input.researchReconciled) {
    throw new Error("AG_RESEARCH_RECONCILIATION_REQUIRED");
  }
  if (!input.buyControlsValidated) {
    throw new Error("AG_BUY_CONTROLS_NOT_VALIDATED");
  }
}

export function assertAgSellDisabled(): never {
  throw new Error("AG_SELL_EXECUTION_DISABLED");
}
