-- Companies let a single account manage multiple brands / sister companies
-- (e.g. "Flawless" and "Glow"), each with its own name and logo for COAs.
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  logo text DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_user_id_idx ON companies(user_id);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own companies"
  ON companies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own companies"
  ON companies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reuse the shared updated_at trigger function.
DROP TRIGGER IF EXISTS companies_updated_at ON companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION public.set_user_profiles_updated_at();

-- Seed each existing account's current company info as its default company.
INSERT INTO companies (user_id, name, logo, is_default)
SELECT up.id, COALESCE(up.company_name, ''), COALESCE(up.company_logo, ''), true
FROM user_profiles up
WHERE (COALESCE(up.company_name, '') <> '' OR COALESCE(up.company_logo, '') <> '')
  AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.user_id = up.id);
