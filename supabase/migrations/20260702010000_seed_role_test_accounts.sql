-- Seed one test login per role. Idempotent: skips accounts that already exist.
-- Passwords are for local/testing only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
    UPDATE public.user_profiles p SET role = p_role
    FROM auth.users u WHERE u.email = p_email AND p.id = u.id;
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

  -- The on_auth_user_created trigger creates the profile row; set its role.
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (uid, p_full_name, p_role)
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
END;
$$;

SELECT public.seed_test_user('admin@atlaslabs.test',    'AdminPass123!',    'Atlas Admin',    'admin');
SELECT public.seed_test_user('chemist@atlaslabs.test',  'ChemistPass123!',  'Casey Chemist',  'chemist');
SELECT public.seed_test_user('verifier@atlaslabs.test', 'VerifierPass123!', 'Val Verifier',   'verifier');
SELECT public.seed_test_user('client@atlaslabs.test',   'ClientPass123!',   'Chris Client',   'client');

DROP FUNCTION public.seed_test_user(text, text, text, text);
