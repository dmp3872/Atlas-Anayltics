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
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

export async function createSubmission(
  userId: string,
  draft: SubmissionDraft,
): Promise<Submission> {
  const submissionNumber = generateSubmissionNumber();
  const initialStatus: SubmissionStatus = 'submitted';

  const { data: submission, error: subError } = await supabase
    .from('submissions')
    .insert({
      submission_number: submissionNumber,
      user_id: userId,
      company_name: draft.company_name,
      contact_name: draft.contact_name,
      email: draft.email,
      phone: draft.phone,
      urgency: draft.urgency,
      notes: draft.notes,
      status: initialStatus,
    })
    .select()
    .single();

  if (subError || !submission) throw subError ?? new Error('Failed to create submission');

  const sampleRows = draft.samples.map((s) => ({
    submission_id: submission.id,
    sample_number: generateSampleNumber(),
    product_name: s.product_name,
    batch_lot_number: s.batch_lot_number,
    sample_count: s.sample_count,
    panel_id: s.panel_id || null,
    panel_ids: s.panel_id ? [s.panel_id] : [],
    status: initialStatus,
  }));

  const { error: samplesError } = await supabase.from('submission_samples').insert(sampleRows);
  if (samplesError) throw samplesError;

  await logStatusChange(
    submission.id,
    null,
    'submitted',
    'Submission created by client',
    null,
    userId,
  );

  const full = await fetchSubmission(submission.id);
  if (!full) throw new Error('Failed to load submission');
  return full;
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
  const { data: existing } = await supabase
    .from('submission_results')
    .select('id')
    .eq('sample_id', sampleId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('submission_results')
      .update({ result_data: resultData, overall_pass: overallPass, entered_by: enteredBy })
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
      result_data: resultData,
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
): Promise<string> {
  const slug = Math.random().toString(36).slice(2, 14);
  const { data: coa, error } = await supabase
    .from('coas')
    .insert({
      user_id: submission.user_id,
      submission_sample_id: sample.id,
      sample_name: sample.product_name,
      display_name: sample.product_name,
      company_name: submission.company_name,
      batch_number: sample.batch_lot_number,
      slug,
      overall_result: 'pass',
      is_public: false,
      pdf_url: '',
      panel_results: [],
    })
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
