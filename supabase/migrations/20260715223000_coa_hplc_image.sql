-- Unique HPLC / chromatograph photo for each COA (watermark stays on chromatogram_image).
ALTER TABLE coas ADD COLUMN IF NOT EXISTS hplc_image text DEFAULT '';

COMMENT ON COLUMN coas.hplc_image IS
  'Chemist-uploaded chromatograph / HPLC trace photo for this COA. Company watermark is separate (chromatogram_image).';
