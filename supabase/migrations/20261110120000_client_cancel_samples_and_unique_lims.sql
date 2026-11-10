-- Clients can cancel samples that the lab has not received yet (e.g. duplicate orders
-- set up by a teammate). LIMS IDs (order_samples.accession_number) can never repeat.

ALTER TABLE public.order_samples DROP CONSTRAINT IF EXISTS order_samples_status_check;
ALTER TABLE public.order_samples ADD CONSTRAINT order_samples_status_check
  CHECK (status IN ('awaiting_sample', 'received', 'analyzing', 'in_review', 'complete', 'cancelled'));

ALTER TABLE public.order_samples ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.order_samples ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.order_samples ADD COLUMN IF NOT EXISTS cancel_reason text DEFAULT '';

-- Clients may edit their own sample rows (branding), but may only change status
-- from awaiting_sample to cancelled. Staff and server (service role) are unrestricted.
CREATE OR REPLACE FUNCTION public.guard_client_sample_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
     OR public.current_user_role() IN ('chemist', 'admin', 'reviewer', 'verifier') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'awaiting_sample' AND NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Samples can only be cancelled before the lab receives them.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_client_sample_status ON public.order_samples;
CREATE TRIGGER trg_guard_client_sample_status
  BEFORE UPDATE OF status ON public.order_samples
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_sample_status();

CREATE OR REPLACE FUNCTION public.cancel_order_sample(p_sample_id uuid, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sample public.order_samples%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reason text := left(coalesce(trim(p_reason), ''), 500);
  v_remaining int;
  v_order_cancelled boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to cancel a sample.';
  END IF;

  SELECT * INTO v_sample FROM public.order_samples WHERE id = p_sample_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sample not found.';
  END IF;
  IF v_sample.user_id <> v_uid
     AND coalesce(public.current_user_role(), '') NOT IN ('chemist', 'admin') THEN
    RAISE EXCEPTION 'You can only cancel your own samples.';
  END IF;
  IF v_sample.status = 'cancelled' THEN
    RAISE EXCEPTION 'This sample is already cancelled.';
  END IF;
  IF v_sample.status <> 'awaiting_sample' THEN
    RAISE EXCEPTION 'This sample was already received by the lab. Contact Atlas to cancel it.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_sample.order_id FOR UPDATE;

  UPDATE public.order_samples
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_uid,
         cancel_reason = v_reason
   WHERE id = p_sample_id;

  INSERT INTO public.order_status_history (order_id, sample_id, from_status, to_status, changed_by, note)
  VALUES (
    v_sample.order_id, p_sample_id, 'awaiting_sample', 'cancelled', v_uid,
    'Sample cancelled by client before receipt' || CASE WHEN v_reason <> '' THEN ': ' || v_reason ELSE '' END
  );

  SELECT count(*) INTO v_remaining
    FROM public.order_samples
   WHERE order_id = v_sample.order_id AND status <> 'cancelled';

  IF v_remaining = 0 AND v_order.id IS NOT NULL AND v_order.status NOT IN ('cancelled', 'complete') THEN
    UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = v_order.id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
    VALUES (v_order.id, v_order.status, 'cancelled', v_uid, 'All samples cancelled by client');
    v_order_cancelled := true;
  END IF;

  RETURN jsonb_build_object(
    'sample_id', p_sample_id,
    'order_id', v_sample.order_id,
    'order_cancelled', v_order_cancelled,
    'remaining_samples', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_sample(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_sample(uuid, text) TO authenticated;

-- LIMS IDs never repeat. Skipped (with a notice) if historical duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT accession_number FROM public.order_samples
     WHERE coalesce(accession_number, '') <> ''
     GROUP BY accession_number HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Duplicate LIMS IDs already exist; unique index not created.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_order_samples_accession_number
      ON public.order_samples (accession_number)
      WHERE coalesce(accession_number, '') <> '';
  END IF;
END;
$$;
