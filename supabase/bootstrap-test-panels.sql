/*
  Minimal bootstrap: test_panels + Atlas pricing + Safety Pro package.
  Paste into Supabase Dashboard → SQL Editor → Run.
*/

CREATE TABLE IF NOT EXISTS test_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_per_sample numeric(10,2) NOT NULL DEFAULT 0,
  turnaround_days integer NOT NULL DEFAULT 5,
  category text NOT NULL DEFAULT 'standard',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE test_panels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'test_panels' AND policyname = 'Anyone can view active test panels'
  ) THEN
    CREATE POLICY "Anyone can view active test panels"
      ON test_panels FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

DELETE FROM test_panels WHERE 1=1;

INSERT INTO test_panels (name, description, price_per_sample, turnaround_days, category, is_active, sort_order) VALUES
  ('Base Bundle (Purity + Net Content + ID)', 'Includes HPLC purity, net content, and identity testing. Included with every sample.', 149.00, 5, 'base', true, 0),
  ('Microbial Sterility Screen', 'Rapid microbial contamination screening', 120.00, 5, 'safety', true, 1),
  ('Endotoxin Safety Screen', 'Standard Gel-Clot LAL endotoxin testing', 130.00, 5, 'safety', true, 2),
  ('Heavy Metal Screening', 'Colorimetric heavy metal screening', 130.00, 7, 'safety', true, 3),
  ('Full Sterility Verification', 'USP <71> sterility test', 250.00, 21, 'safety', true, 4),
  ('pH Analysis', 'Measures pH level of the solution', 50.00, 5, 'standard', true, 5),
  ('Benzyl Alcohol Assay', 'Quantitative analysis of benzyl alcohol preservative content', 220.00, 7, 'standard', true, 6),
  ('Endotoxin Analysis (Kinetic)', 'Advanced Kinetic Chromogenic LAL', 240.00, 7, 'safety', true, 7),
  ('Residual Solvents Analysis', 'GC-MS residual solvents analysis (USP <467>)', 150.00, 7, 'purity', true, 8),
  ('Heavy Metal Analysis (ICP-MS)', 'Inductively Coupled Plasma Mass Spectrometry', 250.00, 10, 'safety', true, 9);

INSERT INTO test_panels (name, description, price_per_sample, turnaround_days, category, is_active, sort_order)
SELECT
  'Atlas Safety Pro Package',
  'Complete safety bundle per sample: HPLC Purity, Net Content, Identity (ID), Heavy Metals, Endotoxin (LAL), Sterility (PCR), Fentanyl Detection, and 3 Conformity Vials included.',
  850.00,
  10,
  'package',
  true,
  -1
WHERE NOT EXISTS (
  SELECT 1 FROM test_panels WHERE name = 'Atlas Safety Pro Package'
);
