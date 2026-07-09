-- Lab queue assignment: chemist assignment + sample-level priority override,
-- and staff roles needed to run the full lab (chemist, verifier).

ALTER TABLE order_samples ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE order_samples ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE order_samples ADD COLUMN IF NOT EXISTS lab_priority text;

ALTER TABLE order_samples DROP CONSTRAINT IF EXISTS order_samples_lab_priority_check;
ALTER TABLE order_samples ADD CONSTRAINT order_samples_lab_priority_check
  CHECK (lab_priority IS NULL OR lab_priority IN ('normal', 'high', 'urgent'));

COMMENT ON COLUMN order_samples.assigned_to IS 'Chemist/verifier (auth.users) currently working this sample in the lab queue.';
COMMENT ON COLUMN order_samples.assigned_at IS 'When the sample was assigned to assigned_to.';
COMMENT ON COLUMN order_samples.lab_priority IS 'Sample-level priority override (normal/high/urgent). NULL means inherit the parent order''s lab_priority.';

-- Backfill: orders marked rush that never got bumped to a higher lab_priority
-- (e.g. created before priority tracking existed) should read as high priority.
UPDATE orders
SET lab_priority = 'high'
WHERE rush_processing = true
  AND lab_priority = 'normal';

-- Widen user_profiles role check to cover the full staff roster used by the lab.
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('client', 'admin', 'reviewer', 'chemist', 'verifier'));
