import Stripe from 'stripe';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export type ApiReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiRes = {
  status: (code: number) => ApiRes;
  json: (body: unknown) => void;
  setHeader: (k: string, v: string) => void;
  end: () => void;
};

export const STRIPE_NOT_CONFIGURED = 'Card payments are not configured on the server.';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(res: ApiRes, status: number, body: unknown) {
  res.status(status).json(body);
}

export function header(req: ApiReq, name: string): string {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? (raw[0] || '') : String(raw || '');
}

export function applyCors(res: ApiRes) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

/** Applies CORS and answers OPTIONS / non-POST. Returns true when the request was handled. */
export function handlePreflight(req: ApiReq, res: ApiRes): boolean {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return true;
  }
  return false;
}

export function readBody<T extends Record<string, unknown>>(req: ApiReq): T {
  try {
    const parsed = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

let stripeClient: Stripe | null = null;

/** Returns null when STRIPE_SECRET_KEY is not set. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new HttpError(503, STRIPE_NOT_CONFIGURED);
  return stripe;
}

export function supabaseEnv() {
  return {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

export type AuthedContext = {
  user: User;
  userClient: SupabaseClient;
  /** Service-role client, or null when SUPABASE_SERVICE_ROLE_KEY is not set. */
  admin: SupabaseClient | null;
};

export async function requireUser(authHeader: string): Promise<AuthedContext> {
  if (!authHeader.startsWith('Bearer ') || authHeader.length <= 'Bearer '.length) {
    throw new HttpError(401, 'Sign in to continue.');
  }
  const { url, anon, service } = supabaseEnv();
  if (!url || !anon) {
    throw new HttpError(503, 'Server is not configured (missing Supabase keys).');
  }
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(authHeader.slice('Bearer '.length));
  if (error || !data.user) {
    throw new HttpError(401, 'Invalid or expired session. Sign in again.');
  }
  const admin = service
    ? createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  return { user: data.user, userClient, admin };
}

export function isKnownApiError(err: unknown): boolean {
  return err instanceof HttpError || err instanceof Stripe.errors.StripeError;
}

export function sendError(res: ApiRes, err: unknown, fallback: string) {
  if (err instanceof HttpError) return json(res, err.status, { error: err.message });
  if (err instanceof Stripe.errors.StripeError) {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? 400 : 502;
    return json(res, status, { error: err.message || fallback });
  }
  console.error(fallback, err instanceof Error ? err.message : err);
  return json(res, 500, { error: fallback });
}
