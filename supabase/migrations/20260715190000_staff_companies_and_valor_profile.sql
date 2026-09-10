-- Staff need to read client COA profiles (logo + watermark) in the lab console.

DROP POLICY IF EXISTS "Staff view all companies" ON companies;
CREATE POLICY "Staff view all companies" ON companies
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier'));

-- Valor Peptides demo company seed removed.
