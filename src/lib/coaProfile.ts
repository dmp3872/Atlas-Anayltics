import { supabase } from './supabase';
import { Company } from './types';

export interface CoaProfileInput {
  name: string;
  website?: string;
  email?: string;
  address?: string;
  logo?: string;
  chromatograph_background?: string;
}

export function normalizeCoaProfileInput(input: CoaProfileInput): CoaProfileInput {
  return {
    name: input.name.trim(),
    website: (input.website ?? '').trim(),
    email: (input.email ?? '').trim(),
    address: (input.address ?? '').trim(),
    logo: input.logo ?? '',
    chromatograph_background: input.chromatograph_background ?? '',
  };
}

export async function fetchUserCompanies(userId: string): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Keep user_profiles.company_name / company_logo aligned with the default COA profile. */
export async function syncDefaultCompanyToProfile(userId: string) {
  const { data } = await supabase
    .from('companies')
    .select('name, logo')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  await supabase
    .from('user_profiles')
    .update({ company_name: data?.name ?? '', company_logo: data?.logo ?? '' })
    .eq('id', userId);
}

export async function saveCoaProfile(
  userId: string,
  raw: CoaProfileInput,
  options: { editingId?: string; existingCount?: number; setAsDefault?: boolean } = {},
): Promise<{ company: Company | null; error: Error | null }> {
  const input = normalizeCoaProfileInput(raw);
  if (!input.name) {
    return { company: null, error: new Error('Company name is required.') };
  }

  const payload = {
    name: input.name,
    website: input.website,
    email: input.email,
    address: input.address,
    logo: input.logo,
    chromatograph_background: input.chromatograph_background,
  };

  if (options.editingId) {
    const { data, error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', options.editingId)
      .select()
      .single();
    if (error) return { company: null, error: new Error(error.message) };
    if (options.setAsDefault) {
      await supabase.from('companies').update({ is_default: false }).eq('user_id', userId);
      await supabase.from('companies').update({ is_default: true }).eq('id', options.editingId);
    }
    await syncDefaultCompanyToProfile(userId);
    return { company: data, error: null };
  }

  const isFirst = (options.existingCount ?? 0) === 0;
  const { data, error } = await supabase
    .from('companies')
    .insert({
      ...payload,
      user_id: userId,
      is_default: isFirst || options.setAsDefault,
    })
    .select()
    .single();

  if (error) return { company: null, error: new Error(error.message) };

  if (options.setAsDefault && !isFirst) {
    await supabase.from('companies').update({ is_default: false }).eq('user_id', userId);
    await supabase.from('companies').update({ is_default: true }).eq('id', data.id);
  }

  await syncDefaultCompanyToProfile(userId);
  return { company: data, error: null };
}

export function defaultCompany(companies: Company[]): Company | undefined {
  return companies.find(c => c.is_default) ?? companies[0];
}

export function coaAllowsBrandedCopy(coa: {
  coa_workflow_stage?: string | null;
  issued_at?: string | null;
}): boolean {
  const stage = coa.coa_workflow_stage || '';
  if (['issued', 'pending_review', 'verified', 'published'].includes(stage)) return true;
  return Boolean(coa.issued_at);
}

export type BrandedCoaPaymentMethod = 'card' | 'crypto' | 'prepaid';

export interface BrandedCoaCloneResult {
  id: string;
  slug: string;
  company_name: string;
  fee: number;
}

/** Clone an issued COA onto another of the owner's COA profiles after the $50 fee. */
export async function purchaseBrandedCoaCopy(opts: {
  sourceCoaId: string;
  companyId: string;
  paymentMethod: BrandedCoaPaymentMethod;
}): Promise<BrandedCoaCloneResult> {
  const { data, error } = await supabase.rpc('clone_coa_for_brand', {
    p_source_coa_id: opts.sourceCoaId,
    p_company_id: opts.companyId,
    p_payment_method: opts.paymentMethod,
  });
  if (error) {
    const missing = /could not find the function|schema cache/i.test(error.message);
    throw new Error(
      missing
        ? 'Branded COA checkout is not enabled on this database yet. Ask Atlas to apply the clone_coa_for_brand migration.'
        : error.message,
    );
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const slug = typeof row.slug === 'string' ? row.slug : '';
  if (!slug) throw new Error('Could not create the branded COA.');
  return {
    id: String(row.id ?? ''),
    slug,
    company_name: typeof row.company_name === 'string' ? row.company_name : '',
    fee: typeof row.fee === 'number' ? row.fee : 50,
  };
}
