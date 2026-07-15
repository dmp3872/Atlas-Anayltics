ALTER TABLE coas ADD COLUMN IF NOT EXISTS accession_number text DEFAULT '';
COMMENT ON COLUMN coas.accession_number IS 'Lab accession / sample ID shown on the certificate.';
