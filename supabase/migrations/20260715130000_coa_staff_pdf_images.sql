-- Chemists and admins can manage COA content (including vial/chromatogram images for PDF generation).
-- Clients retain read access to their own / public COAs; they cannot write COA content.

DROP POLICY IF EXISTS "Users can insert own COAs" ON coas;
DROP POLICY IF EXISTS "Users can update own COAs" ON coas;
DROP POLICY IF EXISTS "Staff manage all COAs" ON coas;
DROP POLICY IF EXISTS "Chemist manage all COAs" ON coas;
DROP POLICY IF EXISTS "Admin view all COAs" ON coas;
DROP POLICY IF EXISTS "Staff manage COA PDF assets" ON coas;

CREATE POLICY "Staff manage all COAs" ON coas FOR ALL TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));
