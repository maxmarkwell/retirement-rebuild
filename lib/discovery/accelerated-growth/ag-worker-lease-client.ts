import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type WorkerStage = 'holding_review' | 'discovery' | 'catalyst_deep_research' | 'committee' | 'persistence' | 'finalized';

export async function claimWorkerStage(cycleId: string, stage: WorkerStage) {
  const { data, error } = await createAdminClient().rpc('ag_worker_claim_stage', { p_cycle_id: cycleId, p_stage: stage });
  if (error || typeof data !== 'string') throw new Error('AG_STAGE_CLAIM_FAILED');
  return data;
}

export async function renewWorkerStage(cycleId: string, stage: WorkerStage, token: string) {
  const { data, error } = await createAdminClient().rpc('ag_worker_renew_stage', { p_cycle_id: cycleId, p_stage: stage, p_token: token });
  if (error || data !== true) throw new Error('AG_STAGE_LEASE_LOST');
}

export async function completeWorkerStage(cycleId: string, stage: WorkerStage, token: string, output: Record<string, unknown>) {
  const { data, error } = await createAdminClient().rpc('ag_worker_complete_stage', { p_cycle_id: cycleId, p_stage: stage, p_token: token, p_output: output });
  if (error || data !== true) throw new Error('AG_STAGE_LEASE_LOST');
}
