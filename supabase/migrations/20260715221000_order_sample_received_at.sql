-- Physical lab intake timestamp — drives COA "Received Date".
ALTER TABLE order_samples ADD COLUMN IF NOT EXISTS received_at timestamptz;

COMMENT ON COLUMN order_samples.received_at IS
  'When the sample was physically accessioned / intaked at the lab. Used as COA RECEIVED DATE.';

-- Backfill from order status history (first transition to received for that sample).
UPDATE order_samples s
SET received_at = h.first_received
FROM (
  SELECT sample_id, MIN(created_at) AS first_received
  FROM order_status_history
  WHERE sample_id IS NOT NULL
    AND to_status = 'received'
  GROUP BY sample_id
) h
WHERE s.id = h.sample_id
  AND s.received_at IS NULL;

-- Samples already past awaiting_sample with no history row: use created_at.
UPDATE order_samples
SET received_at = created_at
WHERE received_at IS NULL
  AND status IN ('received', 'analyzing', 'in_review', 'complete');
