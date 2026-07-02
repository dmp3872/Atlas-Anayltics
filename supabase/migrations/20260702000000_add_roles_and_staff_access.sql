-- Role-based access: client (default), chemist, admin, verifier.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client';

-- Helper to read the current user's role. SECURITY DEFINER so it bypasses RLS
-- on user_profiles and cannot cause policy recursion.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ---- user_profiles: staff can view all; admins can update any ----
DROP POLICY IF EXISTS "Staff view all profiles" ON user_profiles;
CREATE POLICY "Staff view all profiles" ON user_profiles FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'));

DROP POLICY IF EXISTS "Admin update any profile" ON user_profiles;
CREATE POLICY "Admin update any profile" ON user_profiles FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ---- orders / samples: staff can view all ----
DROP POLICY IF EXISTS "Staff view all orders" ON orders;
CREATE POLICY "Staff view all orders" ON orders FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'));

DROP POLICY IF EXISTS "Staff view all samples" ON order_samples;
CREATE POLICY "Staff view all samples" ON order_samples FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'));

-- ---- coas: staff can fully manage (create/read/update/delete) any COA ----
DROP POLICY IF EXISTS "Staff manage all COAs" ON coas;
CREATE POLICY "Staff manage all COAs" ON coas FOR ALL TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

-- Promote the primary demo account to admin when that user exists.
UPDATE user_profiles SET role = 'admin'
WHERE id = 'd0931884-c3cb-4913-b103-cf9ed084b950'
  AND EXISTS (SELECT 1 FROM auth.users WHERE id = 'd0931884-c3cb-4913-b103-cf9ed084b950');
