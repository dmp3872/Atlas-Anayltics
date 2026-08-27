import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const POST_ISSUE_BRAND_FEE_SERVER = 50;
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
 * Clone an issued COA onto another brand profile.
 * Tries the DB RPC first (when migration is applied), then service-role insert.
 */
export async function cloneCoaForBrandServer(opts: {
  userClient: SupabaseClient;
  admin: SupabaseClient;
  userId: string;
  sourceCoaId: string;
  companyId: string;
  paymentMethod: string;
}): Promise<CloneCoaBrandResult> {
  const paymentMethod = opts.paymentMethod.trim().toLowerCase();
  if (!['card', 'crypto', 'prepaid'].includes(paymentMethod)) {
    throw new Error('Invalid payment method.');
  }

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

  const { data: src, error: srcErr } = await opts.admin
    .from('coas')
    .select('*')
    .eq('id', opts.sourceCoaId)
    .maybeSingle();
  if (srcErr || !src) throw new Error('Certificate not found.');
  if (src.user_id !== opts.userId) {
    throw new Error('You can only brand your own certificates.');
  }
  const stage = String(src.coa_workflow_stage || '');
  if (!['issued', 'pending_review', 'verified', 'published'].includes(stage) && !src.issued_at) {
    throw new Error('This certificate is not ready to copy yet.');
  }

  const { data: company, error: companyErr } = await opts.admin
    .from('companies')
    .select('*')
    .eq('id', opts.companyId)
    .maybeSingle();
  if (companyErr || !company || company.user_id !== opts.userId) {
    throw new Error('Select one of your COA profiles.');
  }
  if (String(company.name || '').trim().toLowerCase() === String(src.company_name || '').trim().toLowerCase()) {
    throw new Error(`This certificate is already branded as ${company.name}.`);
  }

  let siblingsQuery = opts.admin.from('coas').select('id, company_name').eq('user_id', opts.userId);
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
    throw new Error('This sample already has the maximum number of branded COAs.');
  }
  if (list.some(c =>
    c.id !== src.id
    && String(c.company_name || '').trim().toLowerCase() === String(company.name || '').trim().toLowerCase()
  )) {
    throw new Error(`A COA for ${company.name} already exists for this sample.`);
  }

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
    note: `Branded copy issued for ${company.name} ($${POST_ISSUE_BRAND_FEE_SERVER})`,
  });
  summary.coa_profile_id = company.id;
  summary.apply_company_logo = true;
  summary.apply_watermark = true;
  summary.branded_from_coa_id = src.id;
  summary.client_website = company.website || summary.client_website || summary.website || '';
  summary.client_address = company.address || summary.client_address || summary.address || '';
  summary.website = company.website || summary.website || '';
  summary.address = company.address || summary.address || '';
  summary.branded_copy_purchase = {
    amount: POST_ISSUE_BRAND_FEE_SERVER,
    payment_method: paymentMethod,
    at: new Date().toISOString(),
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
    company_logo: company.logo || src.company_logo || '',
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
    chromatogram_image: company.chromatograph_background || src.chromatogram_image || '',
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

  if (src.order_id) {
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
