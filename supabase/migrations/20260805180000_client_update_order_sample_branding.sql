-- Clients may update their own order samples so they can adjust COA branding
-- (metadata.brand_names) before certificates are issued.
DROP POLICY IF EXISTS "Users can update own order samples" ON public.order_samples;
CREATE POLICY "Users can update own order samples"
  ON public.order_samples FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
