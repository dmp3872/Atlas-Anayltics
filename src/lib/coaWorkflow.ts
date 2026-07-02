import { COA, CoaWorkflowStage } from './types';

export type { CoaWorkflowStage };

export const COA_WORKFLOW_LABELS: Record<CoaWorkflowStage, string> = {
  issued: 'Issued',
  awaiting_info: 'Awaiting Client Info',
  verified: 'Verified',
  published: 'Published',
};

/** Kanban column order — all new COAs start in `issued`. */
export const COA_WORKFLOW_BOARD_COLUMNS: CoaWorkflowStage[] = [
  'issued',
  'awaiting_info',
  'verified',
  'published',
];

/** Linear progression hint shown above the board. */
export const COA_WORKFLOW_STEPS: CoaWorkflowStage[] = [...COA_WORKFLOW_BOARD_COLUMNS];

export function coaWorkflowStage(coa: Pick<COA, 'coa_workflow_stage' | 'is_public'>): CoaWorkflowStage {
  if (
    coa.coa_workflow_stage === 'awaiting_info'
    || coa.coa_workflow_stage === 'verified'
    || coa.coa_workflow_stage === 'published'
  ) {
    return coa.coa_workflow_stage;
  }
  if (coa.is_public) return 'published';
  return 'issued';
}

export function workflowStepIndex(stage: CoaWorkflowStage): number {
  return COA_WORKFLOW_BOARD_COLUMNS.indexOf(stage);
}

export function buildWorkflowStagePatch(
  coa: Pick<COA, 'verified_at' | 'published_at'>,
  targetStage: CoaWorkflowStage,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { coa_workflow_stage: targetStage };

  switch (targetStage) {
    case 'issued':
    case 'awaiting_info':
      patch.is_public = false;
      break;
    case 'verified':
      patch.is_public = false;
      patch.verified_at = coa.verified_at ?? now;
      break;
    case 'published':
      patch.is_public = true;
      patch.verified_at = coa.verified_at ?? now;
      patch.published_at = coa.published_at ?? now;
      break;
  }

  return patch;
}
