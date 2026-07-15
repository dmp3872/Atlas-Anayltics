-- Ensure dedicated image columns exist (may already be present from earlier migrations).
ALTER TABLE coas ADD COLUMN IF NOT EXISTS vial_image text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS chromatogram_image text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS company_logo text DEFAULT '';

-- Move snapshotted images out of result_summary JSON into columns (when column is empty).
UPDATE coas
SET
  vial_image = COALESCE(NULLIF(vial_image, ''), NULLIF(result_summary->>'vial_image', ''), ''),
  chromatogram_image = COALESCE(NULLIF(chromatogram_image, ''), NULLIF(result_summary->>'chromatogram_image', ''), ''),
  company_logo = COALESCE(NULLIF(company_logo, ''), NULLIF(result_summary->>'company_logo', ''), '')
WHERE
  result_summary ? 'vial_image'
  OR result_summary ? 'chromatogram_image'
  OR result_summary ? 'company_logo';

-- Drop inline base64 from JSON so selects no longer pull multi‑MB payloads twice.
UPDATE coas
SET result_summary = (result_summary - 'vial_image' - 'chromatogram_image' - 'company_logo')
WHERE
  result_summary ? 'vial_image'
  OR result_summary ? 'chromatogram_image'
  OR result_summary ? 'company_logo';

-- Drop oversized inline images that freeze browser tabs (~800KB base64 ≈ 600KB file).
-- Re-upload via Lab → Prepare with a smaller photo; profile watermarks still apply.
UPDATE coas SET vial_image = '' WHERE length(coalesce(vial_image, '')) > 800000;
UPDATE coas SET chromatogram_image = '' WHERE length(coalesce(chromatogram_image, '')) > 800000;
UPDATE coas SET company_logo = '' WHERE length(coalesce(company_logo, '')) > 800000;
