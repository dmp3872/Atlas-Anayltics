/*
  Full QC Panel catalog update
  - Price: $400
  - Scope: identity, purity, quantity, sterility (no heavy metals / endotoxin)
  - Idempotent upsert by name; does not rewrite historical order metadata
*/

INSERT INTO test_panels (name, description, price_per_sample, turnaround_days, category, is_active, sort_order)
SELECT
  'Full QC Panel',
  'Identity confirmation, purity analysis (%), quantity verification, and sterility (PCR).',
  400.00,
  5,
  'package',
  true,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM test_panels WHERE name = 'Full QC Panel'
);

UPDATE test_panels
SET
  description = 'Identity confirmation, purity analysis (%), quantity verification, and sterility (PCR).',
  price_per_sample = 400.00,
  turnaround_days = 5,
  category = 'package',
  is_active = true
WHERE name = 'Full QC Panel';
