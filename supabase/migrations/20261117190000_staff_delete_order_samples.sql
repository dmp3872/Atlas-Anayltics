-- Allow chemists/admins to delete order samples from the lab console.
-- COAs already have "Staff manage all COAs" FOR ALL (includes DELETE).

DROP POLICY IF EXISTS "Staff delete samples" ON public.order_samples;
CREATE POLICY "Staff delete samples" ON public.order_samples
  FOR DELETE TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'));
