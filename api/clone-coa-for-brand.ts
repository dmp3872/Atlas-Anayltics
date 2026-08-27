import { cloneCoaForBrandServer, createBrandCheckoutClients } from './_lib/cloneCoaForBrandServer';

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
  sourceCoaId?: string;
  companyId?: string;
  paymentMethod?: string;
};

function json(res: Res, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

function header(req: Req, name: string): string {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? (raw[0] || '') : String(raw || '');
}

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
      error: 'Branded COA checkout is not configured on the server (missing Supabase keys).',
    });
  }

  const auth = header(req, 'authorization');
  if (!auth.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Sign in to purchase an additional COA.' });
  }

  let body: Body = {};
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as Body;
  } catch {
    return json(res, 400, { error: 'Invalid JSON body.' });
  }

  const sourceCoaId = String(body.sourceCoaId || '').trim();
  const companyId = String(body.companyId || '').trim();
  const paymentMethod = String(body.paymentMethod || 'card').trim().toLowerCase();
  if (!sourceCoaId || !companyId) {
    return json(res, 400, { error: 'sourceCoaId and companyId are required.' });
  }

  const { userClient, admin } = createBrandCheckoutClients({
    url,
    anon,
    service,
    authHeader: auth,
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json(res, 401, { error: 'Invalid or expired session. Sign in again.' });
  }

  try {
    const result = await cloneCoaForBrandServer({
      userClient,
      admin,
      userId: userData.user.id,
      sourceCoaId,
      companyId,
      paymentMethod,
    });
    return json(res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create the branded COA.';
    const status = /sign in|session/i.test(message)
      ? 401
      : /own certificates|forbidden/i.test(message)
        ? 403
        : /not found/i.test(message)
          ? 404
          : /invalid|select|already|maximum|prepaid|ready/i.test(message)
            ? 400
            : 500;
    return json(res, status, { error: message });
  }
}
