
/*
  # Seed Derek's Account: Profile, Orders, and COAs

  ## Summary
  Populates the account for derekpruski@gmail.com (UUID: 162cf453-7912-4fe1-a6b2-d3fb0625ec98) with:

  1. Updated user_profiles record with company name "Apex Research Group"
  2. 5 orders at various pipeline stages (received, processing, analyzing, in_review, complete)
     with order_samples children showing per-sample progress
  3. 15 private COAs linked to this user covering a range of peptides

  ## Notes
  - Order numbers use ATL- prefix
  - COAs are is_public = false (private to this account)
  - Sample statuses within each order reflect realistic progress
*/

-- ============================================================
-- 1. UPDATE USER PROFILE
-- ============================================================
INSERT INTO user_profiles (id, full_name, company_name, phone, address_line1, city, state, zip, country, is_first_order)
VALUES (
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'Derek Pruski',
  'Apex Research Group',
  '512-555-0192',
  '800 Capital of Texas Hwy',
  'Austin',
  'TX',
  '78746',
  'US',
  false
)
ON CONFLICT (id) DO UPDATE SET
  full_name = 'Derek Pruski',
  company_name = 'Apex Research Group',
  phone = '512-555-0192',
  address_line1 = '800 Capital of Texas Hwy',
  city = 'Austin',
  state = 'TX',
  zip = '78746',
  country = 'US',
  is_first_order = false;

-- ============================================================
-- 2. ORDERS
-- ============================================================

-- Order 1: COMPLETE — placed 3 weeks ago
INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000001-0000-0000-0000-000000000001',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-20260327-4482',
  'complete',
  false,
  '',
  596.00, 298.00, 0, 298.00, true,
  'Apex Research Group',
  NOW() - INTERVAL '21 days',
  NOW() - INTERVAL '8 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, created_at)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'BPC-157', 'BPC-157 5mg', 'single', 2, '{}', 'complete', NOW() - INTERVAL '21 days'),
  ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'TB-500', 'TB-500 2mg', 'single', 2, '{}', 'complete', NOW() - INTERVAL '21 days')
ON CONFLICT (id) DO NOTHING;

-- Order 2: COMPLETE — placed 2 weeks ago, rush
INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000002-0000-0000-0000-000000000002',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-20260403-7731',
  'complete',
  true,
  'Priority — please rush these for Q2 batch release',
  1047.00, 0, 600.00, 1647.00, false,
  'Apex Research Group',
  NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '4 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, created_at)
VALUES
  ('b0000002-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000002', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Semaglutide', 'Semaglutide 2mg', 'single', 3, '{}', 'complete', NOW() - INTERVAL '14 days'),
  ('b0000002-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000002', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Tirzepatide', 'Tirzepatide 5mg', 'single', 3, '{}', 'complete', NOW() - INTERVAL '14 days'),
  ('b0000002-0000-0000-0000-000000000003', 'a0000002-0000-0000-0000-000000000002', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'CJC-1295 DAC', 'CJC-1295 DAC 2mg', 'single', 1, '{}', 'complete', NOW() - INTERVAL '14 days')
ON CONFLICT (id) DO NOTHING;

-- Order 3: IN REVIEW — placed 9 days ago
INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000003-0000-0000-0000-000000000003',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-20260408-2214',
  'in_review',
  false,
  '',
  746.00, 0, 0, 746.00, false,
  'Apex Research Group',
  NOW() - INTERVAL '9 days',
  NOW() - INTERVAL '2 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, created_at)
VALUES
  ('b0000003-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000003', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Ipamorelin', 'Ipamorelin 2mg', 'single', 2, '{}', 'in_review', NOW() - INTERVAL '9 days'),
  ('b0000003-0000-0000-0000-000000000002', 'a0000003-0000-0000-0000-000000000003', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'GHRP-6', 'GHRP-6 5mg', 'single', 2, '{}', 'complete', NOW() - INTERVAL '9 days'),
  ('b0000003-0000-0000-0000-000000000003', 'a0000003-0000-0000-0000-000000000003', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Sermorelin', 'Sermorelin 2mg', 'single', 2, '{}', 'in_review', NOW() - INTERVAL '9 days')
ON CONFLICT (id) DO NOTHING;

-- Order 4: ANALYZING — placed 5 days ago
INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000004-0000-0000-0000-000000000004',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-20260412-9003',
  'analyzing',
  true,
  'Blend sample — 3 compounds, please label COA clearly',
  995.00, 0, 400.00, 1395.00, false,
  'Apex Research Group',
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, created_at)
VALUES
  ('b0000004-0000-0000-0000-000000000001', 'a0000004-0000-0000-0000-000000000004', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Blend-A (BPC/TB/GHK)', 'Research Blend A', 'blend', 2, '{}', 'analyzing', NOW() - INTERVAL '5 days'),
  ('b0000004-0000-0000-0000-000000000002', 'a0000004-0000-0000-0000-000000000004', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'HGH Fragment 176-191', 'HGH Frag 176-191 2mg', 'single', 2, '{}', 'complete', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- Order 5: RECEIVED — placed 1 day ago
INSERT INTO orders (id, user_id, order_number, status, rush_processing, notes, subtotal, discount_amount, rush_fee, total, first_order_discount, company_name, created_at, updated_at)
VALUES (
  'a0000005-0000-0000-0000-000000000005',
  '162cf453-7912-4fe1-a6b2-d3fb0625ec98',
  'ATL-20260416-5519',
  'received',
  false,
  'New batch from supplier — full panel please',
  1043.00, 0, 0, 1043.00, false,
  'Apex Research Group',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, created_at)
VALUES
  ('b0000005-0000-0000-0000-000000000001', 'a0000005-0000-0000-0000-000000000005', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'PT-141', 'PT-141 10mg', 'single', 3, '{}', 'received', NOW() - INTERVAL '1 day'),
  ('b0000005-0000-0000-0000-000000000002', 'a0000005-0000-0000-0000-000000000005', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Kisspeptin-10', 'Kisspeptin-10 2mg', 'single', 3, '{}', 'received', NOW() - INTERVAL '1 day'),
  ('b0000005-0000-0000-0000-000000000003', 'a0000005-0000-0000-0000-000000000005', '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'Selank', 'Selank 5mg', 'single', 2, '{}', 'received', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. 15 PRIVATE COAs FOR DEREK
-- ============================================================

INSERT INTO coas (id, user_id, slug, sample_name, display_name, company_name, peptide_sequence, batch_number, purity_percent, molecular_weight, panel_results, chromatogram_data, overall_result, is_public, content_hash, signature, issued_at)
VALUES
-- 1
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-bpc157-a-2403', 'BPC-157', 'BPC-157 5mg', 'Apex Research Group', 'GEPPPGKPADDAGLV', 'ARG-BPC-2403-001', 99.1, 1419.5,
'[{"panel_name":"HPLC Purity","result":"99.1%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography measures the percentage of target compound vs all detected species."},{"panel_name":"Identity Confirmation (MS)","result":"1419.5 Da","specification":"1419.5 ± 2 Da","pass":true,"description":"Mass Spectrometry confirms molecular weight and amino acid sequence."},{"panel_name":"Net Content (Weight)","result":"5.12 mg","specification":"5.0 ± 0.5 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.18 EU/mg","specification":"<1.0 EU/mg","pass":true,"description":"Gel-Clot LAL test detects bacterial endotoxins. Critical for injectable peptides."},{"panel_name":"Microbial Sterility Screen","result":"No growth detected","specification":"Sterile","pass":true,"description":"Tests for viable microorganisms. Ensures freedom from contamination."}]'::jsonb,
'{"retention_time":8.24,"peak_area":2847392,"points":[{"x":0,"y":0.01},{"x":2,"y":0.03},{"x":4,"y":0.08},{"x":6,"y":0.03},{"x":8,"y":0.04},{"x":8.24,"y":0.98},{"x":8.5,"y":0.72},{"x":9,"y":0.18},{"x":11,"y":0.01},{"x":14,"y":0.01},{"x":17,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa01bpc157', 'AA-ARG-BPC157-001', NOW() - INTERVAL '20 days'),

-- 2
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-tb500-a-2403', 'TB-500 Fragment', 'TB-500 Fragment 2mg', 'Apex Research Group', 'LKKTETQ', 'ARG-TB5-2403-001', 97.8, 2776.1,
'[{"panel_name":"HPLC Purity","result":"97.8%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography measures the percentage of target compound vs all detected species."},{"panel_name":"Identity Confirmation (MS)","result":"2776.1 Da","specification":"2776.1 ± 3 Da","pass":true,"description":"Mass Spectrometry confirms molecular weight and amino acid sequence."},{"panel_name":"Net Content (Weight)","result":"2.08 mg","specification":"2.0 ± 0.3 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"pH Analysis","result":"6.8","specification":"6.0–7.5","pass":true,"description":"Measures hydrogen ion concentration in reconstituted solution."}]'::jsonb,
'{"retention_time":11.56,"peak_area":1923847,"points":[{"x":0,"y":0.01},{"x":3,"y":0.03},{"x":6,"y":0.04},{"x":9,"y":0.06},{"x":11,"y":0.09},{"x":11.56,"y":0.91},{"x":12,"y":0.58},{"x":13,"y":0.04},{"x":15,"y":0.01},{"x":18,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa02tb500', 'AA-ARG-TB500-001', NOW() - INTERVAL '19 days'),

-- 3
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-sema-a-2403', 'Semaglutide', 'Semaglutide 2mg', 'Apex Research Group', 'His-Aib-Glu-Gly-Thr-Phe-Thr-Ser', 'ARG-SEM-2403-001', 98.4, 4113.6,
'[{"panel_name":"HPLC Purity","result":"98.4%","specification":"≥98.0%","pass":true,"description":"Premium ≥98.0% specification for GLP-1 analog class."},{"panel_name":"Identity Confirmation (MS)","result":"4113.6 Da","specification":"4113.6 ± 4 Da","pass":true,"description":"Confirms C18 fatty acid conjugation and full semaglutide structure."},{"panel_name":"Net Content (Weight)","result":"1.97 mg","specification":"2.0 ± 0.3 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Heavy Metal Screening","result":"Not Detected","specification":"Not Detected","pass":true,"description":"Colorimetric screen for lead, arsenic, cadmium, and mercury."},{"panel_name":"Residual Solvents (GC-MS)","result":"All below ICH Q3C limits","specification":"ICH Q3C Class 2/3","pass":true,"description":"Quantifies residual solvents from synthesis and lyophilization."}]'::jsonb,
'{"retention_time":14.33,"peak_area":3412509,"points":[{"x":0,"y":0.01},{"x":3,"y":0.02},{"x":6,"y":0.03},{"x":9,"y":0.04},{"x":12,"y":0.06},{"x":14,"y":0.07},{"x":14.33,"y":0.94},{"x":14.7,"y":0.61},{"x":15,"y":0.21},{"x":17,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa03sema', 'AA-ARG-SEMA-001', NOW() - INTERVAL '17 days'),

-- 4
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-tирз-a-2403', 'Tirzepatide', 'Tirzepatide 5mg', 'Apex Research Group', 'YTSLHSQTFTSDYSK', 'ARG-TIR-2403-001', 98.7, 4813.4,
'[{"panel_name":"HPLC Purity","result":"98.7%","specification":"≥98.0%","pass":true,"description":"Premium ≥98.0% specification for dual GIP/GLP-1 agonist class."},{"panel_name":"Identity Confirmation (MS)","result":"4813.4 Da","specification":"4813.4 ± 5 Da","pass":true,"description":"Confirms dual fatty acid conjugation unique to tirzepatide structure."},{"panel_name":"Net Content (Weight)","result":"5.03 mg","specification":"5.0 ± 0.5 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.09 EU/mg","specification":"<0.5 EU/mg","pass":true,"description":"Tighter specification for GIP/GLP-1 compounds given frequency of use."}]'::jsonb,
'{"retention_time":15.7,"peak_area":2901244,"points":[{"x":0,"y":0.01},{"x":4,"y":0.02},{"x":8,"y":0.04},{"x":12,"y":0.05},{"x":15,"y":0.07},{"x":15.7,"y":0.96},{"x":16,"y":0.7},{"x":16.5,"y":0.28},{"x":17,"y":0.05},{"x":18,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa04tirz', 'AA-ARG-TIRZ-001', NOW() - INTERVAL '15 days'),

-- 5
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-cjc1295-a-2403', 'CJC-1295 DAC', 'CJC-1295 with DAC 2mg', 'Apex Research Group', 'YADAIFTNSYRKVLGQLSARKLLQ', 'ARG-CJC-2403-001', 98.9, 3647.3,
'[{"panel_name":"HPLC Purity","result":"98.9%","specification":"≥98.0%","pass":true,"description":"Premium ≥98.0% specification for long-acting GHRH analogs."},{"panel_name":"Identity Confirmation (MS)","result":"3647.3 Da","specification":"3647.3 ± 4 Da","pass":true,"description":"Confirms DAC maleimide linker that extends half-life via albumin binding."},{"panel_name":"Net Content (Weight)","result":"2.01 mg","specification":"2.0 ± 0.3 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Benzyl Alcohol Assay","result":"Not Detected","specification":"Not Detected","pass":true,"description":"Confirms product is benzyl alcohol-free."},{"panel_name":"pH Analysis","result":"7.1","specification":"6.5–7.8","pass":true,"description":"Optimal range for subcutaneous injection compatibility."}]'::jsonb,
'{"retention_time":13.12,"peak_area":2931048,"points":[{"x":0,"y":0.01},{"x":4,"y":0.02},{"x":8,"y":0.04},{"x":11,"y":0.05},{"x":13,"y":0.06},{"x":13.12,"y":0.95},{"x":13.5,"y":0.68},{"x":14,"y":0.24},{"x":15,"y":0.02},{"x":17,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa05cjc', 'AA-ARG-CJC-001', NOW() - INTERVAL '13 days'),

-- 6
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-hghfrag-a-2403', 'HGH Fragment 176-191', 'HGH Frag 176-191 2mg', 'Apex Research Group', 'YSGFKDNPQNLALSM', 'ARG-HGH-2403-001', 96.2, 1817.1,
'[{"panel_name":"HPLC Purity","result":"96.2%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography confirms purity free from truncated sequences."},{"panel_name":"Identity Confirmation (MS)","result":"1817.1 Da","specification":"1817.1 ± 2 Da","pass":true,"description":"Confirms residues 176-191 of the human growth hormone sequence."},{"panel_name":"Net Content (Weight)","result":"2.04 mg","specification":"2.0 ± 0.3 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Microbial Sterility Screen","result":"No growth detected","specification":"Sterile","pass":true,"description":"Confirms freedom from microbial contamination."}]'::jsonb,
'{"retention_time":9.87,"peak_area":1654823,"points":[{"x":0,"y":0.01},{"x":3,"y":0.04},{"x":6,"y":0.05},{"x":9,"y":0.08},{"x":9.87,"y":0.86},{"x":10.2,"y":0.65},{"x":11,"y":0.06},{"x":13,"y":0.02},{"x":16,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa06hghf', 'AA-ARG-HGHF-001', NOW() - INTERVAL '12 days'),

-- 7 - FAIL case for variety
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-ghrp6-a-2403', 'GHRP-6', 'GHRP-6 5mg', 'Apex Research Group', 'His-D-Trp-Ala-Trp-D-Phe-Lys', 'ARG-GH6-2403-001', 94.1, 873.0,
'[{"panel_name":"HPLC Purity","result":"94.1%","specification":"≥95.0%","pass":false,"description":"HPLC purity falls below the ≥95.0% release threshold. Elevated impurity peaks detected near 7.2 min, likely degradation products."},{"panel_name":"Identity Confirmation (MS)","result":"873.0 Da","specification":"873.0 ± 1 Da","pass":true,"description":"Mass Spectrometry confirms correct compound identity despite purity concern."},{"panel_name":"Net Content (Weight)","result":"5.08 mg","specification":"5.0 ± 0.5 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.33 EU/mg","specification":"<1.0 EU/mg","pass":true,"description":"Gel-Clot LAL test result within specification."}]'::jsonb,
'{"retention_time":7.81,"peak_area":1102847,"points":[{"x":0,"y":0.01},{"x":2,"y":0.03},{"x":4,"y":0.05},{"x":6,"y":0.04},{"x":7.2,"y":0.12},{"x":7.81,"y":0.78},{"x":8.1,"y":0.51},{"x":9,"y":0.08},{"x":11,"y":0.02},{"x":15,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'fail', false, 'sha256:aa07ghrp6', 'AA-ARG-GHRP6-001', NOW() - INTERVAL '11 days'),

-- 8
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-sermorelin-a-2403', 'Sermorelin', 'Sermorelin 2mg', 'Apex Research Group', 'YADAIFTNSYRKVLGQLSARKLLQDIMSRQQGESNQER', 'ARG-SER-2403-001', 97.3, 3357.9,
'[{"panel_name":"HPLC Purity","result":"97.3%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography confirms purity for this 29-residue GHRH analog."},{"panel_name":"Identity Confirmation (MS)","result":"3357.9 Da","specification":"3357.9 ± 4 Da","pass":true,"description":"Mass Spectrometry confirms full 29-residue sequence."},{"panel_name":"Net Content (Weight)","result":"2.06 mg","specification":"2.0 ± 0.3 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.44 EU/mg","specification":"<1.0 EU/mg","pass":true,"description":"Gel-Clot LAL test detects bacterial endotoxins."},{"panel_name":"pH Analysis","result":"7.0","specification":"6.5–7.8","pass":true,"description":"pH within optimal physiological range for injection."}]'::jsonb,
'{"retention_time":12.44,"peak_area":2198734,"points":[{"x":0,"y":0.01},{"x":4,"y":0.03},{"x":8,"y":0.05},{"x":11,"y":0.06},{"x":12,"y":0.08},{"x":12.44,"y":0.87},{"x":12.8,"y":0.61},{"x":13.5,"y":0.12},{"x":15,"y":0.02},{"x":18,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa08serm', 'AA-ARG-SERM-001', NOW() - INTERVAL '10 days'),

-- 9
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-pt141-a-2403', 'PT-141 (Bremelanotide)', 'PT-141 10mg', 'Apex Research Group', 'Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]', 'ARG-PT1-2403-001', 98.2, 1025.2,
'[{"panel_name":"HPLC Purity","result":"98.2%","specification":"≥95.0%","pass":true,"description":"Confirms high purity for this cyclic MC1R/MC4R agonist melanocortin peptide."},{"panel_name":"Identity Confirmation (MS)","result":"1025.2 Da","specification":"1025.2 ± 1 Da","pass":true,"description":"Mass Spectrometry confirms cyclic structure and N-terminal acetylation."},{"panel_name":"Net Content (Weight)","result":"10.14 mg","specification":"10.0 ± 1.0 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.21 EU/mg","specification":"<1.0 EU/mg","pass":true,"description":"Gel-Clot LAL test confirms safe endotoxin levels."},{"panel_name":"Microbial Sterility Screen","result":"No growth detected","specification":"Sterile","pass":true,"description":"No viable microorganisms detected."}]'::jsonb,
'{"retention_time":10.33,"peak_area":2541009,"points":[{"x":0,"y":0.01},{"x":3,"y":0.02},{"x":6,"y":0.04},{"x":9,"y":0.06},{"x":10,"y":0.08},{"x":10.33,"y":0.93},{"x":10.7,"y":0.67},{"x":11.2,"y":0.19},{"x":13,"y":0.02},{"x":16,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa09pt141', 'AA-ARG-PT141-001', NOW() - INTERVAL '9 days'),

-- 10
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-selank-a-2403', 'Selank', 'Selank 5mg', 'Apex Research Group', 'TKPRPGP', 'ARG-SEL-2403-001', 97.6, 751.9,
'[{"panel_name":"HPLC Purity","result":"97.6%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography confirms purity for this synthetic heptapeptide."},{"panel_name":"Identity Confirmation (MS)","result":"751.9 Da","specification":"751.9 ± 1 Da","pass":true,"description":"Mass Spectrometry confirms correct molecular weight of the tuftsin analog."},{"panel_name":"Net Content (Weight)","result":"5.01 mg","specification":"5.0 ± 0.5 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"pH Analysis","result":"6.9","specification":"6.0–7.5","pass":true,"description":"Physiologically safe pH for nasal or injectable administration."}]'::jsonb,
'{"retention_time":5.22,"peak_area":1381245,"points":[{"x":0,"y":0.01},{"x":2,"y":0.03},{"x":4,"y":0.06},{"x":5,"y":0.08},{"x":5.22,"y":0.88},{"x":5.6,"y":0.59},{"x":6,"y":0.15},{"x":8,"y":0.02},{"x":12,"y":0.01},{"x":16,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa10selank', 'AA-ARG-SELANK-001', NOW() - INTERVAL '8 days'),

-- 11
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-ghkcu-a-2403', 'GHK-Cu', 'GHK-Cu Copper Peptide 50mg', 'Apex Research Group', 'GHK', 'ARG-GHK-2403-001', 99.3, 341.4,
'[{"panel_name":"HPLC Purity","result":"99.3%","specification":"≥95.0%","pass":true,"description":"Exceptional purity for this copper-chelating tripeptide used in tissue repair research."},{"panel_name":"Identity Confirmation (MS)","result":"341.4 Da","specification":"341.4 ± 0.5 Da","pass":true,"description":"Mass Spectrometry confirms Gly-His-Lys copper complex structure."},{"panel_name":"Net Content (Weight)","result":"50.4 mg","specification":"50.0 ± 5.0 mg","pass":true,"description":"Gravimetric determination of actual content per vial."},{"panel_name":"Heavy Metal Screening","result":"Cu: controlled — per spec","specification":"Cu within chelation spec","pass":true,"description":"Copper content confirmed within specified chelation ratios for GHK-Cu complex."}]'::jsonb,
'{"retention_time":3.11,"peak_area":3102847,"points":[{"x":0,"y":0.01},{"x":1,"y":0.03},{"x":2,"y":0.06},{"x":3,"y":0.08},{"x":3.11,"y":0.97},{"x":3.4,"y":0.74},{"x":3.9,"y":0.22},{"x":5,"y":0.03},{"x":10,"y":0.01},{"x":15,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa11ghkcu', 'AA-ARG-GHKCU-001', NOW() - INTERVAL '7 days'),

-- 12
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-epitalon-a-2403', 'Epithalon', 'Epithalon 10mg', 'Apex Research Group', 'AEDG', 'ARG-EPI-2403-001', 98.1, 390.4,
'[{"panel_name":"HPLC Purity","result":"98.1%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography confirms purity for this tetrapeptide telomerase activator."},{"panel_name":"Identity Confirmation (MS)","result":"390.4 Da","specification":"390.4 ± 0.5 Da","pass":true,"description":"Mass Spectrometry confirms Ala-Glu-Asp-Gly tetrapeptide sequence."},{"panel_name":"Net Content (Weight)","result":"10.2 mg","specification":"10.0 ± 1.0 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.11 EU/mg","specification":"<1.0 EU/mg","pass":true,"description":"Gel-Clot LAL test — well within safe limits."},{"panel_name":"Microbial Sterility Screen","result":"No growth detected","specification":"Sterile","pass":true,"description":"No viable microorganisms detected."}]'::jsonb,
'{"retention_time":4.67,"peak_area":2712445,"points":[{"x":0,"y":0.01},{"x":2,"y":0.04},{"x":4,"y":0.07},{"x":4.67,"y":0.91},{"x":5,"y":0.64},{"x":5.5,"y":0.18},{"x":7,"y":0.02},{"x":10,"y":0.01},{"x":15,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa12epit', 'AA-ARG-EPIT-001', NOW() - INTERVAL '6 days'),

-- 13
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-nafilam-a-2403', 'NAD+ Peptide Conjugate', 'NAD+ Peptide 100mg', 'Apex Research Group', 'NAD-Conjugate', 'ARG-NAD-2403-001', 96.8, 663.4,
'[{"panel_name":"HPLC Purity","result":"96.8%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography confirms purity of the NAD+ precursor conjugate."},{"panel_name":"Identity Confirmation (MS)","result":"663.4 Da","specification":"663.4 ± 1 Da","pass":true,"description":"Mass Spectrometry confirms the nicotinamide adenine dinucleotide conjugate structure."},{"panel_name":"Net Content (Weight)","result":"101.2 mg","specification":"100 ± 10 mg","pass":true,"description":"Gravimetric determination of actual content per vial."},{"panel_name":"Residual Solvents (GC-MS)","result":"All below ICH Q3C limits","specification":"ICH Q3C Class 2/3","pass":true,"description":"No residual solvents above ICH limits detected."}]'::jsonb,
'{"retention_time":6.88,"peak_area":1897233,"points":[{"x":0,"y":0.01},{"x":2,"y":0.03},{"x":5,"y":0.06},{"x":6,"y":0.07},{"x":6.88,"y":0.85},{"x":7.2,"y":0.59},{"x":7.8,"y":0.14},{"x":9,"y":0.02},{"x":13,"y":0.01},{"x":17,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa13nad', 'AA-ARG-NAD-001', NOW() - INTERVAL '5 days'),

-- 14
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-kisspeptin-a-2403', 'Kisspeptin-10', 'Kisspeptin-10 2mg', 'Apex Research Group', 'YNWNSFGLRF', 'ARG-KSP-2403-001', 97.9, 1302.5,
'[{"panel_name":"HPLC Purity","result":"97.9%","specification":"≥95.0%","pass":true,"description":"High-Performance Liquid Chromatography confirms purity for this 10-residue neuropeptide."},{"panel_name":"Identity Confirmation (MS)","result":"1302.5 Da","specification":"1302.5 ± 2 Da","pass":true,"description":"Mass Spectrometry confirms the C-terminal amide characteristic of Kisspeptin-10."},{"panel_name":"Net Content (Weight)","result":"2.03 mg","specification":"2.0 ± 0.3 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.28 EU/mg","specification":"<1.0 EU/mg","pass":true,"description":"Gel-Clot LAL test within specification."},{"panel_name":"Microbial Sterility Screen","result":"No growth detected","specification":"Sterile","pass":true,"description":"No viable microorganisms detected."}]'::jsonb,
'{"retention_time":9.14,"peak_area":2041877,"points":[{"x":0,"y":0.01},{"x":3,"y":0.03},{"x":6,"y":0.05},{"x":8,"y":0.07},{"x":9,"y":0.09},{"x":9.14,"y":0.88},{"x":9.5,"y":0.62},{"x":10,"y":0.18},{"x":12,"y":0.02},{"x":16,"y":0.01},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa14kiss', 'AA-ARG-KSP-001', NOW() - INTERVAL '4 days'),

-- 15 — most recent
(gen_random_uuid(), '162cf453-7912-4fe1-a6b2-d3fb0625ec98', 'dp-foxo4-a-2403', 'FOXO4-DRI Peptide', 'FOXO4-DRI 10mg', 'Apex Research Group', 'D-Arg-PXKRPRP', 'ARG-FOX-2403-001', 98.6, 1888.3,
'[{"panel_name":"HPLC Purity","result":"98.6%","specification":"≥98.0%","pass":true,"description":"Premium ≥98.0% specification for D-retro-inverso peptides with complex stereochemistry."},{"panel_name":"Identity Confirmation (MS)","result":"1888.3 Da","specification":"1888.3 ± 2 Da","pass":true,"description":"Mass Spectrometry confirms D-amino acid configuration and retro-inverso architecture."},{"panel_name":"Net Content (Weight)","result":"10.08 mg","specification":"10.0 ± 1.0 mg","pass":true,"description":"Gravimetric determination of actual peptide content per vial."},{"panel_name":"Endotoxin Safety Screen","result":"0.14 EU/mg","specification":"<0.5 EU/mg","pass":true,"description":"Tight endotoxin specification for research-grade apoptosis-targeting peptides."},{"panel_name":"Heavy Metal Screening","result":"Not Detected","specification":"Not Detected","pass":true,"description":"No toxic metal contamination detected."},{"panel_name":"Microbial Sterility Screen","result":"No growth detected","specification":"Sterile","pass":true,"description":"No viable microorganisms detected."}]'::jsonb,
'{"retention_time":16.2,"peak_area":2788912,"points":[{"x":0,"y":0.01},{"x":4,"y":0.02},{"x":8,"y":0.03},{"x":12,"y":0.05},{"x":15,"y":0.07},{"x":16,"y":0.08},{"x":16.2,"y":0.93},{"x":16.5,"y":0.66},{"x":17,"y":0.21},{"x":18,"y":0.03},{"x":20,"y":0.01}]}'::jsonb,
'pass', false, 'sha256:aa15foxo4', 'AA-ARG-FOXO4-001', NOW() - INTERVAL '2 days')

ON CONFLICT (slug) DO NOTHING;
