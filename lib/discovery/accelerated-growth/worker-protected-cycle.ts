/** Explicitly excluded legacy cycle. Never inspect, claim, renew or complete through worker paths. */
export const AG_WORKER_PROTECTED_CYCLE_ID = "583809c1-7157-4ad4-b343-56acc332a145";

export function assertAgWorkerCycleNotProtected(cycleId: string): void {
  if (cycleId.toLowerCase() === AG_WORKER_PROTECTED_CYCLE_ID) {
    throw new Error("AG_WORKER_PROTECTED_CYCLE");
  }
}
