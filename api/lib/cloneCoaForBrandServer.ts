import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { POST_ISSUE_BRAND_FEE } from '../../src/lib/orderCatalog.js';
import { HttpError } from './stripeServer.js';

export const POST_ISSUE_BRAND_FEE_SERVER = POST_ISSUE_BRAND_FEE;
export const BRANDED_COA_IS_FREE = POST_ISSUE_BRAND_FEE_SERVER <= 0;
const MAX_BRANDS = 5;

export type CloneCoaBrandResult = {
  id: string;
  slug: string;
  company_name: string;
  fee: number;
};

function allocateSlug(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(now);
  const yy = parts.find(p => p.type === 'year')?.value ?? '26';
  const mm = parts.find(p => p.type === 'month')?.value ?? '08';
  let token = '';
  for (let i = 0; i < 6; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return `${yy}${mm}-${token}`;
}

/**
 * Load and validate the source COA + target company for a branded copy.
 * Runs before charging (create-payment-intent) and again before inserting.
 */
export async function loadBrandCloneContext(
  db: SupabaseClient,
  userId: string,
  sourceCoaId: string,
  companyId: string,
) {
  const { data: src, error: srcErr } = await db
    .from('coas')
    .select('*')
    .eq('id', sourceCoaId)
    .maybeSingle();
  if (srcErr || !src) throw new HttpError(404, 'Certificate not found.');
  if (src.user_id !== userId) {
    throw new HttpError(403, 'You can only brand your own certificates.');
  }
  const stage = String(src.coa_workflow_stage || '');
  if (!['issued', 'pending_review', 'verified', 'published'].includes(stage) && !src.issued_at) {
    throw new HttpError(400, 'This certificate is not ready to copy yet.');
  }

  const { data: company, error: companyErr } = await db
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();
  if (companyErr || !company || company.user_id !== userId) {
    throw new HttpError(400, 'Select one of your COA profiles.');
  }
  if (String(company.name || '').trim().toLowerCase() === String(src.company_name || '').trim().toLowerCase()) {
    throw new HttpError(400, `This certificate is already branded as ${company.name}.`);
  }

  let siblingsQuery = db.from('coas').select('id, company_name').eq('user_id', userId);
  if (src.sample_id) {
    siblingsQuery = siblingsQuery.eq('sample_id', src.sample_id);
  } else {
    siblingsQuery = siblingsQuery
      .eq('sample_name', src.sample_name)
      .eq('batch_number', src.batch_number);
  }
  const { data: siblings } = await siblingsQuery;
  const list = siblings || [];
  if (list.length >= MAX_BRANDS) {
    throw new HttpError(400, 'This sample already has the maximum number of branded COAs.');
  }
  if (list.some(c =>
    c.id !== src.id
    && String(c.company_name || '').trim().toLowerCase() === String(company.name || '').trim().toLowerCase()
  )) {
    throw new HttpError(400, `A COA for ${company.name} already exists for this sample.`);
  }
  return { src, company };
}

/**
 * Throws unless the PaymentIntent is a succeeded, unused $50 branded-COA charge
 * for this exact user / source COA / company.
 */
export async function verifyBrandedCoaPayment(opts: {
  stripe: Stripe;
  admin: SupabaseClient;
  userId: string;
  sourceCoaId: string;
  companyId: string;
  paymentIntentId: string;
}): Promise<string> {
  const pi = await opts.stripe.paymentIntents.retrieve(opts.paymentIntentId);
  if (pi.status !== 'succeeded') {
    throw new HttpError(400, 'Card payment has not completed.');
  }
  const meta = pi.metadata || {};
  if (
    pi.amount_received !== Math.round(POST_ISSUE_BRAND_FEE_SERVER * 100)
    || meta.purpose !== 'branded_coa'
    || meta.user_id !== opts.userId
    || meta.source_coa_id !== opts.sourceCoaId
    || meta.company_id !== opts.companyId
  ) {
    throw new HttpError(400, 'This payment does not match the requested branded COA.');
  }
  const { data: used, error: usedErr } = await opts.admin
    .from('coas')
    .select('id')
    .eq('result_summary->branded_copy_purchase->>payment_intent_id', pi.id)
    .limit(1);
  if (usedErr) throw new Error(usedErr.message);
  if (used && used.length > 0) {
    throw new HttpError(409, 'This payment was already used for a branded COA.');
  }
  return pi.id;
}

/**
 * Clone an issued COA onto another brand profile.
 * Prepaid tries the DB RPC first (when migration is applied), then service-role insert.
 * Card requires a verified PaymentIntent and always uses the service-role insert.
 */
export async function cloneCoaForBrandServer(opts: {
  userClient: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  sourceCoaId: string;
  companyId: string;
  paymentMethod: string;
  /** Verified PaymentIntent id; required when paymentMethod is 'card'. */
  paymentIntentId?: string;
}): Promise<CloneCoaBrandResult> {
  const requested = opts.paymentMethod.trim().toLowerCase();
  if (requested === 'crypto') {
    throw new HttpError(400, 'Crypto checkout is not available for additional COAs yet.');
  }
  const paymentMethod = BRANDED_COA_IS_FREE ? 'free' : requested;
  if (!['card', 'prepaid', 'free'].includes(paymentMethod) || (paymentMethod === 'free' && !BRANDED_COA_IS_FREE)) {
    throw new HttpError(400, 'Invalid payment method.');
  }
  if (paymentMethod === 'card' && !opts.paymentIntentId) {
    throw new HttpError(400, 'paymentIntentId is required for card payments.');
  }

  if (paymentMethod === 'prepaid' || paymentMethod === 'free') {
    const userRpc = await opts.userClient.rpc('clone_coa_for_brand', {
      p_source_coa_id: opts.sourceCoaId,
      p_company_id: opts.companyId,
      p_payment_method: paymentMethod,
    });
    if (!userRpc.error && userRpc.data) {
      const row = userRpc.data as Record<string, unknown>;
      if (typeof row.slug === 'string' && row.slug) {
        return {
          id: String(row.id ?? ''),
          slug: row.slug,
          company_name: typeof row.company_name === 'string' ? row.company_name : '',
          fee: typeof row.fee === 'number' ? row.fee : POST_ISSUE_BRAND_FEE_SERVER,
        };
      }
    }
  }

  const { src, company } = await loadBrandCloneContext(
    opts.admin,
    opts.userId,
    opts.sourceCoaId,
    opts.companyId,
  );

  if (paymentMethod === 'prepaid') {
    const { data: profile } = await opts.admin
      .from('user_profiles')
      .select('prepaid_balance')
      .eq('id', opts.userId)
      .maybeSingle();
    const balance = Number(profile?.prepaid_balance ?? 0);
    if (balance < POST_ISSUE_BRAND_FEE_SERVER) {
      throw new Error('Prepaid balance is too low for this branded COA.');
    }
    const { error: debitErr } = await opts.admin
      .from('user_profiles')
      .update({ prepaid_balance: balance - POST_ISSUE_BRAND_FEE_SERVER })
      .eq('id', opts.userId);
    if (debitErr) throw new Error(debitErr.message);
  }

  const summary = (src.result_summary && typeof src.result_summary === 'object')
    ? { ...(src.result_summary as Record<string, unknown>) }
    : {};
  delete summary.vial_image;
  delete summary.chromatogram_image;
  delete summary.hplc_image;
  delete summary.company_logo;
  const log = Array.isArray(summary.update_log) ? [...summary.update_log] : [];
  log.push({
    at: new Date().toISOString(),
    by: 'Client',
    note: BRANDED_COA_IS_FREE
      ? `Branded copy issued for ${company.name} (no charge)`
      : `Branded copy issued for ${company.name} ($${POST_ISSUE_BRAND_FEE_SERVER})`,
  });
  summary.coa_profile_id = company.id;
  summary.apply_company_logo = true;
  summary.apply_watermark = !!company.chromatograph_background;
  summary.branded_from_coa_id = src.id;
  summary.client_website = company.website || summary.client_website || summary.website || '';
  summary.client_address = company.address || summary.client_address || summary.address || '';
  summary.website = company.website || summary.website || '';
  summary.address = company.address || summary.address || '';
  summary.branded_copy_purchase = {
    amount: POST_ISSUE_BRAND_FEE_SERVER,
    payment_method: paymentMethod,
    at: new Date().toISOString(),
    ...(paymentMethod === 'card' ? { payment_intent_id: opts.paymentIntentId } : {}),
  };
  summary.update_log = log.slice(-24);

  let slug = allocateSlug();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: taken } = await opts.admin.from('coas').select('id').eq('slug', slug).maybeSingle();
    if (!taken) break;
    slug = allocateSlug();
  }

  const payload = {
    user_id: src.user_id,
    sample_id: src.sample_id,
    order_id: src.order_id,
    slug,
    sample_name: src.sample_name,
    display_name: src.display_name,
    company_name: company.name,
    company_logo: company.logo || '',
    peptide_sequence: src.peptide_sequence,
    batch_number: src.batch_number,
    purity_percent: src.purity_percent,
    molecular_weight: src.molecular_weight,
    result_summary: summary,
    panel_results: src.panel_results,
    chromatogram_data: src.chromatogram_data,
    overall_result: src.overall_result,
    is_public: src.is_public,
    content_hash: src.content_hash,
    signature: src.signature,
    pdf_url: '',
    vial_image: src.vial_image || '',
    // Never carry the source brand's HPLC watermark onto a different company.
    chromatogram_image: company.chromatograph_background || '',
    hplc_image: src.hplc_image || '',
    seal_serial: src.seal_serial,
    accession_number: src.accession_number,
    coa_workflow_stage: src.coa_workflow_stage || 'issued',
    verified_at: src.verified_at,
    verified_by: src.verified_by,
    review_assigned_to: src.review_assigned_to,
    published_at: src.published_at,
    issued_at: src.issued_at || new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await opts.admin
    .from('coas')
    .insert(payload)
    .select('id, slug, company_name')
    .single();
  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || 'Could not create the branded COA.');
  }

  await opts.admin.from('coa_brand_purchases').insert({
    user_id: opts.userId,
    source_coa_id: src.id,
    new_coa_id: inserted.id,
    company_id: company.id,
    amount: POST_ISSUE_BRAND_FEE_SERVER,
    payment_method: paymentMethod,
  });

  if (src.order_id && POST_ISSUE_BRAND_FEE_SERVER > 0) {
    const { data: order } = await opts.admin
      .from('orders')
      .select('total, subtotal')
      .eq('id', src.order_id)
      .eq('user_id', opts.userId)
      .maybeSingle();
    if (order) {
      await opts.admin.from('orders').update({
        total: Number(order.total || 0) + POST_ISSUE_BRAND_FEE_SERVER,
        subtotal: Number(order.subtotal || 0) + POST_ISSUE_BRAND_FEE_SERVER,
      }).eq('id', src.order_id);
    }
  }

  return {
    id: inserted.id,
    slug: inserted.slug,
    company_name: inserted.company_name,
    fee: POST_ISSUE_BRAND_FEE_SERVER,
  };
}

export function createBrandCheckoutClients(env: {
  url: string;
  anon: string;
  service: string;
  authHeader: string;
}) {
  const userClient = createClient(env.url, env.anon, {
    global: { headers: { Authorization: env.authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userClient, admin };
}
