
/*
  # Sample Submission Workflow

  Adds client submission intake, admin workflow, activity log, and role-based access.
  Keeps existing orders/checkout flow unchanged.
*/

-- Role on user profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'client'
  CHECK (role IN ('client', 'admin', 'reviewer'));

-- Helper: check if current user is admin or reviewer
CREATE OR REPLACE FUNCTION is_admin_or_reviewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'reviewer')
  );
$$;

CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'awaiting_sample', 'sample_received',
      'in_testing', 'qa_review', 'complete', 'archived'
    )),
  urgency text NOT NULL DEFAULT 'standard' CHECK (urgency IN ('standard', 'rush')),
  notes text DEFAULT '',
  document_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submission_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  sample_number text UNIQUE NOT NULL,
  product_name text NOT NULL DEFAULT '',
  batch_lot_number text DEFAULT '',
  sample_count integer NOT NULL DEFAULT 1 CHECK (sample_count >= 1),
  panel_id uuid REFERENCES test_panels(id),
  panel_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'draft', 'submitted', 'awaiting_sample', 'sample_received',
      'in_testing', 'qa_review', 'complete', 'archived'
    )),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submission_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES submission_samples(id) ON DELETE CASCADE,
  panel_id uuid REFERENCES test_panels(id),
  result_data jsonb NOT NULL DEFAULT '{}',
  overall_pass boolean,
  entered_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submission_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  sample_id uuid REFERENCES submission_samples(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coas
  ADD COLUMN IF NOT EXISTS submission_sample_id uuid
  REFERENCES submission_samples(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submission_samples_submission_id ON submission_samples(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_status_history_submission_id ON submission_status_history(submission_id);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_status_history ENABLE ROW LEVEL SECURITY;

-- Submissions policies
CREATE POLICY "Users can view own submissions"
  ON submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin_or_reviewer());

CREATE POLICY "Users can insert own submissions"
  ON submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own draft submissions"
  ON submissions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update all submissions"
  ON submissions FOR UPDATE TO authenticated
  USING (is_admin_or_reviewer())
  WITH CHECK (is_admin_or_reviewer());

-- Submission samples policies
CREATE POLICY "Users can view own submission samples"
  ON submission_samples FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.id = submission_samples.submission_id
      AND (s.user_id = auth.uid() OR is_admin_or_reviewer())
    )
  );

CREATE POLICY "Users can insert own submission samples"
  ON submission_samples FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.id = submission_samples.submission_id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update submission samples"
  ON submission_samples FOR UPDATE TO authenticated
  USING (is_admin_or_reviewer())
  WITH CHECK (is_admin_or_reviewer());

CREATE POLICY "Users can update own draft submission samples"
  ON submission_samples FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.id = submission_samples.submission_id
      AND s.user_id = auth.uid() AND s.status = 'draft'
    )
  );

-- Results policies
CREATE POLICY "Users can view own submission results"
  ON submission_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM submission_samples ss
      JOIN submissions s ON s.id = ss.submission_id
      WHERE ss.id = submission_results.sample_id
      AND (s.user_id = auth.uid() OR is_admin_or_reviewer())
    )
  );

CREATE POLICY "Admins can manage submission results"
  ON submission_results FOR ALL TO authenticated
  USING (is_admin_or_reviewer())
  WITH CHECK (is_admin_or_reviewer());

-- Status history policies
CREATE POLICY "Users can view own submission history"
  ON submission_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.id = submission_status_history.submission_id
      AND (s.user_id = auth.uid() OR is_admin_or_reviewer())
    )
  );

CREATE POLICY "Admins can insert submission history"
  ON submission_status_history FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_reviewer());

CREATE POLICY "Users can insert history on own submit"
  ON submission_status_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.id = submission_status_history.submission_id
      AND s.user_id = auth.uid()
    )
  );

-- Seed admin role for Kyle (safe no-op if user does not exist yet)
DO $$
BEGIN
  UPDATE user_profiles up
  SET role = 'admin'
  FROM auth.users u
  WHERE up.id = u.id
  AND u.email = 'kyle.a.robertson@icloud.com';
END $$;
