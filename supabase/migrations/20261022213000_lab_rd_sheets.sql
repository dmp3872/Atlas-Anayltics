/*
  # Lab R&D sheets — chemist markdown notebooks

  Shared staff notebooks for R&D notes (markdown). Chemists and admins can
  create, edit, and delete sheets. Intended to grow into study documentation later.
*/

CREATE TABLE IF NOT EXISTS lab_rd_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Untitled sheet',
  content_md text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_rd_sheets_updated_at_idx ON lab_rd_sheets (updated_at DESC);

ALTER TABLE lab_rd_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage lab R&D sheets" ON lab_rd_sheets;
CREATE POLICY "Staff manage lab R&D sheets" ON lab_rd_sheets
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('chemist', 'admin'))
  WITH CHECK (public.current_user_role() IN ('chemist', 'admin'));

CREATE OR REPLACE FUNCTION public.touch_lab_rd_sheet_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lab_rd_sheets_updated_at ON lab_rd_sheets;
CREATE TRIGGER lab_rd_sheets_updated_at
  BEFORE UPDATE ON lab_rd_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_lab_rd_sheet_updated_at();

COMMENT ON TABLE lab_rd_sheets IS 'Chemist R&D markdown notebooks (Lab Console → Lab R&D).';
