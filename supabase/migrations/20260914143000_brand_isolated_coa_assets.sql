-- Keep COA brand assets isolated per company.
-- clone_coa_for_brand must not copy the source brand's logo/watermark onto a different company.

CREATE OR REPLACE FUNCTION public.clone_coa_for_brand(
  p_source_coa_id uuid,
  p_company_id uuid,
  p_payment_method text DEFAULT 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fee numeric := 50;
  v_src public.coas%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_summary jsonb;
  v_log jsonb;
  v_slug text;
  v_new_id uuid;
  v_count int;
  v_prepaid numeric;
  v_method text := lower(trim(COALESCE(p_payment_method, 'card')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to purchase a branded COA.';
  END IF;

  IF v_method NOT IN ('card', 'crypto', 'prepaid') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  SELECT * INTO v_src FROM public.coas WHERE id = p_source_coa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate not found.';
  END IF;
  IF v_src.user_id <> v_uid THEN
    RAISE EXCEPTION 'You can only brand your own certificates.';
  END IF;
  IF COALESCE(v_src.coa_workflow_stage, '') NOT IN ('issued', 'pending_review', 'verified', 'published')
     AND v_src.issued_at IS NULL THEN
    RAISE EXCEPTION 'This certificate is not ready to copy yet.';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND OR v_company.user_id <> v_uid THEN
    RAISE EXCEPTION 'Select one of your COA profiles.';
  END IF;
  IF lower(trim(v_company.name)) = lower(trim(COALESCE(v_src.company_name, ''))) THEN
    RAISE EXCEPTION 'This certificate is already branded as %.', v_company.name;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.coas c
  WHERE c.user_id = v_src.user_id
    AND (
      (v_src.sample_id IS NOT NULL AND c.sample_id = v_src.sample_id)
      OR (
        v_src.sample_id IS NULL
        AND c.accession_number IS NOT DISTINCT FROM v_src.accession_number
        AND c.batch_number IS NOT DISTINCT FROM v_src.batch_number
        AND lower(c.sample_name) = lower(v_src.sample_name)
      )
    );

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'This sample already has the maximum number of branded COAs.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coas c
    WHERE c.user_id = v_src.user_id
      AND c.id <> v_src.id
      AND lower(trim(c.company_name)) = lower(trim(v_company.name))
      AND (
        (v_src.sample_id IS NOT NULL AND c.sample_id = v_src.sample_id)
        OR (
          v_src.sample_id IS NULL
          AND c.accession_number IS NOT DISTINCT FROM v_src.accession_number
          AND c.batch_number IS NOT DISTINCT FROM v_src.batch_number
        )
      )
  ) THEN
    RAISE EXCEPTION 'A COA for % already exists for this sample.', v_company.name;
  END IF;

  IF v_method = 'prepaid' THEN
    SELECT prepaid_balance INTO v_prepaid
    FROM public.user_profiles
    WHERE id = v_uid
    FOR UPDATE;
    IF COALESCE(v_prepaid, 0) < v_fee THEN
      RAISE EXCEPTION 'Prepaid balance is too low for this branded COA.';
    END IF;
    UPDATE public.user_profiles
    SET prepaid_balance = prepaid_balance - v_fee
    WHERE id = v_uid;
  END IF;

  v_summary := COALESCE(v_src.result_summary, '{}'::jsonb)
    - 'vial_image' - 'chromatogram_image' - 'hplc_image' - 'company_logo';
  v_log := COALESCE(v_summary->'update_log', '[]'::jsonb);
  IF jsonb_typeof(v_log) <> 'array' THEN
    v_log := '[]'::jsonb;
  END IF;
  v_log := v_log || jsonb_build_array(jsonb_build_object(
    'at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'by', 'Client',
    'note', format('Branded copy issued for %s ($%s)', v_company.name, to_char(v_fee, 'FM9990'))
  ));
  v_summary := v_summary || jsonb_build_object(
    'coa_profile_id', v_company.id,
    'apply_company_logo', true,
    'apply_watermark', CASE
      WHEN NULLIF(v_company.chromatograph_background, '') IS NULL THEN false
      ELSE true
    END,
    'branded_from_coa_id', v_src.id,
    'client_website', COALESCE(NULLIF(v_company.website, ''), v_summary->>'client_website', v_summary->>'website'),
    'client_address', COALESCE(NULLIF(v_company.address, ''), v_summary->>'client_address', v_summary->>'address'),
    'website', COALESCE(NULLIF(v_company.website, ''), v_summary->>'website'),
    'address', COALESCE(NULLIF(v_company.address, ''), v_summary->>'address'),
    'branded_copy_purchase', jsonb_build_object(
      'amount', v_fee,
      'payment_method', v_method,
      'at', to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'update_log', v_log
  );

  v_slug := public.allocate_coa_slug();

  INSERT INTO public.coas (
    user_id, sample_id, order_id, slug, sample_name, display_name,
    company_name, company_logo, peptide_sequence, batch_number,
    purity_percent, molecular_weight, result_summary, panel_results,
    chromatogram_data, overall_result, is_public, content_hash, signature,
    pdf_url, vial_image, chromatogram_image, hplc_image, seal_serial,
    accession_number, coa_workflow_stage, verified_at, verified_by,
    review_assigned_to, published_at, issued_at
  )
  VALUES (
    v_src.user_id,
    v_src.sample_id,
    v_src.order_id,
    v_slug,
    v_src.sample_name,
    v_src.display_name,
    v_company.name,
    COALESCE(NULLIF(v_company.logo, ''), ''),
    v_src.peptide_sequence,
    v_src.batch_number,
    v_src.purity_percent,
    v_src.molecular_weight,
    v_summary,
    v_src.panel_results,
    v_src.chromatogram_data,
    v_src.overall_result,
    v_src.is_public,
    v_src.content_hash,
    v_src.signature,
    '',
    v_src.vial_image,
    COALESCE(NULLIF(v_company.chromatograph_background, ''), ''),
    v_src.hplc_image,
    v_src.seal_serial,
    v_src.accession_number,
    COALESCE(v_src.coa_workflow_stage, 'issued'),
    v_src.verified_at,
    v_src.verified_by,
    v_src.review_assigned_to,
    v_src.published_at,
    COALESCE(v_src.issued_at, now())
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.coa_brand_purchases (
    user_id, source_coa_id, new_coa_id, company_id, amount, payment_method
  ) VALUES (
    v_uid, v_src.id, v_new_id, v_company.id, v_fee, v_method
  );

  IF v_src.order_id IS NOT NULL THEN
    UPDATE public.orders
    SET
      total = COALESCE(total, 0) + v_fee,
      subtotal = COALESCE(subtotal, 0) + v_fee
    WHERE id = v_src.order_id
      AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'slug', v_slug,
    'company_name', v_company.name,
    'fee', v_fee
  );
END;
$$;

COMMENT ON FUNCTION public.clone_coa_for_brand(uuid, uuid, text) IS
  'Client-paid branded COA copy ($50). Uses only the selected company logo/watermark — never the source brand assets.';

-- Existing ANG (and any other brand) COAs: do not live-resolve another brand's watermark.
UPDATE public.coas c
SET result_summary = COALESCE(c.result_summary, '{}'::jsonb)
  || jsonb_build_object('apply_watermark', false)
WHERE lower(trim(c.company_name)) <> 'valor peptides'
  AND (
    c.chromatogram_image IS NULL
    OR trim(c.chromatogram_image) = ''
  )
  AND COALESCE(c.result_summary->>'apply_watermark', 'true') <> 'false';
