import { COA, CoaWorkflowStage } from './types';

export type { CoaWorkflowStage };

export const COA_WORKFLOW_LABELS: Record<CoaWorkflowStage, string> = {
  issued: 'Issued',
  verified: 'Verified',
  published: 'Published',
};

export const COA_WORKFLOW_STEPS: CoaWorkflowStage[] = ['issued', 'verified', 'published'];

export function coaWorkflowStage(coa: Pick<COA, 'coa_workflow_stage' | 'is_public'>): CoaWorkflowStage {
  if (coa.coa_workflow_stage === 'verified' || coa.coa_workflow_stage === 'published') {
    return coa.coa_workflow_stage;
  }
  if (coa.is_public) return 'published';
  return 'issued';
}

export function workflowStepIndex(stage: CoaWorkflowStage): number {
  return COA_WORKFLOW_STEPS.indexOf(stage);
}
