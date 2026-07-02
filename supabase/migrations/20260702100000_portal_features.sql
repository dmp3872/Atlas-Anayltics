-- Peptide requests (clients ask for new peptides to be added to catalog)
CREATE TABLE IF NOT EXISTS peptide_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peptide_name text NOT NULL DEFAULT '',
  cas_number text DEFAULT '',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE peptide_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own peptide requests"
  ON peptide_requests FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Staff view all peptide requests"
  ON peptide_requests FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'));

-- Tamper-evident seal serial on certificates (premium / physical link)
ALTER TABLE coas ADD COLUMN IF NOT EXISTS seal_serial text DEFAULT '';

-- Prepaid shipping label reference on orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_label_id text DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'card';

-- Notification queue (processed by edge function / cron in production)
CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON notification_queue FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notifications"
  ON notification_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
