
/*
  # Demo customer profile seed

  Run AFTER creating the demo user in Supabase Auth:
  Email: demo.customer@atlas-analytics.test
  Password: DemoCustomer123!

  In Supabase Dashboard: Authentication → Users → Add user (auto-confirm email),
  then run this migration or paste in SQL Editor.
*/

DO $$
DECLARE
  demo_id uuid;
BEGIN
  SELECT id INTO demo_id
  FROM auth.users
  WHERE email = 'demo.customer@atlas-analytics.test'
  LIMIT 1;

  IF demo_id IS NULL THEN
    RAISE NOTICE 'Demo user not found — create demo.customer@atlas-analytics.test in Auth first.';
    RETURN;
  END IF;

  INSERT INTO user_profiles (
    id, full_name, company_name, phone, role, is_first_order
  ) VALUES (
    demo_id,
    'Demo Customer',
    'Summit Peptide Labs',
    '303-555-0142',
    'client',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    phone = EXCLUDED.phone,
    role = 'client';
END $$;
