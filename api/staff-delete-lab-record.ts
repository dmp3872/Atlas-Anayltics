import { createClient } from '@supabase/supabase-js';

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (k: string, v: string) => void;
  end: () => void;
};

type Body = {
  sampleId?: string;
  coaId?: string;
};

function json(res: Res, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

function header(req: Req, name: string): string {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? (raw[0] || '') : String(raw || '');
}

function isStaffRole(role: unknown): boolean {
  return role === 'chemist' || role === 'admin';
}

/**
 * Chemist/admin delete for lab ops:
 * - sampleId → delete that sample and every COA linked to it
 * - coaId → delete that certificate only
 */
export default async function handler(req: Req, res: Res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anon || !service) {
    return json(res, 503, {
      error: 'Delete is not configured on the server (missing Supabase keys).',
    });
  }

  const auth = header(req, 'authorization');
  if (!auth.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Sign in to delete lab records.' });
  }

  let body: Body = {};
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as Body;
  } catch {
    return json(res, 400, { error: 'Invalid JSON body.' });
  }

  const sampleId = String(body.sampleId || '').trim();
  const coaId = String(body.coaId || '').trim();
  if (!sampleId && !coaId) {
    return json(res, 400, { error: 'sampleId or coaId is required.' });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json(res, 401, { error: 'Invalid or expired session. Sign in again.' });
  }

  const { data: profile, error: profileErr } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileErr) {
    return json(res, 500, { error: profileErr.message || 'Could not verify staff role.' });
  }
  if (!isStaffRole(profile?.role)) {
    return json(res, 403, { error: 'Only chemists and admins can delete samples or certificates.' });
  }

  try {
    if (sampleId) {
      const { data: sample, error: sampleErr } = await admin
        .from('order_samples')
        .select('id, sample_name, display_name, accession_number')
        .eq('id', sampleId)
        .maybeSingle();
      if (sampleErr) throw new Error(sampleErr.message);
      if (!sample) return json(res, 404, { error: 'Sample not found.' });

      const { data: linkedCoas, error: listErr } = await admin
        .from('coas')
        .select('id')
        .eq('sample_id', sampleId);
      if (listErr) throw new Error(listErr.message);

      const coaIds = (linkedCoas || []).map(c => c.id);
      if (coaIds.length) {
        const { error: delCoasErr } = await admin.from('coas').delete().in('id', coaIds);
        if (delCoasErr) throw new Error(delCoasErr.message);
      }

      const { error: delSampleErr } = await admin.from('order_samples').delete().eq('id', sampleId);
      if (delSampleErr) throw new Error(delSampleErr.message);

      return json(res, 200, {
        ok: true,
        deleted: 'sample',
        sampleId,
        coasDeleted: coaIds.length,
        sampleName: sample.display_name || sample.sample_name || '',
        accession: sample.accession_number || '',
      });
    }

    const { data: coa, error: coaErr } = await admin
      .from('coas')
      .select('id, slug, sample_name, accession_number')
      .eq('id', coaId)
      .maybeSingle();
    if (coaErr) throw new Error(coaErr.message);
    if (!coa) return json(res, 404, { error: 'Certificate not found.' });

    const { error: delErr } = await admin.from('coas').delete().eq('id', coaId);
    if (delErr) throw new Error(delErr.message);

    return json(res, 200, {
      ok: true,
      deleted: 'coa',
      coaId,
      slug: coa.slug || '',
      sampleName: coa.sample_name || '',
      accession: coa.accession_number || '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed.';
    return json(res, 500, { error: message });
  }
}
