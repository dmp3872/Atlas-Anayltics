-- Lab queue priority for admin → chemist color-coded testing queue
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lab_priority text NOT NULL DEFAULT 'normal';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_lab_priority_check;
ALTER TABLE orders ADD CONSTRAINT orders_lab_priority_check
  CHECK (lab_priority IN ('normal', 'high', 'urgent'));
