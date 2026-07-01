-- Add company logo (JPG/PNG stored as a base64 data URL) to user profiles.
-- Shown on Certificates of Analysis alongside the company name.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS company_logo text DEFAULT '';

-- Snapshot the company logo onto each COA so it renders on public certificates
-- (user_profiles is not publicly readable under RLS).
ALTER TABLE coas ADD COLUMN IF NOT EXISTS company_logo text DEFAULT '';
