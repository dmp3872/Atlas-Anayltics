
/*
  # Atlas Safety Pro Package

  All-in-one testing bundle for client submissions and pricing.
*/

INSERT INTO test_panels (name, description, price_per_sample, turnaround_days, category, is_active, sort_order)
SELECT
  'Atlas Safety Pro Package',
  'Complete safety bundle per sample: HPLC Purity, Net Content, Identity (ID), Heavy Metals, Endotoxin (LAL), Sterility (PCR), Fentanyl Detection, and 3 Conformity Vials included.',
  700.00,
  10,
  'package',
  true,
  -1
WHERE NOT EXISTS (
  SELECT 1 FROM test_panels WHERE name = 'Atlas Safety Pro Package'
);
