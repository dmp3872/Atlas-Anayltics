-- Staff checklist actions spawned from order notes; must clear before publish.

CREATE TABLE IF NOT EXISTS public.order_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sample_id uuid REFERENCES public.order_samples(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES public.order_messages(id) ON DELETE SET NULL,
  title text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_name text NOT NULL DEFAULT '',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_action_items_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS order_action_items_order_open_idx
  ON public.order_action_items(order_id, created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.order_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Order owners view action items" ON public.order_action_items;
CREATE POLICY "Order owners view action items"
  ON public.order_action_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_action_items.order_id
        AND orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff manage order action items" ON public.order_action_items;
CREATE POLICY "Staff manage order action items"
  ON public.order_action_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_action_items;
