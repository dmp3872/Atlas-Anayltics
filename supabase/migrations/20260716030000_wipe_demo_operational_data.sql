-- Clean operational demo data. Keeps auth users, profiles, and test_panels.

TRUNCATE TABLE
  submission_results,
  submission_status_history,
  order_status_history,
  coas,
  submission_samples,
  order_samples,
  submissions,
  orders,
  peptide_requests,
  notification_queue,
  api_keys,
  companies
RESTART IDENTITY CASCADE;
