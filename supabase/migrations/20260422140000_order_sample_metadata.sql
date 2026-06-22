/*
  # Order sample metadata + ILS-style seed products

  Adds JSONB metadata column for rich wizard fields (batch, matrix, tests, brands, etc.)
  and seeds ION-3RT / KLOW / ARA-290 orders + COAs for the demo account.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_samples' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE order_samples ADD COLUMN metadata jsonb DEFAULT NULL;
  END IF;
END $$;

-- ============================================================
-- ILS-style products for derekpruski@gmail.com demo account
-- ============================================================

INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000006-0000-0000-0000-000000000006',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-20260418-3301',
  'complete',
  false,
  'ILS-style 8X full panel batch release',
  1500.00, 0, 0, 1500.00, false,
  'Apex Research Group',
  NOW() - INTERVAL '18 days',
  NOW() - INTERVAL '10 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, created_at)
VALUES
  (
    'b0000006-0000-0000-0000-000000000001',
    'a0000006-0000-0000-0000-000000000006',
    '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
    'ION-3RT', 'ION-3RT 10mg', 'single', 3, '{}', 'complete',
    '{"batch_number":"LOT-2026-001","labeled_content":"10mg","vial_size":"3mL","sample_matrix":"Lyophilized","is_peptide":true,"peptide_identification":"ION-3RT","test_mode":"full_qc","tests_label":"Full QC Panel","line_total":500}'::jsonb,
    NOW() - INTERVAL '18 days'
  ),
  (
    'b0000006-0000-0000-0000-000000000002',
    'a0000006-0000-0000-0000-000000000006',
    '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
    'KLOW', 'KLOW 80mg', 'blend', 3, '{}', 'complete',
    '{"batch_number":"KLOW-BATCH-442","labeled_content":"80mg","vial_size":"10mL","sample_matrix":"Lyophilized","is_peptide":true,"peptide_identification":"KLOW Blend","test_mode":"full_qc","tests_label":"Full QC Panel","line_total":500}'::jsonb,
    NOW() - INTERVAL '18 days'
  ),
  (
    'b0000006-0000-0000-0000-000000000003',
    'a0000006-0000-0000-0000-000000000006',
    '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
    'ARA-290', 'ARA-290 10mg', 'single', 3, '{}', 'complete',
    '{"batch_number":"ARA-290-2026-A","labeled_content":"10mg","vial_size":"3mL","sample_matrix":"Lyophilized","is_peptide":true,"peptide_identification":"ARA-290","test_mode":"full_qc","tests_label":"Full QC Panel","line_total":500}'::jsonb,
    NOW() - INTERVAL '18 days'
  )
ON CONFLICT (id) DO NOTHING;

-- COAs with 8-test panel results (~99% purity)
INSERT INTO coas (id, sample_id, order_id, user_id, slug, sample_name, display_name, company_name, peptide_sequence, batch_number, purity_percent, molecular_weight, panel_results, chromatogram_data, overall_result, is_public, content_hash, signature, issued_at)
VALUES
(
  'c0000006-0000-0000-0000-000000000001',
  'b0000006-0000-0000-0000-000000000001',
  'a0000006-0000-0000-0000-000000000006',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'dp-ion3rt-2026',
  'ION-3RT', 'ION-3RT 10mg', 'Apex Research Group', 'ION-3RT', 'LOT-2026-001', 99.2, 1187.4,
  '[
    {"panel_name":"Purity & Quantitation (HPLC)","result":"99.2%","specification":"≥95.0%","pass":true},
    {"panel_name":"Identity Confirmation (MS)","result":"1187.4 Da","specification":"±2 Da","pass":true},
    {"panel_name":"Net Content (Weight)","result":"10.08 mg","specification":"10.0 ± 1.0 mg","pass":true},
    {"panel_name":"Endotoxin (USP <85>)","result":"0.12 EU/mg","specification":"<1.0 EU/mg","pass":true},
    {"panel_name":"Heavy Metals (ICP-MS)","result":"Not Detected","specification":"Not Detected","pass":true},
    {"panel_name":"Sterility (PCR)","result":"No growth detected","specification":"Sterile","pass":true},
    {"panel_name":"Microbial Screen","result":"Pass","specification":"Pass","pass":true},
    {"panel_name":"Visual Inspection","result":"Pass","specification":"Pass","pass":true}
  ]'::jsonb,
  '{"retention_time":9.44,"peak_area":2941200,"points":[{"x":0,"y":0.01},{"x":4,"y":0.03},{"x":8,"y":0.05},{"x":9.44,"y":0.97},{"x":10,"y":0.62},{"x":12,"y":0.04},{"x":16,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
  'pass', false, 'sha256:ion3rt2026', 'AA-ION3RT-001', NOW() - INTERVAL '10 days'
),
(
  'c0000006-0000-0000-0000-000000000002',
  'b0000006-0000-0000-0000-000000000002',
  'a0000006-0000-0000-0000-000000000006',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'dp-klow-2026',
  'KLOW', 'KLOW 80mg', 'Apex Research Group', 'KLOW Blend', 'KLOW-BATCH-442', 98.9, null,
  '[
    {"panel_name":"Purity & Quantitation (HPLC)","result":"98.9%","specification":"≥95.0%","pass":true},
    {"panel_name":"Identity Confirmation (MS)","result":"Confirmed blend components","specification":"Match reference","pass":true},
    {"panel_name":"Net Content (Weight)","result":"80.4 mg","specification":"80 ± 5 mg","pass":true},
    {"panel_name":"Endotoxin (USP <85>)","result":"0.08 EU/mg","specification":"<1.0 EU/mg","pass":true},
    {"panel_name":"Heavy Metals (ICP-MS)","result":"Not Detected","specification":"Not Detected","pass":true},
    {"panel_name":"Sterility (PCR)","result":"No growth detected","specification":"Sterile","pass":true},
    {"panel_name":"Blend Ratio Verification","result":"Within spec","specification":"±5%","pass":true},
    {"panel_name":"Visual Inspection","result":"Pass","specification":"Pass","pass":true}
  ]'::jsonb,
  '{"retention_time":11.2,"peak_area":3104500,"points":[{"x":0,"y":0.01},{"x":5,"y":0.04},{"x":10,"y":0.06},{"x":11.2,"y":0.94},{"x":12,"y":0.58},{"x":14,"y":0.05},{"x":18,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
  'pass', false, 'sha256:klow2026', 'AA-KLOW-001', NOW() - INTERVAL '10 days'
),
(
  'c0000006-0000-0000-0000-000000000003',
  'b0000006-0000-0000-0000-000000000003',
  'a0000006-0000-0000-0000-000000000006',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'dp-ara290-2026',
  'ARA-290', 'ARA-290 10mg', 'Apex Research Group', 'ARA-290', 'ARA-290-2026-A', 99.0, 1026.2,
  '[
    {"panel_name":"Purity & Quantitation (HPLC)","result":"99.0%","specification":"≥95.0%","pass":true},
    {"panel_name":"Identity Confirmation (MS)","result":"1026.2 Da","specification":"±1 Da","pass":true},
    {"panel_name":"Net Content (Weight)","result":"10.02 mg","specification":"10.0 ± 1.0 mg","pass":true},
    {"panel_name":"Endotoxin (USP <85>)","result":"0.15 EU/mg","specification":"<1.0 EU/mg","pass":true},
    {"panel_name":"Heavy Metals (ICP-MS)","result":"Not Detected","specification":"Not Detected","pass":true},
    {"panel_name":"Sterility (PCR)","result":"No growth detected","specification":"Sterile","pass":true},
    {"panel_name":"Microbial Screen","result":"Pass","specification":"Pass","pass":true},
    {"panel_name":"Visual Inspection","result":"Pass","specification":"Pass","pass":true}
  ]'::jsonb,
  '{"retention_time":8.88,"peak_area":2763400,"points":[{"x":0,"y":0.01},{"x":3,"y":0.03},{"x":7,"y":0.05},{"x":8.88,"y":0.96},{"x":9.5,"y":0.64},{"x":11,"y":0.04},{"x":15,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
  'pass', false, 'sha256:ara2902026', 'AA-ARA290-001', NOW() - INTERVAL '10 days'
)
ON CONFLICT (slug) DO NOTHING;

-- Draft order in progress (mirrors ILS Step 1/3 resume)
INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000007-0000-0000-0000-000000000007',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-DRAFT-20260422',
  'received',
  false,
  'Draft — resume in order wizard',
  500.00, 0, 0, 500.00, false,
  'Apex Research Group',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '2 hours'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, created_at)
VALUES (
  'b0000007-0000-0000-0000-000000000001',
  'a0000007-0000-0000-0000-000000000007',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ION-3RT', 'ION-3RT 10mg', 'single', 3, '{}', 'received',
  '{"batch_number":"","labeled_content":"10mg","vial_size":"3mL","sample_matrix":"Lyophilized","test_mode":"full_qc","draft":true}'::jsonb,
  NOW() - INTERVAL '2 hours'
)
ON CONFLICT (id) DO NOTHING;
