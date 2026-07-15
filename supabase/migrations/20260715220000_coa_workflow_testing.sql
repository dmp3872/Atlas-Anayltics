-- Add testing_in_progress to the COA workflow stage check.
ALTER TABLE coas DROP CONSTRAINT IF EXISTS coas_coa_workflow_stage_check;
ALTER TABLE coas ADD CONSTRAINT coas_coa_workflow_stage_check
  CHECK (coa_workflow_stage IN (
    'awaiting_info',
    'testing_in_progress',
    'issued',
    'verified',
    'published'
  ));
