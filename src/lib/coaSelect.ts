/**
 * Column sets for COA queries.
 * Never select image blobs on list views — multi‑MB base64 in result_summary / image
 * columns freezes the browser when loading many rows (or even a single heavy COA).
 */

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
  'company_logo',
].join(', ');
