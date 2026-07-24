/*
  Align Atlas Safety Pro package turnaround with standard 3–5 business days messaging.
*/

UPDATE test_panels
SET turnaround_days = 5
WHERE name = 'Atlas Safety Pro Package'
  AND turnaround_days <> 5;
