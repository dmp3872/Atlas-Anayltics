-- Pending review stage + reviewer assignment for dual sign-off.
ALTER TABLE coas DROP CONSTRAINT IF EXISTS coas_coa_workflow_stage_check;
ALTER TABLE coas ADD CONSTRAINT coas_coa_workflow_stage_check
  CHECK (coa_workflow_stage IN (
    'awaiting_info',
    'testing_in_progress',
    'issued',
    'pending_review',
    'verified',
    'published'
  ));

ALTER TABLE coas ADD COLUMN IF NOT EXISTS review_assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN coas.review_assigned_to IS
  'Lab director or chemist assigned to provide the second signature (pending_review stage).';
