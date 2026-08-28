-- Fix ambiguous "slug" in allocate_coa_slug (PL/pgSQL variable vs coas.slug column).
CREATE OR REPLACE FUNCTION public.allocate_coa_slug()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  prefix text;
  token text;
  v_candidate text;
  i int;
  idx int;
  attempt int;
BEGIN
  prefix := to_char((now() AT TIME ZONE 'America/New_York'), 'YYMM');
  FOR attempt IN 1..16 LOOP
    token := '';
    FOR i IN 1..6 LOOP
      idx := 1 + floor(random() * length(alphabet))::int;
      token := token || substr(alphabet, idx, 1);
    END LOOP;
    v_candidate := prefix || '-' || token;
    IF NOT EXISTS (SELECT 1 FROM public.coas c WHERE c.slug = v_candidate)
       AND NOT EXISTS (SELECT 1 FROM public.order_samples s WHERE s.accession_number = v_candidate)
    THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Could not allocate a unique COA code.';
END;
$$;
