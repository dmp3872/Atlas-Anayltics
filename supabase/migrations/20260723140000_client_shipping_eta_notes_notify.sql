/*
  Client portal UX:
  - Preboarded RFID shipping vs standard ship-in
  - Staff-editable estimated ready date (visible to clients)
  - Internal vs customer order notes
  - Email/SMS notification prefs on profiles
*/

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS shipping_preboarded boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_preboarded boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;

ALTER TABLE public.order_messages
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS order_messages_order_visibility_idx
  ON public.order_messages(order_id, is_internal, created_at);

-- Clients never see internal staff notes.
DROP POLICY IF EXISTS "Order owners view messages" ON public.order_messages;
CREATE POLICY "Order owners view messages"
  ON public.order_messages FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_messages.order_id
        AND orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Order owners add messages" ON public.order_messages;
CREATE POLICY "Order owners add messages"
  ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'client'
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_messages.order_id
        AND orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff view order messages" ON public.order_messages;
CREATE POLICY "Staff view order messages"
  ON public.order_messages FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'));

DROP POLICY IF EXISTS "Staff add order messages" ON public.order_messages;
CREATE POLICY "Staff add order messages"
  ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = public.current_user_role()
    AND public.current_user_role() IN ('chemist', 'admin')
  );
