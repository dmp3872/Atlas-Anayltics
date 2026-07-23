-- Client/staff order conversation and durable one-time COA-ready acknowledgements.

CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role text NOT NULL DEFAULT public.current_user_role(),
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_messages_body_length
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  CONSTRAINT order_messages_author_role
    CHECK (author_role IN ('client', 'chemist', 'admin'))
);

CREATE INDEX IF NOT EXISTS order_messages_order_created_idx
  ON public.order_messages(order_id, created_at);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order owners view messages" ON public.order_messages;
CREATE POLICY "Order owners view messages"
  ON public.order_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
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

CREATE TABLE IF NOT EXISTS public.coa_celebration_seen (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coa_id uuid NOT NULL REFERENCES public.coas(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, coa_id)
);

ALTER TABLE public.coa_celebration_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own COA celebrations" ON public.coa_celebration_seen;
CREATE POLICY "Users manage own COA celebrations"
  ON public.coa_celebration_seen FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.coas
      WHERE coas.id = coa_celebration_seen.coa_id
        AND coas.user_id = auth.uid()
    )
  );

-- Required for live message updates. This migration is applied once, so the
-- publication entry cannot be duplicated by normal migration execution.
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
