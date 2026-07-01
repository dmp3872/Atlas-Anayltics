-- Expand companies into full COA profiles. Everything here can be rendered on
-- the final certificate: contact details plus branding imagery.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email text DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address text DEFAULT '';
-- Base64 data URL for a custom chromatogram background image (PNG preferred).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS chromatograph_background text DEFAULT '';
