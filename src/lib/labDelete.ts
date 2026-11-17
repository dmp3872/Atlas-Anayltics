import { supabase } from './supabase';

export type LabDeleteResult = {
  ok: true;
  deleted: 'sample' | 'coa';
  sampleId?: string;
  coaId?: string;
  coasDeleted?: number;
  sampleName?: string;
  accession?: string;
  slug?: string;
};

async function authToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in to delete lab records.');
  return token;
}

async function callStaffDeleteApi(body: {
  sampleId?: string;
  coaId?: string;
}): Promise<LabDeleteResult | null> {
  const token = await authToken();
  try {
    const res = await fetch('/api/staff-delete-lab-record', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    // Local Vite often returns SPA HTML for unknown /api paths.
    if (!isJson) return null;
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const apiError = typeof payload.error === 'string' ? payload.error.trim() : '';
      if (/not configured|missing Supabase keys/i.test(apiError)) return null;
      throw new Error(apiError || 'Delete failed.');
    }
    return payload as LabDeleteResult;
  } catch (err) {
    if (err instanceof Error && /Failed to fetch|NetworkError/i.test(err.message)) return null;
    throw err;
  }
}

/** Delete a sample and every COA linked to it. */
export async function deleteSampleAndCoas(sampleId: string): Promise<LabDeleteResult> {
  const viaApi = await callStaffDeleteApi({ sampleId });
  if (viaApi) return viaApi;

  const { data: linked, error: listErr } = await supabase
    .from('coas')
    .select('id')
    .eq('sample_id', sampleId);
  if (listErr) throw new Error(listErr.message);

  const coaIds = (linked || []).map(c => c.id);
  if (coaIds.length) {
    const { error: delCoasErr } = await supabase.from('coas').delete().in('id', coaIds);
    if (delCoasErr) throw new Error(delCoasErr.message);
  }

  const { error: delSampleErr } = await supabase.from('order_samples').delete().eq('id', sampleId);
  if (delSampleErr) {
    throw new Error(
      delSampleErr.message.includes('policy') || /permission|row-level/i.test(delSampleErr.message)
        ? 'Could not delete the sample (database permission). Deploy the staff delete API or apply the staff delete migration.'
        : delSampleErr.message,
    );
  }

  return {
    ok: true,
    deleted: 'sample',
    sampleId,
    coasDeleted: coaIds.length,
  };
}

/** Delete a single certificate. */
export async function deleteCoaRecord(coaId: string): Promise<LabDeleteResult> {
  const viaApi = await callStaffDeleteApi({ coaId });
  if (viaApi) return viaApi;

  const { error } = await supabase.from('coas').delete().eq('id', coaId);
  if (error) throw new Error(error.message);
  return { ok: true, deleted: 'coa', coaId };
}
