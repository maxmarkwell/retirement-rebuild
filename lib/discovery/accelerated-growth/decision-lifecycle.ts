import type { AgCommitteeDecision } from "./committee";

export type AgPersistedDecisionType = "buy" | "watch" | "avoid";

export function toAgPersistedDecisionType(decision: AgCommitteeDecision["decision"]): AgPersistedDecisionType {
  if (decision === "REJECT") return "avoid";
  return decision.toLowerCase() as AgPersistedDecisionType;
}

export function fromAgPersistedDecisionType(decisionType: string): AgCommitteeDecision["decision"] {
  if (decisionType === "avoid") return "REJECT";
  if (decisionType === "buy") return "BUY";
  if (decisionType === "watch") return "WATCH";
  throw new Error(`Unsupported AG Committee decision type: ${decisionType}`);
}

export function getAgDecisionLifecycleAction(input: {
  existingActiveDecisionType: string | null;
  nextDecision: AgCommitteeDecision["decision"];
}): "REUSE" | "INSERT_SUPERSEDING" {
  if (!input.existingActiveDecisionType) return "INSERT_SUPERSEDING";
  return fromAgPersistedDecisionType(input.existingActiveDecisionType) === input.nextDecision
    ? "REUSE"
    : "INSERT_SUPERSEDING";
}
