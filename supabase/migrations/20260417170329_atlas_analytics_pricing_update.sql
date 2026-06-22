
/*
  # Atlas Analytics - Updated Pricing & Panels

  ## Changes
  - Removes all old AccuMark test panels
  - Inserts new Atlas Analytics pricing structure
  - Base bundle: Purity + Net Content + ID at $149/sample
  - All add-on panels with exact prices as specified
  - Rush processing tracked as flat $200/sample (not a panel)
*/

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
