-- Staff can create orders and samples for any client (lab intake)
DROP POLICY IF EXISTS "Staff insert orders" ON orders;
CREATE POLICY "Staff insert orders" ON orders FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

DROP POLICY IF EXISTS "Staff insert samples" ON order_samples;
CREATE POLICY "Staff insert samples" ON order_samples FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));
