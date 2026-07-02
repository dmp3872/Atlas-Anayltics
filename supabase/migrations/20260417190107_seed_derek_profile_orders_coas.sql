/*
  # Seed Derek's demo account (optional)

  On a fresh Supabase project there is no auth user yet, so this migration is a no-op.
  After you sign up at /auth, use the app to create orders/COAs, or restore the full
  seed from git history if you need the demo dataset for a specific auth.users UUID.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = 'd0931884-c3cb-4913-b103-cf9ed084b950'
  ) THEN
    RAISE NOTICE 'Skipping Derek demo seed — auth user not present on this project.';
  END IF;
END $$;
