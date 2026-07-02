-- COA workflow: issued → verified → published (public)
ALTER TABLE coas ADD COLUMN IF NOT EXISTS coa_workflow_stage text NOT NULL DEFAULT 'issued';
ALTER TABLE coas ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE coas ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE coas DROP CONSTRAINT IF EXISTS coas_coa_workflow_stage_check;
ALTER TABLE coas ADD CONSTRAINT coas_coa_workflow_stage_check
  CHECK (coa_workflow_stage IN ('issued', 'verified', 'published'));

UPDATE coas SET coa_workflow_stage = 'published', published_at = COALESCE(published_at, issued_at)
WHERE is_public = true AND coa_workflow_stage = 'issued';

UPDATE coas SET coa_workflow_stage = 'verified', verified_at = COALESCE(verified_at, issued_at)
WHERE is_public = false AND coa_workflow_stage = 'issued'
  AND content_hash IS NOT NULL AND content_hash <> '';

-- Chemist/admin can update orders and samples
DROP POLICY IF EXISTS "Staff update all orders" ON orders;
CREATE POLICY "Staff update all orders" ON orders FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

DROP POLICY IF EXISTS "Staff update all samples" ON order_samples;
CREATE POLICY "Staff update all samples" ON order_samples FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

-- Verifier: read companies + all public COAs (public policy already covers COAs)
DROP POLICY IF EXISTS "Verifier view companies" ON companies;
CREATE POLICY "Verifier view companies" ON companies FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('verifier', 'admin'));

DROP POLICY IF EXISTS "Verifier view public coas" ON coas;
CREATE POLICY "Verifier view public coas" ON coas FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('verifier', 'admin') AND is_public = true);

-- Verifier can mark COAs verified (optional QA step before chemist publishes)
DROP POLICY IF EXISTS "Verifier update coa verification" ON coas;
CREATE POLICY "Verifier update coa verification" ON coas FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('verifier', 'admin')
    AND coa_workflow_stage IN ('issued', 'verified')
  )
  WITH CHECK (
    public.current_user_role() IN ('verifier', 'admin')
    AND coa_workflow_stage IN ('verified', 'published')
  );
