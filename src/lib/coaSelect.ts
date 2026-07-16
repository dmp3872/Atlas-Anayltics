/**
 * Column sets for COA queries.
 * Never select image blobs on list views — multi‑MB base64 in result_summary / image
 * columns freezes the browser when loading many rows (or even a single heavy COA).
 */

import { supabase } from './supabase';
import type { COA } from './types';

/** Lightweight list / queue / portal table rows. */
export const COA_LIST_COLUMNS = [
  'id',
  'user_id',
  'sample_id',
  'order_id',
  'slug',
  'sample_name',
  'display_name',
  'company_name',
  'batch_number',
  'peptide_sequence',
  'purity_percent',
  'molecular_weight',
  'overall_result',
  'is_public',
  'issued_at',
  'verified_at',
  'published_at',
  'coa_workflow_stage',
  'seal_serial',
  'content_hash',
  'signature',
  'verified_by',
  'review_assigned_to',
  'panel_results',
  'chromatogram_data',
].join(', ');

/**
 * Detail page fields without image blobs.
 * Images are loaded in a second request so the certificate shell paints first.
 */
export const COA_DETAIL_COLUMNS = [
  COA_LIST_COLUMNS,
  'result_summary',
].join(', ');

/** Image columns only (may be multi‑MB — fetch alone after shell render). */
export const COA_IMAGE_COLUMNS = [
  'id',
  'vial_image',
  'chromatogram_image',
  'hplc_image',
  'company_logo',
].join(', ');

/** Legacy schemas before `hplc_image` migrated. */
export const COA_IMAGE_COLUMNS_LEGACY = [
  'id',
  'vial_image',
  'chromatogram_image',
  'company_logo',
].join(', ');

export type CoaImageRow = Pick<COA, 'vial_image' | 'chromatogram_image' | 'hplc_image' | 'company_logo'> & {
  id: string;
};

/**
 * Load COA image blobs. Falls back when `hplc_image` is not migrated yet —
 * otherwise PostgREST rejects the whole select and vial/chromatogram never load.
 */
export async function fetchCoaImageRow(id: string): Promise<CoaImageRow | null> {
  // Also pull result_summary so HPLC/vial survive when image columns are missing or empty.
  const withSummary = `${COA_IMAGE_COLUMNS}, result_summary`;
  let row: Record<string, unknown> | null = null;

  const full = await supabase.from('coas').select(withSummary).eq('id', id).maybeSingle();
  if (!full.error && full.data) {
    row = full.data as Record<string, unknown>;
  } else {
    const msg = full.error?.message || '';
    if (full.error && !/hplc_image|schema cache|result_summary/i.test(msg)) {
      console.warn('COA image load failed:', msg);
      return null;
    }
    const legacyCols = `${COA_IMAGE_COLUMNS_LEGACY}, result_summary`;
    const legacy = await supabase.from('coas').select(legacyCols).eq('id', id).maybeSingle();
    if (legacy.error || !legacy.data) {
      // Last resort: image columns only (no summary).
      const bare = await supabase.from('coas').select(COA_IMAGE_COLUMNS_LEGACY).eq('id', id).maybeSingle();
      if (bare.error || !bare.data) {
        if (legacy.error) console.warn('COA image load failed:', legacy.error.message);
        return null;
      }
      row = { ...(bare.data as object), hplc_image: '', result_summary: null };
    } else {
      row = { ...(legacy.data as object), hplc_image: (legacy.data as { hplc_image?: string }).hplc_image || '' };
    }
  }

  const summary =
    row.result_summary && typeof row.result_summary === 'object' && !Array.isArray(row.result_summary)
      ? (row.result_summary as Record<string, unknown>)
      : {};
  const pick = (col: string) => {
    const fromCol = typeof row![col] === 'string' ? (row![col] as string).trim() : '';
    const fromSummary = typeof summary[col] === 'string' ? (summary[col] as string).trim() : '';
    return fromCol || fromSummary || '';
  };

  return {
    id: String(row.id),
    vial_image: pick('vial_image'),
    chromatogram_image: pick('chromatogram_image'),
    hplc_image: pick('hplc_image'),
    company_logo: pick('company_logo'),
  };
}
