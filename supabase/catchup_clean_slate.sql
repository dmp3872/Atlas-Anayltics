-- =============================================================================
-- Atlas Analytics — catch-up SQL (run once in Supabase SQL Editor)
-- Idempotent: safe to re-run.
--
-- Does:
--   1) Schema catch-up (COA workflow, images, sample codes, staff policies)
--   2) Wipe all operational demo data (keeps test_panels + auth)
--   3) Ensure all test logins + Brad chemist
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Schema catch-up
-- -----------------------------------------------------------------------------

ALTER TABLE coas ADD COLUMN IF NOT EXISTS vial_image text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS chromatogram_image text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS company_logo text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS hplc_image text DEFAULT '';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS review_assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE order_samples ADD COLUMN IF NOT EXISTS received_at timestamptz;

COMMENT ON COLUMN order_samples.received_at IS
  'When the sample was physically accessioned / intaked at the lab. Used as COA RECEIVED DATE.';
COMMENT ON COLUMN coas.hplc_image IS
  'Chemist-uploaded chromatograph / HPLC trace photo for this COA.';
COMMENT ON COLUMN coas.review_assigned_to IS
  'Lab director or chemist assigned to provide the second signature (pending_review stage).';

-- Latest COA workflow stages (includes testing_in_progress + pending_review)
ALTER TABLE coas DROP CONSTRAINT IF EXISTS coas_coa_workflow_stage_check;
ALTER TABLE coas ADD CONSTRAINT coas_coa_workflow_stage_check
  CHECK (coa_workflow_stage IN (
    'awaiting_info',
    'testing_in_progress',
    'issued',
    'pending_review',
    'verified',
    'published'
  ));

-- Strip oversized inline images that freeze the browser
UPDATE coas SET vial_image = '' WHERE length(coalesce(vial_image, '')) > 400000;
UPDATE coas SET chromatogram_image = '' WHERE length(coalesce(chromatogram_image, '')) > 400000;
UPDATE coas SET company_logo = '' WHERE length(coalesce(company_logo, '')) > 400000;
UPDATE companies SET logo = '' WHERE length(coalesce(logo, '')) > 400000;
UPDATE companies SET chromatograph_background = '' WHERE length(coalesce(chromatograph_background, '')) > 400000;

-- Move snapshotted images out of result_summary JSON into columns
UPDATE coas
SET
  vial_image = COALESCE(NULLIF(vial_image, ''), NULLIF(result_summary->>'vial_image', ''), ''),
  chromatogram_image = COALESCE(NULLIF(chromatogram_image, ''), NULLIF(result_summary->>'chromatogram_image', ''), ''),
  company_logo = COALESCE(NULLIF(company_logo, ''), NULLIF(result_summary->>'company_logo', ''), '')
WHERE
  result_summary ? 'vial_image'
  OR result_summary ? 'chromatogram_image'
  OR result_summary ? 'company_logo';

UPDATE coas
SET result_summary = (result_summary - 'vial_image' - 'chromatogram_image' - 'company_logo')
WHERE
  result_summary ? 'vial_image'
  OR result_summary ? 'chromatogram_image'
  OR result_summary ? 'company_logo';

-- Sample codes / COA slugs: YY-XXXXXX
CREATE OR REPLACE FUNCTION public.generate_sample_code(p_created_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  yy text;
  token text := '';
  i int;
  idx int;
BEGIN
  yy := to_char(COALESCE(p_created_at, now()), 'YY');
  FOR i IN 1..6 LOOP
    idx := 1 + floor(random() * length(alphabet))::int;
    token := token || substr(alphabet, idx, 1);
  END LOOP;
  RETURN yy || '-' || token;
END;
$$;

ALTER TABLE public.coas
  ALTER COLUMN slug SET DEFAULT public.generate_sample_code();

-- Staff COA + company policies
DROP POLICY IF EXISTS "Users can insert own COAs" ON coas;
DROP POLICY IF EXISTS "Users can update own COAs" ON coas;
DROP POLICY IF EXISTS "Staff manage all COAs" ON coas;
DROP POLICY IF EXISTS "Chemist manage all COAs" ON coas;
DROP POLICY IF EXISTS "Admin view all COAs" ON coas;
DROP POLICY IF EXISTS "Staff manage COA PDF assets" ON coas;

CREATE POLICY "Staff manage all COAs" ON coas FOR ALL TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

DROP POLICY IF EXISTS "Staff view all companies" ON companies;
CREATE POLICY "Staff view all companies" ON companies
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier'));

-- -----------------------------------------------------------------------------
-- 2) Wipe operational data (keeps auth users, profiles, test_panels)
-- -----------------------------------------------------------------------------

TRUNCATE TABLE
  submission_results,
  submission_status_history,
  order_status_history,
  coas,
  submission_samples,
  order_samples,
  submissions,
  orders,
  peptide_requests,
  notification_queue,
  api_keys,
  companies
RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- 3) Ensure test logins + Brad
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_test_user(
  p_email text, p_password text, p_full_name text, p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  uid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    UPDATE public.user_profiles p
    SET role = p_role, full_name = p_full_name
    FROM auth.users u
    WHERE u.email = p_email AND p.id = u.id;

    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || json_build_object('full_name', p_full_name)::jsonb,
        updated_at = now()
    WHERE email = p_email;
    RETURN;
  END IF;

  uid := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('full_name', p_full_name)::jsonb,
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), uid,
    json_build_object('sub', uid::text, 'email', p_email)::jsonb,
    'email', p_email, now(), now(), now()
  );

  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (uid, p_full_name, p_role)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
END;
$$;

SELECT public.seed_test_user('admin@atlaslabs.test',    'AdminPass123!',    'Atlas Admin',    'admin');
SELECT public.seed_test_user('chemist@atlaslabs.test',  'ChemistPass123!',  'Casey Chemist',  'chemist');
SELECT public.seed_test_user('verifier@atlaslabs.test', 'VerifierPass123!', 'Val Verifier',   'verifier');
SELECT public.seed_test_user('client@atlaslabs.test',   'ClientPass123!',   'Chris Client',   'client');
SELECT public.seed_test_user('brad123@atlaslabs.test',  'test123!',         'D. Brad Martin', 'chemist');

DROP FUNCTION public.seed_test_user(text, text, text, text);

-- -----------------------------------------------------------------------------
-- 4) Quick verify
-- -----------------------------------------------------------------------------

SELECT email FROM auth.users ORDER BY email;

SELECT
  (SELECT count(*) FROM orders) AS orders,
  (SELECT count(*) FROM coas) AS coas,
  (SELECT count(*) FROM submissions) AS submissions,
  (SELECT count(*) FROM companies) AS companies,
  (SELECT count(*) FROM test_panels) AS test_panels,
  (SELECT count(*) FROM user_profiles) AS user_profiles;
