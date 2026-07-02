
/*
  # Fix submission_status_history INSERT policy

  Replaces permissive admin insert policy if migration was already applied.
*/

DROP POLICY IF EXISTS "Admins can insert submission history" ON submission_status_history;

CREATE POLICY "Admins can insert submission history"
  ON submission_status_history FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_reviewer());
