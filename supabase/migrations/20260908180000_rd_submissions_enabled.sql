-- R&D pathway: admin-gated sample submissions (no COA). Default off.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS rd_submissions_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.rd_submissions_enabled IS
  'When true, this client account may place R&D (Purity & Quantity, $150, no COA) orders.';

-- Seed the demo client account for local/testing.
UPDATE public.user_profiles p
SET rd_submissions_enabled = true
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = 'client@atlaslabs.test';
