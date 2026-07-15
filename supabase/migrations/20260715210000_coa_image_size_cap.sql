-- Clear remaining oversized inline images that freeze browser tabs on Save / Print.
-- Safe threshold: ~220KB data URL (~165KB binary). Re-upload via Prepare COA if needed.
UPDATE coas SET vial_image = '' WHERE length(coalesce(vial_image, '')) > 400000;
UPDATE coas SET chromatogram_image = '' WHERE length(coalesce(chromatogram_image, '')) > 400000;
UPDATE coas SET company_logo = '' WHERE length(coalesce(company_logo, '')) > 400000;

UPDATE companies SET logo = '' WHERE length(coalesce(logo, '')) > 400000;
UPDATE companies SET chromatograph_background = '' WHERE length(coalesce(chromatograph_background, '')) > 400000;
