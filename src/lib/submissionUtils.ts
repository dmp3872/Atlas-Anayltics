import { SubmissionStatus } from './types';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  awaiting_sample: 'Awaiting Sample',
  sample_received: 'Sample Received',
  in_testing: 'In Testing',
  qa_review: 'QA Review',
  complete: 'COA Ready',
  archived: 'Archived',
};

export const SUBMISSION_STATUS_STEPS: SubmissionStatus[] = [
  'draft',
  'submitted',
  'awaiting_sample',
  'sample_received',
  'in_testing',
  'qa_review',
  'complete',
];

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-brand-100 text-brand-800',
  awaiting_sample: 'bg-amber-100 text-amber-700',
  sample_received: 'bg-blue-100 text-blue-700',
  in_testing: 'bg-orange-100 text-orange-700',
  qa_review: 'bg-purple-100 text-purple-700',
  complete: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-neutral-100 text-neutral-500',
};

export function generateSubmissionNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `SUB-${dateStr}-${rand}`;
}

export function generateSampleNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `SMP-${dateStr}-${rand}`;
}

export function getSubmissionStepIndex(status: SubmissionStatus): number {
  if (status === 'archived') return SUBMISSION_STATUS_STEPS.length - 1;
  const idx = SUBMISSION_STATUS_STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export const ADMIN_NEXT_STATUS: Partial<Record<SubmissionStatus, SubmissionStatus[]>> = {
  submitted: ['awaiting_sample', 'sample_received'],
  awaiting_sample: ['sample_received'],
  sample_received: ['in_testing'],
  in_testing: ['qa_review'],
  qa_review: ['complete'],
  complete: ['archived'],
};

export const SHIPPING_ADDRESS = {
  name: 'Atlas Analytics — Sample Receiving',
  line1: '1200 Research Park Drive, Suite 400',
  city: 'Denver',
  state: 'CO',
  zip: '80203',
  country: 'US',
};
