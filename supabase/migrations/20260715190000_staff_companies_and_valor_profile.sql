-- Staff need to read client COA profiles (logo + watermark) in the lab console.

DROP POLICY IF EXISTS "Staff view all companies" ON companies;
CREATE POLICY "Staff view all companies" ON companies
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier'));

-- Ensure demo client has a Valor Peptides COA profile (selectable in lab Issue flow).
DO $$
DECLARE
  client_id uuid;
BEGIN
  SELECT id INTO client_id FROM auth.users WHERE email = 'client@atlaslabs.test' LIMIT 1;
  IF client_id IS NULL THEN
    RAISE NOTICE 'Skipping Valor Peptides company seed — client@atlaslabs.test not found.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM companies WHERE user_id = client_id AND lower(trim(name)) = 'valor peptides'
  ) THEN
    RAISE NOTICE 'Valor Peptides profile already exists for client@atlaslabs.test.';
    RETURN;
  END IF;

  INSERT INTO companies (user_id, name, logo, website, email, address, chromatograph_background, is_default)
  VALUES (
    client_id,
    'Valor Peptides',
    '',
    'https://valorpeptides.example.com',
    'lab@valorpeptides.example.com',
    '',
    '',
    false
  );
END $$;
