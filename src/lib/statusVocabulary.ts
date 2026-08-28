/**
 * Shared status language for clients, chemists, and admins.
 * Order/sample/payment labels live in utils.ts; staff COA labels in coaWorkflow.ts.
 * This module adds the client-facing COA vocabulary so the same stages read clearly.
 */
import type { CoaWorkflowStage } from './types';
import type { COA } from './types';
import { coaWorkflowStage } from './coaWorkflow';

/**
 * Client-facing COA stages — coarser than the staff board.
 * Aligns with order language: In lab → In review → Ready → Published.
 */
export const COA_CLIENT_STATUS_LABELS: Record<CoaWorkflowStage, string> = {
  awaiting_info: 'Needs your info',
  testing_in_progress: 'In lab',
  issued: 'In review',
  pending_review: 'In review',
  verified: 'Ready',
  published: 'Published',
};

export type CoaClientStatusTone = 'pending' | 'progress' | 'ready' | 'published';

export function coaClientStatus(coa: Pick<COA, 'coa_workflow_stage' | 'is_public'>): {
  stage: CoaWorkflowStage;
  label: string;
  tone: CoaClientStatusTone;
} {
  const stage = coaWorkflowStage(coa);
  const label = COA_CLIENT_STATUS_LABELS[stage];
  let tone: CoaClientStatusTone = 'progress';
  if (stage === 'awaiting_info') tone = 'pending';
  else if (stage === 'verified') tone = 'ready';
  else if (stage === 'published') tone = 'published';
  return { stage, label, tone };
}
