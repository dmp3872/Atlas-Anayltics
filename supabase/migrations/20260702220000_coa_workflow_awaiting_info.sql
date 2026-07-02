-- Add "awaiting client info" stage to COA workflow board
ALTER TABLE coas DROP CONSTRAINT IF EXISTS coas_coa_workflow_stage_check;
ALTER TABLE coas ADD CONSTRAINT coas_coa_workflow_stage_check
  CHECK (coa_workflow_stage IN ('issued', 'awaiting_info', 'verified', 'published'));
