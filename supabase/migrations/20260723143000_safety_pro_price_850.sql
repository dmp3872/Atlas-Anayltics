/*
  Atlas Safety Pro package price → $850
*/

UPDATE test_panels
SET price_per_sample = 850.00
WHERE name = 'Atlas Safety Pro Package'
  AND price_per_sample IS DISTINCT FROM 850.00;
