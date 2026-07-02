-- Demo dataset for client@atlaslabs.test: orders, samples, COAs at every workflow stage.
-- Idempotent: skips when ACC-DEMO-001 already exists.

DO $$
DECLARE
  client_id uuid;
  panel_hplc uuid;
  panel_identity uuid;
  panel_ms uuid;
  panel_endo uuid;

  co_nova uuid := 'a1000001-0000-4000-8000-000000000001';
  co_apex uuid := 'a1000001-0000-4000-8000-000000000002';

  ord_received uuid := 'b1000001-0000-4000-8000-000000000001';
  ord_analyzing uuid := 'b1000001-0000-4000-8000-000000000002';
  ord_issued uuid := 'b1000001-0000-4000-8000-000000000003';
  ord_verified uuid := 'b1000001-0000-4000-8000-000000000004';
  ord_complete uuid := 'b1000001-0000-4000-8000-000000000005';

  smp_mots uuid := 'c1000001-0000-4000-8000-000000000001';
  smp_blend uuid := 'c1000001-0000-4000-8000-000000000002';
  smp_retat uuid := 'c1000001-0000-4000-8000-000000000003';
  smp_ghk uuid := 'c1000001-0000-4000-8000-000000000004';
  smp_ipa uuid := 'c1000001-0000-4000-8000-000000000005';
  smp_bpc uuid := 'c1000001-0000-4000-8000-000000000006';

  coa_issued uuid := 'd1000001-0000-4000-8000-000000000001';
  coa_verified uuid := 'd1000001-0000-4000-8000-000000000002';
  coa_bpc uuid := 'd1000001-0000-4000-8000-000000000003';
  coa_tb uuid := 'd1000001-0000-4000-8000-000000000004';
  coa_sema uuid := 'd1000001-0000-4000-8000-000000000005';

  panels_hplc uuid[];
  panels_full uuid[];
BEGIN
  SELECT id INTO client_id FROM auth.users WHERE email = 'client@atlaslabs.test';
  IF client_id IS NULL THEN
    RAISE NOTICE 'Skipping demo seed — client@atlaslabs.test not found. Run seed_role_test_accounts first.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE order_number = 'ACC-DEMO-001') THEN
    RAISE NOTICE 'Demo seed already applied (ACC-DEMO-001 exists).';
    RETURN;
  END IF;

  SELECT id INTO panel_hplc FROM test_panels WHERE name = 'HPLC Purity' LIMIT 1;
  SELECT id INTO panel_identity FROM test_panels WHERE name = 'Identity (HPLC-based)' LIMIT 1;
  SELECT id INTO panel_ms FROM test_panels WHERE name = 'Molecular Weight (MS)' LIMIT 1;
  SELECT id INTO panel_endo FROM test_panels WHERE name = 'Endotoxin (LAL)' LIMIT 1;

  panels_hplc := ARRAY[panel_hplc]::uuid[];
  panels_full := ARRAY[panel_hplc, panel_identity, panel_ms]::uuid[];

  UPDATE user_profiles SET
    full_name = 'Chris Client',
    company_name = 'Nova Peptide Co',
    phone = '(512) 555-0142',
    address_line1 = '8800 Research Park Dr',
    city = 'Austin',
    state = 'TX',
    zip = '78759',
    country = 'US',
    website = 'https://novapeptide.example.com',
    prepaid_balance = 250.00,
    is_first_order = false,
    updated_at = now()
  WHERE id = client_id;

  INSERT INTO companies (id, user_id, name, logo, website, email, address, is_default)
  VALUES
    (co_nova, client_id, 'Nova Peptide Co', '', 'https://novapeptide.example.com', 'lab@novapeptide.example.com', '8800 Research Park Dr, Austin, TX 78759', true),
    (co_apex, client_id, 'Apex Research Labs', '', 'https://apexresearch.example.com', 'qa@apexresearch.example.com', '1200 Biotech Way, Denver, CO 80202', false)
  ON CONFLICT (id) DO NOTHING;

  -- Order 1: just received — chemist queue (2 samples, no COA)
  INSERT INTO orders (
    id, user_id, order_number, status, rush_processing, notes,
    subtotal, discount_amount, rush_fee, total, first_order_discount,
    prepaid_shipping, shipping_label_id, payment_method, company_name, created_at, updated_at
  ) VALUES (
    ord_received, client_id, 'ACC-DEMO-001', 'received', false,
    'Demo seed — new intake. Rush not requested.',
    298.00, 0, 0, 298.00, false, true, 'ATLAS-DEMO-LBL-001', 'card', 'Nova Peptide Co',
    now() - interval '2 days', now() - interval '2 days'
  );

  INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, created_at)
  VALUES
    (smp_mots, ord_received, client_id, 'MOTS-c', 'MOTS-c 10mg', 'single', 2, panels_hplc,
     'received',
     '{"batch_number":"MOTS-0625-A","matrix":"lyophilized","brand_names":["Nova Peptide Co"]}'::jsonb,
     now() - interval '2 days'),
    (smp_blend, ord_received, client_id, 'BPC/TB Blend', 'BPC-157 + TB-500 Stack', 'blend', 1,
     ARRAY[panel_hplc, panel_identity]::uuid[],
     'received',
     '{"batch_number":"BLEND-0625-01","matrix":"lyophilized","brand_names":["Nova Peptide Co","Apex Research Labs"]}'::jsonb,
     now() - interval '2 days');

  -- Order 2: analyzing — chemist can advance status
  INSERT INTO orders (
    id, user_id, order_number, status, rush_processing, notes,
    subtotal, discount_amount, rush_fee, total, first_order_discount,
    prepaid_shipping, payment_method, company_name, created_at, updated_at
  ) VALUES (
    ord_analyzing, client_id, 'ACC-DEMO-002', 'analyzing', true,
    'Demo seed — rush order in the lab.',
    349.00, 17.45, 200.00, 531.55, false, false, 'crypto', 'Nova Peptide Co',
    now() - interval '5 days', now() - interval '1 day'
  );

  INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, analysis_results, created_at)
  VALUES (
    smp_retat, ord_analyzing, client_id, 'Retatrutide', 'Retatrutide 5mg', 'single', 1, panels_full,
    'analyzing',
    '{"batch_number":"RET-2406-17","matrix":"lyophilized"}'::jsonb,
    '[{"panel":"HPLC Purity","value":"in progress","note":"Peak integration running"}]'::jsonb,
    now() - interval '5 days'
  );

  -- Order 3: COA issued (private) — chemist workflow step 1
  INSERT INTO orders (
    id, user_id, order_number, status, notes, subtotal, total, company_name, created_at, updated_at
  ) VALUES (
    ord_issued, client_id, 'ACC-DEMO-003', 'in_review',
    'Demo seed — COA issued, awaiting verify.',
    194.00, 194.00, 'Nova Peptide Co', now() - interval '10 days', now() - interval '3 days'
  );

  INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, created_at)
  VALUES (
    smp_ghk, ord_issued, client_id, 'GHK-Cu', 'GHK-Cu 50mg', 'single', 1, panels_hplc,
    'in_review',
    '{"batch_number":"LOT-GHK-2406","matrix":"lyophilized"}'::jsonb,
    now() - interval '10 days'
  );

  INSERT INTO coas (
    id, sample_id, order_id, user_id, slug,
    sample_name, display_name, company_name, peptide_sequence, batch_number,
    purity_percent, molecular_weight, panel_results, chromatogram_data,
    overall_result, is_public, coa_workflow_stage, content_hash, signature, seal_serial,
    issued_at, created_at
  ) VALUES (
    coa_issued, smp_ghk, ord_issued, client_id, 'demo-ghk-cu-issued',
    'GHK-Cu', 'GHK-Cu 50mg', 'Nova Peptide Co', 'GHK-Cu', 'LOT-GHK-2406',
    98.71, 401.9234,
    '[{"panel_name":"HPLC Purity","result":"98.71%","specification":"≥95.0%","pass":true},{"panel_name":"Identity (HPLC-based)","result":"Match","specification":"RT match","pass":true}]'::jsonb,
    '{"retention_time":8.42,"peak_area":984200,"points":[{"x":0,"y":0.02},{"x":8.4,"y":0.98},{"x":16,"y":0.01}]}'::jsonb,
    'pass', false, 'issued', 'sha256:05d6772e', 'AA-DEMO-GHK-001', 'SEAL-GHK-2406',
    now() - interval '3 days', now() - interval '3 days'
  );

  -- Order 4: COA verified (still private) — chemist workflow step 2
  INSERT INTO orders (
    id, user_id, order_number, status, notes, subtotal, total, company_name, created_at, updated_at
  ) VALUES (
    ord_verified, client_id, 'ACC-DEMO-004', 'in_review',
    'Demo seed — COA verified, ready to publish.',
    210.00, 210.00, 'Nova Peptide Co', now() - interval '14 days', now() - interval '2 days'
  );

  INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, created_at)
  VALUES (
    smp_ipa, ord_verified, client_id, 'Ipamorelin', 'Ipamorelin 2mg', 'single', 3, ARRAY[panel_hplc, panel_ms]::uuid[],
    'in_review',
    '{"batch_number":"LOT-IPA-2406","matrix":"lyophilized"}'::jsonb,
    now() - interval '14 days'
  );

  INSERT INTO coas (
    id, sample_id, order_id, user_id, slug,
    sample_name, display_name, company_name, peptide_sequence, batch_number,
    purity_percent, molecular_weight, panel_results, chromatogram_data,
    overall_result, is_public, coa_workflow_stage, verified_at, content_hash, signature, seal_serial,
    issued_at, created_at
  ) VALUES (
    coa_verified, smp_ipa, ord_verified, client_id, 'demo-ipamorelin-verified',
    'Ipamorelin', 'Ipamorelin 2mg', 'Nova Peptide Co', 'AIVFXD', 'LOT-IPA-2406',
    99.12, 711.8686,
    '[{"panel_name":"HPLC Purity","result":"99.12%","specification":"≥95.0%","pass":true},{"panel_name":"Molecular Weight (MS)","result":"711.9 Da","specification":"±2 Da","pass":true}]'::jsonb,
    '{"retention_time":6.18,"peak_area":1123400}'::jsonb,
    'pass', false, 'verified', now() - interval '1 day', 'sha256:25d6e2fe', 'AA-DEMO-IPA-001', 'SEAL-IPA-2406',
    now() - interval '2 days', now() - interval '2 days'
  );

  -- Order 5: complete with published COA — client + verifier can see
  INSERT INTO orders (
    id, user_id, order_number, status, notes, subtotal, total, company_name, created_at, updated_at
  ) VALUES (
    ord_complete, client_id, 'ACC-DEMO-005', 'complete',
    'Demo seed — finished order with public COA.',
    149.00, 149.00, 'Nova Peptide Co', now() - interval '30 days', now() - interval '7 days'
  );

  INSERT INTO order_samples (id, order_id, user_id, sample_name, display_name, sample_type, vial_count, panel_ids, status, metadata, created_at)
  VALUES (
    smp_bpc, ord_complete, client_id, 'BPC-157', 'BPC-157 5mg', 'single', 2, ARRAY[panel_hplc, panel_identity]::uuid[],
    'complete',
    '{"batch_number":"BATCH-DEMO-001","matrix":"lyophilized"}'::jsonb,
    now() - interval '30 days'
  );

  INSERT INTO coas (
    id, sample_id, order_id, user_id, slug,
    sample_name, display_name, company_name, peptide_sequence, batch_number,
    purity_percent, molecular_weight, panel_results, chromatogram_data,
    overall_result, is_public, coa_workflow_stage, verified_at, published_at, content_hash, signature, seal_serial,
    issued_at, created_at
  ) VALUES (
    coa_bpc, smp_bpc, ord_complete, client_id, 'demo-bpc157-public',
    'BPC-157', 'BPC-157 5mg', 'Nova Peptide Co', 'GEPPPGKPADDAGP', 'BATCH-DEMO-001',
    99.42, 1419.5565,
    '[{"panel_name":"HPLC Purity","result":"99.42%","specification":"≥95.0%","pass":true},{"panel_name":"Identity (HPLC-based)","result":"Confirmed","specification":"RT match","pass":true}]'::jsonb,
    '{"retention_time":7.55,"peak_area":1450000,"points":[{"x":0,"y":0.01},{"x":7.5,"y":1.0},{"x":15,"y":0.02}]}'::jsonb,
    'pass', true, 'published', now() - interval '8 days', now() - interval '7 days', 'sha256:058d02f9', 'AA-DEMO-BPC-001', 'SEAL-BPC-DEMO',
    now() - interval '9 days', now() - interval '9 days'
  );

  -- Extra public COAs (second brand + library coverage) — no active order
  INSERT INTO coas (
    id, sample_id, order_id, user_id, slug,
    sample_name, display_name, company_name, peptide_sequence, batch_number,
    purity_percent, molecular_weight, panel_results, overall_result,
    is_public, coa_workflow_stage, verified_at, published_at, content_hash, signature, seal_serial,
    issued_at, created_at
  ) VALUES
    (
      coa_tb, NULL, NULL, client_id, 'demo-tb500-public',
      'TB-500', 'TB-500 10mg', 'Apex Research Labs', 'LKKTETQ', 'TB-500-2024-A',
      98.95, 889.0120,
      '[{"panel_name":"HPLC Purity","result":"98.95%","pass":true}]'::jsonb,
      'pass', true, 'published', now() - interval '20 days', now() - interval '19 days',
      'sha256:68b35d68', 'AA-DEMO-TB-001', 'SEAL-TB-500',
      now() - interval '21 days', now() - interval '21 days'
    ),
    (
      coa_sema, NULL, NULL, client_id, 'demo-sema-public',
      'Semaglutide', 'Semaglutide 5mg', 'Nova Peptide Co', 'HAEGTFTSDVSSYLEGQAAKEFIAWLVKGR', 'SEMA-Lot-88',
      99.01, 4113.6410,
      '[{"panel_name":"HPLC Purity","result":"99.01%","pass":true},{"panel_name":"Endotoxin (LAL)","result":"<0.05 EU/mg","pass":true}]'::jsonb,
      'pass', true, 'published', now() - interval '45 days', now() - interval '44 days',
      'sha256:3a9d91cc', 'AA-DEMO-SEMA-001', 'SEAL-SEMA-88',
      now() - interval '46 days', now() - interval '46 days'
    );

  INSERT INTO peptide_requests (user_id, peptide_name, cas_number, notes, status, created_at)
  VALUES
    (client_id, 'Tesamorelin', '901758-09-6', 'Need HPLC + endotoxin panel pricing for catalog.', 'pending', now() - interval '4 days');

  INSERT INTO notification_queue (user_id, channel, subject, body, sent_at, created_at)
  VALUES
    (
      client_id, 'email',
      'Your COA is ready — BPC-157',
      'Certificate demo-bpc157-public for batch BATCH-DEMO-001 is now available in your portal.',
      now() - interval '7 days', now() - interval '7 days'
    );

  RAISE NOTICE 'Demo seed applied for client@atlaslabs.test (5 orders, 6 samples, 5 COAs).';
END $$;
