/*
  # Order sample metadata

  Adds JSONB metadata column for rich wizard fields (batch, matrix, tests, brands, etc.)
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
