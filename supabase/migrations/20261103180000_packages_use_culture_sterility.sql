/*
  Packages switch from PCR sterility to 14-day culture sterility (PCR paused).
  Catalog descriptions on the live site come from these rows.
*/

UPDATE test_panels
SET description = 'Identity confirmation, purity analysis (%), quantity verification, and 14-day culture sterility.'
WHERE name = 'Full QC Panel';

UPDATE test_panels
SET description = replace(description, 'Sterility (PCR)', 'Sterility (14-day culture)')
WHERE name = 'Atlas Safety Pro Package';
