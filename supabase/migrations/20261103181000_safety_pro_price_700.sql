/*
  Atlas Safety Pro package standard price → $700 (negotiated client prices are set in code).
*/

UPDATE test_panels
SET price_per_sample = 700.00
WHERE name = 'Atlas Safety Pro Package'
  AND price_per_sample IS DISTINCT FROM 700.00;
