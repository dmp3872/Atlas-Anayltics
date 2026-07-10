-- Production lab spine: payment, receiving states, sample accession, audit, SLA, verifier.

-- ---- Orders: payment + awaiting_sample + due_at ----
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'waived', 'refunded'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_note text DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS due_at timestamptz;

-- Widen order status to include awaiting_sample
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('received', 'awaiting_sample', 'processing', 'analyzing', 'in_review', 'complete', 'cancelled'));

COMMENT ON COLUMN orders.payment_status IS 'Manual payment confirmation until Stripe: unpaid|paid|waived|refunded.';
COMMENT ON COLUMN orders.due_at IS 'SLA due date set when first sample is physically received.';

-- ---- Order samples: accession + awaiting_sample status ----
ALTER TABLE order_samples ADD COLUMN IF NOT EXISTS accession_number text DEFAULT '';

ALTER TABLE order_samples DROP CONSTRAINT IF EXISTS order_samples_status_check;
ALTER TABLE order_samples ADD CONSTRAINT order_samples_status_check
  CHECK (status IN ('awaiting_sample', 'received', 'analyzing', 'in_review', 'complete'));

COMMENT ON COLUMN order_samples.accession_number IS 'Bench accession assigned at physical receipt (distinct from COA accession_number).';

-- Existing in-flight samples that were auto-marked received on checkout stay as-is.
-- New checkouts will insert awaiting_sample.

-- ---- COAs: verified_by ----
ALTER TABLE coas ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN coas.verified_by IS 'User who moved the COA to verified stage.';

-- ---- Audit: order_status_history ----
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sample_id uuid REFERENCES order_samples(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_sample_id ON order_status_history(sample_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_due_at ON orders(due_at);
CREATE INDEX IF NOT EXISTS idx_order_samples_accession ON order_samples(accession_number);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients view own order history" ON order_status_history;
CREATE POLICY "Clients view own order history" ON order_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_status_history.order_id
        AND o.user_id = auth.uid()
    )
    OR public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier')
  );

DROP POLICY IF EXISTS "Staff insert order history" ON order_status_history;
CREATE POLICY "Staff insert order history" ON order_status_history FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier'));

DROP POLICY IF EXISTS "Clients insert own order history" ON order_status_history;
CREATE POLICY "Clients insert own order history" ON order_status_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_status_history.order_id
        AND o.user_id = auth.uid()
    )
  );

-- ---- Notifications: staff can queue emails for clients ----
DROP POLICY IF EXISTS "Staff insert notifications for clients" ON notification_queue;
CREATE POLICY "Staff insert notifications for clients" ON notification_queue FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier')
  );

-- ---- Verifier: read/update private COAs in pipeline ----
DROP POLICY IF EXISTS "Verifier view pipeline COAs" ON coas;
CREATE POLICY "Verifier view pipeline COAs" ON coas FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'verifier'
    AND (
      is_public = true
      OR COALESCE(coa_workflow_stage, 'issued') IN ('issued', 'awaiting_info', 'verified', 'published')
    )
  );

DROP POLICY IF EXISTS "Verifier update pipeline COAs" ON coas;
CREATE POLICY "Verifier update pipeline COAs" ON coas FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'verifier'
    AND COALESCE(coa_workflow_stage, 'issued') IN ('issued', 'awaiting_info', 'verified')
  )
  WITH CHECK (
    public.current_user_role() = 'verifier'
    AND COALESCE(coa_workflow_stage, 'issued') IN ('issued', 'awaiting_info', 'verified', 'published')
  );
