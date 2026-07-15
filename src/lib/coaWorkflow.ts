import { COA, CoaWorkflowStage } from './types';

export type { CoaWorkflowStage };

export const COA_WORKFLOW_LABELS: Record<CoaWorkflowStage, string> = {
  awaiting_info: 'Awaiting Client Info',
  testing_in_progress: 'Testing in Progress',
  issued: 'Issued COAs',
  pending_review: 'Pending Review',
  verified: 'Verified COAs',
  published: 'Published COAs',
};

/**
 * Kanban column order.
 * - awaiting_info: backtrack when client/contact details are missing
 * - testing_in_progress: samples still awaiting a COA (pre-issue)
 * - issued → pending_review → verified → published: certificate lifecycle
 */
export const COA_WORKFLOW_BOARD_COLUMNS: CoaWorkflowStage[] = [
  'awaiting_info',
  'testing_in_progress',
  'issued',
  'pending_review',
  'verified',
  'published',
];

/** Forward path shown above the board (awaiting_info is a backtrack lane). */
export const COA_WORKFLOW_STEPS: CoaWorkflowStage[] = [
  'testing_in_progress',
  'issued',
  'pending_review',
  'verified',
  'published',
];

export function coaWorkflowStage(coa: Pick<COA, 'coa_workflow_stage' | 'is_public'>): CoaWorkflowStage {
  if (
    coa.coa_workflow_stage === 'awaiting_info'
    || coa.coa_workflow_stage === 'testing_in_progress'
    || coa.coa_workflow_stage === 'pending_review'
    || coa.coa_workflow_stage === 'verified'
    || coa.coa_workflow_stage === 'published'
  ) {
    return coa.coa_workflow_stage;
  }
  if (coa.is_public) return 'published';
  return 'issued';
}

/** Dual sign-off: issuing chemist (1) then lab director / reviewing chemist (2). */
export function coaSignatureProgress(
  coa: Pick<COA, 'coa_workflow_stage' | 'is_public' | 'verified_at'>,
): { signed: number; total: number; label: string } {
  const stage = coaWorkflowStage(coa);
  if (stage === 'verified' || stage === 'published' || coa.verified_at) {
    return { signed: 2, total: 2, label: 'Signatures 2/2' };
  }
  if (stage === 'pending_review') {
    return { signed: 1, total: 2, label: 'Signatures 1/2' };
  }
  if (stage === 'issued') {
    return { signed: 1, total: 2, label: 'Awaiting review' };
  }
  return { signed: 0, total: 2, label: 'Not signed' };
}

/** Second signature (Lab Director / Certified By) is present after verify. */
export function coaHasDirectorSignature(
  coa: Pick<COA, 'coa_workflow_stage' | 'is_public' | 'verified_at'>,
): boolean {
  return coaSignatureProgress(coa).signed >= 2;
}

/** Prepare (vial + panel stats) is only allowed before verify / publish. */
export function canPrepareCoa(coa: Pick<COA, 'coa_workflow_stage' | 'is_public'>): boolean {
  const stage = coaWorkflowStage(coa);
  return stage === 'issued' || stage === 'awaiting_info' || stage === 'testing_in_progress';
}

export function workflowStepIndex(stage: CoaWorkflowStage): number {
  return COA_WORKFLOW_BOARD_COLUMNS.indexOf(stage);
}

export function buildWorkflowStagePatch(
  coa: Pick<COA, 'verified_at' | 'published_at'>,
  targetStage: CoaWorkflowStage,
  opts?: { reviewAssignedTo?: string | null },
): Record<string, unknown> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { coa_workflow_stage: targetStage };

  switch (targetStage) {
    case 'issued':
    case 'awaiting_info':
    case 'testing_in_progress':
      patch.is_public = false;
      if (targetStage === 'issued') {
        patch.review_assigned_to = null;
      }
      break;
    case 'pending_review':
      patch.is_public = false;
      if (opts?.reviewAssignedTo) {
        patch.review_assigned_to = opts.reviewAssignedTo;
      }
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
