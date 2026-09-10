-- Dedicated customer live chat (bottom-right widget).
-- Routing: client ↔ admin only. Admin may forward to chemists.
-- Chemists NEVER message clients directly (staff visibility only).

CREATE TABLE IF NOT EXISTS public.live_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  -- waiting_admin: client messaged, needs admin
  -- waiting_chemist: admin forwarded to a chemist
  -- waiting_client: admin replied to customer
  -- closed: done
  status text NOT NULL DEFAULT 'waiting_admin'
    CHECK (status IN ('waiting_admin', 'waiting_chemist', 'waiting_client', 'closed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_chat_threads_user_order_uidx
  ON public.live_chat_threads (user_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS live_chat_threads_user_updated_idx
  ON public.live_chat_threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS live_chat_threads_admin_queue_idx
  ON public.live_chat_threads (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS live_chat_threads_chemist_queue_idx
  ON public.live_chat_threads (assigned_to, status, last_message_at DESC)
  WHERE assigned_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.live_chat_threads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role text NOT NULL
    CHECK (author_role IN ('client', 'assistant', 'chemist', 'admin')),
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  -- customer = client widget can see · staff = admin + assigned chemist only
  visibility text NOT NULL DEFAULT 'customer'
    CHECK (visibility IN ('customer', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_chat_messages_body_length
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS live_chat_messages_thread_created_idx
  ON public.live_chat_messages (thread_id, created_at);

CREATE INDEX IF NOT EXISTS live_chat_messages_thread_visibility_idx
  ON public.live_chat_messages (thread_id, visibility, created_at);

-- Hard rule: chemists can never author a customer-visible message.
CREATE OR REPLACE FUNCTION public.live_chat_enforce_message_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.author_role IN ('client', 'assistant') THEN
    NEW.visibility := 'customer';
  ELSIF NEW.author_role = 'chemist' THEN
    NEW.visibility := 'staff';
  ELSIF NEW.author_role = 'admin' THEN
    IF NEW.visibility IS NULL OR btrim(NEW.visibility) = '' THEN
      NEW.visibility := 'customer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_chat_messages_enforce_rules ON public.live_chat_messages;
CREATE TRIGGER live_chat_messages_enforce_rules
  BEFORE INSERT OR UPDATE ON public.live_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.live_chat_enforce_message_rules();

-- Bump thread timestamps/status after every message (runs as definer so clients can trigger it).
CREATE OR REPLACE FUNCTION public.live_chat_after_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_chat_threads
  SET
    last_message_at = NEW.created_at,
    updated_at = NEW.created_at,
    status = CASE
      WHEN NEW.author_role = 'client' THEN 'waiting_admin'
      WHEN NEW.author_role = 'chemist' THEN 'waiting_admin'
      WHEN NEW.author_role = 'admin' AND NEW.visibility = 'customer' THEN 'waiting_client'
      WHEN NEW.author_role = 'admin' AND NEW.visibility = 'staff' THEN COALESCE(status, 'waiting_chemist')
      ELSE status
    END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_chat_messages_after_insert ON public.live_chat_messages;
CREATE TRIGGER live_chat_messages_after_insert
  AFTER INSERT ON public.live_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.live_chat_after_message();

ALTER TABLE public.live_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

-- —— Threads ——
DROP POLICY IF EXISTS "Clients view own live chat threads" ON public.live_chat_threads;
DROP POLICY IF EXISTS "Clients create own live chat threads" ON public.live_chat_threads;
DROP POLICY IF EXISTS "Clients update own live chat threads" ON public.live_chat_threads;
DROP POLICY IF EXISTS "Admins manage live chat threads" ON public.live_chat_threads;
DROP POLICY IF EXISTS "Chemists view assigned live chat threads" ON public.live_chat_threads;

CREATE POLICY "Clients view own live chat threads"
  ON public.live_chat_threads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Clients create own live chat threads"
  ON public.live_chat_threads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      order_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.orders
        WHERE orders.id = live_chat_threads.order_id
          AND orders.user_id = auth.uid()
      )
    )
  );

-- Clients do not reassign threads; only touch updated_at via message side-effects from app if needed.
-- Admins own routing.
CREATE POLICY "Admins manage live chat threads"
  ON public.live_chat_threads FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Chemists view assigned live chat threads"
  ON public.live_chat_threads FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'chemist'
    AND assigned_to = auth.uid()
  );

-- —— Messages ——
DROP POLICY IF EXISTS "Participants view live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Clients add live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Staff add live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Clients view customer live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Admins view all live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Chemists view assigned live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Admins add live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Chemists add staff live chat messages" ON public.live_chat_messages;
DROP POLICY IF EXISTS "Clients add customer live chat messages" ON public.live_chat_messages;

CREATE POLICY "Clients view customer live chat messages"
  ON public.live_chat_messages FOR SELECT TO authenticated
  USING (
    visibility = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.live_chat_threads t
      WHERE t.id = live_chat_messages.thread_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins view all live chat messages"
  ON public.live_chat_messages FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

CREATE POLICY "Chemists view assigned live chat messages"
  ON public.live_chat_messages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'chemist'
    AND EXISTS (
      SELECT 1 FROM public.live_chat_threads t
      WHERE t.id = live_chat_messages.thread_id
        AND t.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Clients add customer live chat messages"
  ON public.live_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role IN ('client', 'assistant')
    AND visibility = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.live_chat_threads t
      WHERE t.id = live_chat_messages.thread_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins add live chat messages"
  ON public.live_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'admin'
    AND public.current_user_role() = 'admin'
    AND visibility IN ('customer', 'staff')
  );

-- Chemists may only post staff-internal notes on threads assigned to them.
CREATE POLICY "Chemists add staff live chat messages"
  ON public.live_chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'chemist'
    AND visibility = 'staff'
    AND public.current_user_role() = 'chemist'
    AND EXISTS (
      SELECT 1 FROM public.live_chat_threads t
      WHERE t.id = live_chat_messages.thread_id
        AND t.assigned_to = auth.uid()
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
