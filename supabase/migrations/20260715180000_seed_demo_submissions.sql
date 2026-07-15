-- Demo submissions for the admin Submissions Queue (SUB-DEMO-001 … 005).
-- Idempotent. Prefers client@atlaslabs.test; falls back to admin@atlaslabs.test.
-- App can also seed via Admin Dashboard → “Load demo submissions”.

DO $$
DECLARE
  owner_id uuid;
  panel_id uuid;
  sub1 uuid := 'e1000001-0000-4000-8000-000000000001';
  sub2 uuid := 'e1000001-0000-4000-8000-000000000002';
  sub3 uuid := 'e1000001-0000-4000-8000-000000000003';
  sub4 uuid := 'e1000001-0000-4000-8000-000000000004';
  sub5 uuid := 'e1000001-0000-4000-8000-000000000005';
BEGIN
  IF EXISTS (SELECT 1 FROM submissions WHERE submission_number = 'SUB-DEMO-001') THEN
    RAISE NOTICE 'Demo submissions already present (SUB-DEMO-001).';
    RETURN;
  END IF;

  SELECT id INTO owner_id FROM auth.users WHERE email = 'client@atlaslabs.test' LIMIT 1;
  IF owner_id IS NULL THEN
    SELECT id INTO owner_id FROM auth.users WHERE email = 'admin@atlaslabs.test' LIMIT 1;
  END IF;
  IF owner_id IS NULL THEN
    RAISE NOTICE 'Skipping demo submissions — no client/admin test user found.';
    RETURN;
  END IF;

  SELECT id INTO panel_id FROM test_panels WHERE is_active = true ORDER BY sort_order NULLS LAST LIMIT 1;

  INSERT INTO submissions (
    id, submission_number, user_id, company_name, contact_name, email, phone,
    status, urgency, notes, created_at, updated_at
  ) VALUES
    (sub1, 'SUB-DEMO-001', owner_id, 'Nova Peptide Co', 'Chris Client', 'ops@novapeptide.example.com', '(512) 555-0142',
     'submitted', 'standard', 'New intake — waiting for kit arrival. [DEMO SEED]',
     now() - interval '6 hours', now() - interval '6 hours'),
    (sub2, 'SUB-DEMO-002', owner_id, 'Apex Research Labs', 'Jordan Lee', 'qa@apexresearch.example.com', '(303) 555-0198',
     'awaiting_sample', 'rush', 'Rush kit emailed — courier label pending. [DEMO SEED]',
     now() - interval '30 hours', now() - interval '20 hours'),
    (sub3, 'SUB-DEMO-003', owner_id, 'Summit Peptide Labs', 'Taylor Brooks', 'lab@summitpeptide.example.com', '(720) 555-0133',
     'sample_received', 'standard', 'Received at Denver dock — queued for accession. [DEMO SEED]',
     now() - interval '3 days', now() - interval '2 days'),
    (sub4, 'SUB-DEMO-004', owner_id, 'Northwind Bio', 'Morgan Ortiz', 'morgan@northwindbio.example.com', '(415) 555-0177',
     'in_testing', 'standard', 'HPLC queue — purity/content panels running. [DEMO SEED]',
     now() - interval '5 days', now() - interval '1 day'),
    (sub5, 'SUB-DEMO-005', owner_id, 'Harbor Compounding', 'Alex Rivera', 'alex@harborcompound.example.com', '(204) 555-0110',
     'qa_review', 'rush', 'Results entered — awaiting QA sign-off before COA release. [DEMO SEED]',
     now() - interval '7 days', now() - interval '12 hours');

  INSERT INTO submission_samples (
    submission_id, sample_number, product_name, batch_lot_number, sample_count,
    panel_id, panel_ids, status, created_at
  ) VALUES
    (sub1, 'SMP-DEMO-001', 'BPC-157', 'LOT-BPC-001', 2, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'submitted', now() - interval '6 hours'),
    (sub1, 'SMP-DEMO-002', 'TB-500', 'LOT-TB-014', 1, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'submitted', now() - interval '6 hours'),
    (sub2, 'SMP-DEMO-003', 'Retatrutide 5mg', 'RET-2406-17', 1, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'awaiting_sample', now() - interval '30 hours'),
    (sub3, 'SMP-DEMO-004', 'Semaglutide', 'SEMA-0901', 3, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'sample_received', now() - interval '3 days'),
    (sub3, 'SMP-DEMO-005', 'Tirzepatide', 'TIRZ-0901', 2, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'sample_received', now() - interval '3 days'),
    (sub4, 'SMP-DEMO-006', 'MOTS-c 10mg', 'MOTS-0625-A', 1, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'in_testing', now() - interval '5 days'),
    (sub5, 'SMP-DEMO-007', 'GHK-Cu', 'GHK-4412', 2, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'qa_review', now() - interval '7 days'),
    (sub5, 'SMP-DEMO-008', 'Ipamorelin', 'IPA-4412', 1, panel_id,
      CASE WHEN panel_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[panel_id] END, 'qa_review', now() - interval '7 days');

  INSERT INTO submission_status_history (submission_id, from_status, to_status, note, changed_by, created_at)
  VALUES
    (sub1, null, 'submitted', 'Demo submission seeded', owner_id, now() - interval '6 hours'),
    (sub2, null, 'submitted', 'Demo submission seeded', owner_id, now() - interval '30 hours'),
    (sub2, 'submitted', 'awaiting_sample', 'Demo seed advanced', owner_id, now() - interval '20 hours'),
    (sub3, null, 'submitted', 'Demo submission seeded', owner_id, now() - interval '3 days'),
    (sub3, 'submitted', 'sample_received', 'Demo seed advanced', owner_id, now() - interval '2 days'),
    (sub4, null, 'submitted', 'Demo submission seeded', owner_id, now() - interval '5 days'),
    (sub4, 'submitted', 'in_testing', 'Demo seed advanced', owner_id, now() - interval '1 day'),
    (sub5, null, 'submitted', 'Demo submission seeded', owner_id, now() - interval '7 days'),
    (sub5, 'submitted', 'qa_review', 'Demo seed advanced', owner_id, now() - interval '12 hours');
END $$;
