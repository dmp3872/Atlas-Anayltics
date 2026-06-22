/*
  # Add analysis_results to order_samples

  ## Summary
  Adds a JSONB column `analysis_results` to the `order_samples` table to track
  the per-test status and result for each analysis sub-step within the Analyzing stage.

  ## New Columns
  - `order_samples.analysis_results` (jsonb, default null)
    Stores an array of objects, one per test ordered for this sample:
    {
      "test": "identification" | "net_content" | "net_purity" | "endotoxins" | "sterility" | "heavy_metals",
      "ordered": boolean,        -- whether this test was ordered for the sample
      "status": "pending" | "in_progress" | "pass" | "fail",
      "value": string | null     -- result value if completed (e.g. "99.1%", "Confirmed", "<0.5 EU/mg")
    }

  ## Notes
  - No existing data is touched; existing rows get null (treated as all-pending in UI)
  - RLS is already enabled on order_samples; no policy changes needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_samples' AND column_name = 'analysis_results'
  ) THEN
    ALTER TABLE order_samples ADD COLUMN analysis_results jsonb DEFAULT NULL;
  END IF;
END $$;
