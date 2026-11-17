-- Atlas founding-member price list (Nov 2026).
-- App catalog remains the source of truth; keep test_panels aligned for Pricing page / legacy submissions.

UPDATE public.test_panels
SET
  name = 'Atlas Pro Package',
  description = 'Founding members package: Identity, Purity, Quantity, Heavy Metals, Endotoxin, 14-Day Sterility Culture, and 3-Vial Conformity Testing (2 comparison vials included).',
  price_per_sample = 650.00,
  turnaround_days = 5,
  is_active = true,
  category = 'package'
WHERE name ILIKE '%safety pro%' OR name ILIKE '%atlas pro%';

INSERT INTO public.test_panels (name, description, price_per_sample, turnaround_days, category, is_active, sort_order)
SELECT
  'Atlas Pro Package',
  'Founding members package: Identity, Purity, Quantity, Heavy Metals, Endotoxin, 14-Day Sterility Culture, and 3-Vial Conformity Testing (2 comparison vials included).',
  650.00,
  5,
  'package',
  true,
  -1
WHERE NOT EXISTS (
  SELECT 1 FROM public.test_panels
  WHERE name ILIKE '%safety pro%' OR name ILIKE '%atlas pro%'
);

-- Individual + optional assays (upsert by name where possible)
UPDATE public.test_panels SET price_per_sample = 249.00, is_active = true, description = 'HPLC identity confirmation, purity analysis (%), and net content quantitation'
WHERE name ILIKE '%identity%' AND name ILIKE '%purity%' AND name ILIKE '%quantity%';

UPDATE public.test_panels SET price_per_sample = 139.00, is_active = true
WHERE name ILIKE '%heavy metal%';

UPDATE public.test_panels SET price_per_sample = 179.00, is_active = true
WHERE name ILIKE '%endotoxin%' AND name NOT ILIKE '%kinetic%';

UPDATE public.test_panels SET price_per_sample = 249.00, is_active = true, turnaround_days = 14,
  name = '14-Day Sterility Culture',
  description = 'Full sterility verification by 14-day culture method'
WHERE name ILIKE '%sterility%' AND (name ILIKE '%culture%' OR name ILIKE '%usp%' OR name ILIKE '%full%');

UPDATE public.test_panels SET price_per_sample = 165.00, is_active = true,
  name = 'PCR Screening',
  description = 'Rapid microbial / sterility screen by PCR'
WHERE name ILIKE '%sterility%' AND name ILIKE '%pcr%';

UPDATE public.test_panels SET price_per_sample = 165.00, is_active = true
WHERE name ILIKE '%microbial%';

UPDATE public.test_panels SET price_per_sample = 59.00, is_active = true,
  name = 'Fentanyl Testing',
  description = 'Screen for fentanyl contamination'
WHERE name ILIKE '%fentanyl%';

UPDATE public.test_panels SET price_per_sample = 49.00, is_active = true
WHERE name ILIKE '%pH%';

UPDATE public.test_panels SET price_per_sample = 169.00, is_active = true, turnaround_days = 5,
  name = 'Residual Solvents Panel',
  description = 'Organic residual solvent profile (USP <467>)'
WHERE name ILIKE '%residual solvent%';

-- Seed missing individual/optional rows
INSERT INTO public.test_panels (name, description, price_per_sample, turnaround_days, category, is_active, sort_order)
SELECT v.name, v.description, v.price_per_sample, v.turnaround_days, v.category, true, v.sort_order
FROM (VALUES
  ('Identity + Purity + Quantity', 'HPLC identity confirmation, purity analysis (%), and net content quantitation', 249.00, 3, 'standard', 10),
  ('Identity + Purity', 'HPLC identity confirmation and purity analysis (%)', 225.00, 3, 'standard', 11),
  ('Quantity Add-On', 'Net content quantitation added to an existing identity/purity order', 49.00, 3, 'standard', 12),
  ('Heavy Metals', 'ICP-MS elemental impurities screen', 139.00, 5, 'safety', 13),
  ('Endotoxin', 'LAL endotoxin screen (USP <85>)', 179.00, 3, 'safety', 14),
  ('14-Day Sterility Culture', 'Full sterility verification by 14-day culture method', 249.00, 14, 'safety', 15),
  ('Additional Conformity Vial', 'Extra conformity / comparison vial beyond package inclusions', 65.00, 5, 'standard', 16),
  ('PCR Screening', 'Rapid microbial / sterility screen by PCR', 165.00, 3, 'safety', 20),
  ('Fentanyl Testing', 'Screen for fentanyl contamination', 59.00, 3, 'safety', 21),
  ('pH Testing', 'pH measurement', 49.00, 3, 'standard', 22),
  ('Closure Integrity', 'Container closure integrity assessment', 59.00, 3, 'standard', 23),
  ('Solubility Testing', 'Solubility / reconstitution behavior assessment', 59.00, 3, 'standard', 24),
  ('TFA Testing', 'Trifluoroacetic acid residual / content testing', 149.00, 5, 'purity', 25),
  ('Residual Solvents Panel', 'Organic residual solvent profile (USP <467>)', 169.00, 5, 'purity', 26)
) AS v(name, description, price_per_sample, turnaround_days, category, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.test_panels t WHERE lower(t.name) = lower(v.name)
);
