-- Sample codes / COA slugs: YY-XXXXXX (e.g. 26-K7M4Q9)
-- Alphabet excludes confusing characters I, O, 0, 1.

CREATE OR REPLACE FUNCTION public.generate_sample_code(p_created_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  yy text;
  token text := '';
  i int;
  idx int;
BEGIN
  yy := to_char(COALESCE(p_created_at, now()), 'YY');
  FOR i IN 1..6 LOOP
    idx := 1 + floor(random() * length(alphabet))::int;
    token := token || substr(alphabet, idx, 1);
  END LOOP;
  RETURN yy || '-' || token;
END;
$$;

COMMENT ON FUNCTION public.generate_sample_code(timestamptz) IS
  'Human-readable sample code YY-XXXXXX using unambiguous A–Z/2–9 (no I/O/0/1).';

ALTER TABLE public.coas
  ALTER COLUMN slug SET DEFAULT public.generate_sample_code();
