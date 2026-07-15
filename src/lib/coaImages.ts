import { supabase } from './supabase';
import { COA } from './types';

export interface CoaPdfStats {
  /** Shown under Average Net Peptide Content (e.g. "12.4 mg"). */
  avg_net_peptide_content: string;
  /** Number for "Mean of _ vials tested". */
  mean_of_vials_tested: string;
  /** Optional Average Purity value (e.g. "99.1%"). */
  avg_purity?: string;
}

export function readCoaPdfStats(coa: COA): CoaPdfStats {
  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const content =
    (typeof summary.avg_net_peptide_content === 'string' && summary.avg_net_peptide_content) ||
    '';
  const mean =
    (typeof summary.mean_of_vials_tested === 'string' && summary.mean_of_vials_tested) ||
    (typeof summary.vial_count === 'number' && String(summary.vial_count)) ||
    (typeof summary.vials_tested === 'string' && summary.vials_tested) ||
    '';
  const purity =
    (typeof summary.avg_purity === 'string' && summary.avg_purity) ||
    (coa.purity_percent != null ? `${coa.purity_percent}%` : '');

  return {
    avg_net_peptide_content: content,
    mean_of_vials_tested: mean,
    avg_purity: purity,
  };
}

/** Prefer dedicated columns; fall back to result_summary until migration is applied. */
export function hydrateCoaImages(coa: COA): COA {
  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const vialFromSummary = typeof summary.vial_image === 'string' ? summary.vial_image : '';
  const chromFromSummary = typeof summary.chromatogram_image === 'string' ? summary.chromatogram_image : '';
  return {
    ...coa,
    vial_image: coa.vial_image || vialFromSummary || '',
    chromatogram_image: coa.chromatogram_image || chromFromSummary || '',
  };
}

export function isMissingCoaImageColumnError(message: string): boolean {
  return /vial_image|chromatogram_image|schema cache/i.test(message);
}

/** Strip image columns and stash them on result_summary for legacy schemas. */
export function payloadWithoutImageColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const vial_image = typeof payload.vial_image === 'string' ? payload.vial_image : '';
  const chromatogram_image = typeof payload.chromatogram_image === 'string' ? payload.chromatogram_image : '';
  const { vial_image: _v, chromatogram_image: _c, result_summary, ...rest } = payload;
  const summary =
    result_summary && typeof result_summary === 'object' && !Array.isArray(result_summary)
      ? (result_summary as Record<string, unknown>)
      : {};
  return {
    ...rest,
    result_summary: {
      ...summary,
      vial_image,
      chromatogram_image,
    },
  };
}

export type CoaPdfPrepPayload = {
  vial_image: string;
  chromatogram_image: string;
  avg_net_peptide_content: string;
  mean_of_vials_tested: string;
  avg_purity?: string;
};

/** Persist PDF images + Average Net Peptide Content stats for generation. */
export async function saveCoaPdfPrep(
  coa: COA,
  prep: CoaPdfPrepPayload,
): Promise<{ coa: COA; error: string | null }> {
  const hydrated = hydrateCoaImages(coa);
  const baseSummary = {
    ...((coa.result_summary && typeof coa.result_summary === 'object' ? coa.result_summary : {}) as Record<string, unknown>),
    vial_image: prep.vial_image || '',
    chromatogram_image: prep.chromatogram_image || '',
    avg_net_peptide_content: prep.avg_net_peptide_content.trim(),
    mean_of_vials_tested: prep.mean_of_vials_tested.trim(),
    avg_purity: (prep.avg_purity ?? '').trim(),
    vials_tested: prep.mean_of_vials_tested.trim(),
  };

  const next: COA = {
    ...hydrated,
    vial_image: prep.vial_image,
    chromatogram_image: prep.chromatogram_image,
    result_summary: baseSummary,
  };

  const direct = {
    vial_image: prep.vial_image || '',
    chromatogram_image: prep.chromatogram_image || '',
    result_summary: baseSummary,
  };

  const { error } = await supabase.from('coas').update(direct).eq('id', coa.id);
  if (!error) return { coa: next, error: null };

  if (!isMissingCoaImageColumnError(error.message)) {
    return { coa: hydrated, error: error.message };
  }

  const fallback = await supabase
    .from('coas')
    .update({ result_summary: baseSummary })
    .eq('id', coa.id);
  if (fallback.error) return { coa: hydrated, error: fallback.error.message };

  return { coa: next, error: null };
}

/** @deprecated use saveCoaPdfPrep */
export async function saveCoaPdfImages(
  coa: COA,
  images: { vial_image: string; chromatogram_image: string },
): Promise<{ coa: COA; error: string | null }> {
  const stats = readCoaPdfStats(coa);
  return saveCoaPdfPrep(coa, { ...images, ...stats });
}

/** Company / profile logo used as chromatogram watermark on the PDF. */
export async function resolveCoaLogoWatermark(coa: COA): Promise<string> {
  if (coa.company_logo?.startsWith('data:image/')) return coa.company_logo;

  const { data: company } = await supabase
    .from('companies')
    .select('logo')
    .eq('user_id', coa.user_id)
    .eq('is_default', true)
    .maybeSingle();

  if (typeof company?.logo === 'string' && company.logo.startsWith('data:image/')) {
    return company.logo;
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('company_logo')
    .eq('id', coa.user_id)
    .maybeSingle();

  if (typeof profile?.company_logo === 'string' && profile.company_logo.startsWith('data:image/')) {
    return profile.company_logo;
  }

  return '';
}
