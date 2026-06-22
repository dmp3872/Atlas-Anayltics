import { buildCOAInsertPayload } from '../coaBuilder';
import { supabase } from '../supabase';
import {
  Submission,
  SubmissionSample,
  SubmissionStatus,
  StatusHistoryEntry,
  SubmissionResult,
  TestPanel,
} from '../types';
import { generateSampleNumber, generateSubmissionNumber } from '../submissionUtils';
import { withAtlasSafetyProPanel } from '../testPanels';

export interface SampleDraft {
  product_name: string;
  batch_lot_number: string;
  sample_count: number;
  panel_id: string;
}

export interface SubmissionDraft {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  urgency: 'standard' | 'rush';
  notes: string;
  samples: SampleDraft[];
}

async function logStatusChange(
  submissionId: string,
  fromStatus: SubmissionStatus | null,
  toStatus: SubmissionStatus,
  note: string,
  sampleId?: string | null,
  changedBy?: string | null,
) {
  await supabase.from('submission_status_history').insert({
    submission_id: submissionId,
    sample_id: sampleId ?? null,
    from_status: fromStatus,
    to_status: toStatus,
    note,
    changed_by: changedBy ?? null,
  });
}

export async function fetchUserSubmissions(userId: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*, submission_samples(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchSubmission(id: string): Promise<Submission | null> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*, submission_samples(*, submission_results(*))')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchSubmissionHistory(submissionId: string): Promise<StatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('submission_status_history')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchTestPanels(): Promise<TestPanel[]> {
  const { data, error } = await supabase
    .from('test_panels')
    .select('*')
    .eq('is_active', true)
    .neq('category', 'base')
    .order('sort_order');

  if (error) {
    console.warn('fetchTestPanels failed, using Safety Pro fallback:', error.message);
    return withAtlasSafetyProPanel([]);
  }
  return withAtlasSafetyProPanel(data ?? []);
}

export function splitTestPanels(panels: TestPanel[]) {
  return {
    packages: panels.filter((p) => p.category === 'package'),
    individual: panels.filter((p) => p.category !== 'package'),
  };
}

async function replaceSubmissionSamples(
  submissionId: string,
  samples: SampleDraft[],
  status: SubmissionStatus,
) {
  await supabase.from('submission_samples').delete().eq('submission_id', submissionId);

  if (samples.length === 0) return;

  const sampleRows = samples.map((s) => ({
    submission_id: submissionId,
    sample_number: generateSampleNumber(),
    product_name: s.product_name,
    batch_lot_number: s.batch_lot_number,
    sample_count: s.sample_count,
    panel_id: s.panel_id || null,
    panel_ids: s.panel_id ? [s.panel_id] : [],
    status,
  }));

  const { error: samplesError } = await supabase.from('submission_samples').insert(sampleRows);
  if (samplesError) throw samplesError;
}

async function upsertSubmissionRecord(
  userId: string,
  draft: SubmissionDraft,
  status: SubmissionStatus,
  existingId?: string,
): Promise<Submission> {
  const payload = {
    company_name: draft.company_name,
    contact_name: draft.contact_name,
    email: draft.email,
    phone: draft.phone,
    urgency: draft.urgency,
    notes: draft.notes,
    status,
    updated_at: new Date().toISOString(),
  };

  if (existingId) {
    const { data: existing } = await supabase
      .from('submissions')
      .select('id, status, user_id')
      .eq('id', existingId)
      .maybeSingle();

    if (!existing || existing.user_id !== userId) {
      throw new Error('Draft not found');
    }
    if (existing.status !== 'draft' && status === 'draft') {
      throw new Error('Only draft submissions can be saved as a draft');
    }

    const { error } = await supabase.from('submissions').update(payload).eq('id', existingId);
    if (error) throw error;
    await replaceSubmissionSamples(existingId, draft.samples, status);
    const full = await fetchSubmission(existingId);
    if (!full) throw new Error('Failed to load submission');
    return full;
  }

  const submissionNumber = generateSubmissionNumber();
  const { data: submission, error: subError } = await supabase
    .from('submissions')
    .insert({
      submission_number: submissionNumber,
      user_id: userId,
      ...payload,
    })
    .select()
    .single();

  if (subError || !submission) throw subError ?? new Error('Failed to create submission');
  await replaceSubmissionSamples(submission.id, draft.samples, status);
  const full = await fetchSubmission(submission.id);
  if (!full) throw new Error('Failed to load submission');
  return full;
}

export async function saveDraftSubmission(
  userId: string,
  draft: SubmissionDraft,
  existingId?: string,
): Promise<Submission> {
  const saved = await upsertSubmissionRecord(userId, draft, 'draft', existingId);

  if (!existingId) {
    await logStatusChange(saved.id, null, 'draft', 'Draft saved by client', null, userId);
  }

  return saved;
}

export async function submitDraftSubmission(
  userId: string,
  draft: SubmissionDraft,
  existingId?: string,
): Promise<Submission> {
  const previousStatus: SubmissionStatus | null = existingId
    ? ((await supabase.from('submissions').select('status').eq('id', existingId).maybeSingle()).data
        ?.status as SubmissionStatus) ?? 'draft'
    : null;

  const submission = await upsertSubmissionRecord(userId, draft, 'submitted', existingId);

  await logStatusChange(
    submission.id,
    previousStatus,
    'submitted',
    existingId ? 'Draft submitted by client' : 'Submission created by client',
    null,
    userId,
  );

  return submission;
}

export async function createSubmission(
  userId: string,
  draft: SubmissionDraft,
): Promise<Submission> {
  return submitDraftSubmission(userId, draft);
}

export async function fetchAllSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*, submission_samples(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateSubmissionStatus(
  submissionId: string,
  newStatus: SubmissionStatus,
  note: string,
  changedBy: string,
  sampleId?: string | null,
): Promise<void> {
  const { data: current } = await supabase
    .from('submissions')
    .select('status')
    .eq('id', submissionId)
    .single();

  const fromStatus = (current?.status as SubmissionStatus) ?? null;

  const { error } = await supabase
    .from('submissions')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', submissionId);

  if (error) throw error;

  if (sampleId) {
    const { error: sampleError } = await supabase
      .from('submission_samples')
      .update({ status: newStatus })
      .eq('id', sampleId);
    if (sampleError) throw sampleError;
  } else {
    const { error: sampleError } = await supabase
      .from('submission_samples')
      .update({ status: newStatus })
      .eq('submission_id', submissionId);
    if (sampleError) throw sampleError;
  }

  await logStatusChange(submissionId, fromStatus, newStatus, note, sampleId, changedBy);
}

export async function assignSamplePanel(
  sampleId: string,
  panelId: string,
  submissionId: string,
  changedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('submission_samples')
    .update({ panel_id: panelId, panel_ids: [panelId] })
    .eq('id', sampleId);

  if (error) throw error;

  await logStatusChange(
    submissionId,
    null,
    'in_testing',
    `Test panel assigned to sample`,
    sampleId,
    changedBy,
  );
}

export async function upsertSampleResult(
  sampleId: string,
  panelId: string | null,
  resultData: Record<string, unknown>,
  overallPass: boolean | null,
  enteredBy: string,
  submissionId: string,
): Promise<SubmissionResult> {
  const payload = {
    ...resultData,
    overall_pass: overallPass,
  };
  const { data: existing } = await supabase
    .from('submission_results')
    .select('id')
    .eq('sample_id', sampleId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('submission_results')
      .update({ result_data: payload, overall_pass: overallPass, entered_by: enteredBy })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    await logStatusChange(submissionId, null, 'in_testing', 'Result data updated', sampleId, enteredBy);
    return data;
  }

  const { data, error } = await supabase
    .from('submission_results')
    .insert({
      sample_id: sampleId,
      panel_id: panelId,
      result_data: payload,
      overall_pass: overallPass,
      entered_by: enteredBy,
    })
    .select()
    .single();

  if (error) throw error;
  await logStatusChange(submissionId, null, 'in_testing', 'Result data entered', sampleId, enteredBy);
  return data;
}

export async function releaseCOA(
  submission: Submission,
  sample: SubmissionSample,
  changedBy: string,
  panels: TestPanel[] = [],
): Promise<string> {
  const existing = await fetchCOAForSample(sample.id);
  if (existing?.slug) return existing.slug as string;

  const result = sample.submission_results?.[0];
  const panel = panels.find((p) => p.id === sample.panel_id);
  const slug = `${submission.submission_number.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sample.sample_number.slice(-4)}-${Math.random().toString(36).slice(2, 6)}`;
  const insertPayload = buildCOAInsertPayload(submission, sample, panel, result, slug);

  const { data: coa, error } = await supabase
    .from('coas')
    .insert(insertPayload)
    .select('slug')
    .single();

  if (error) throw error;

  await updateSubmissionStatus(submission.id, 'complete', 'COA released to client', changedBy, sample.id);
  return coa.slug;
}

export async function fetchCOAForSample(sampleId: string) {
  const { data } = await supabase
    .from('coas')
    .select('*')
    .eq('submission_sample_id', sampleId)
    .maybeSingle();
  return data;
}
