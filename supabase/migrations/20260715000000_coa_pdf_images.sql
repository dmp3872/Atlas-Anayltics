-- Per-COA vial photo and chromatogram image for fillable PDF generation
ALTER TABLE coas ADD COLUMN IF NOT EXISTS vial_image text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS chromatogram_image text DEFAULT '';
