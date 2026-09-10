-- Public verification is an exact-code lookup, never a browsable certificate list.
-- Existing clients retain ordering access; new clients require a reviewed application.
begin;
create schema if not exists atlas_private;
revoke all on schema atlas_private from public;
grant usage on schema atlas_private to anon, authenticated;

create table public.client_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','approved','rejected')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and octet_length(details::text) < 40000),
  review_note text not null default '' check (length(review_note) <= 4000),
  reviewed_by uuid references auth.users(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_applications_status_created_idx on public.client_applications(status, created_at desc);
alter table public.client_applications enable row level security;
grant select, insert, update on public.client_applications to authenticated;
revoke all on public.client_applications from anon;
create policy "Applicants and admins read applications" on public.client_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_role()) = 'admin');
create policy "Applicants start their own draft" on public.client_applications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'draft' and reviewed_by is null and reviewed_at is null and submitted_at is null and review_note = '');
create policy "Applicants edit draft or requested changes" on public.client_applications for update to authenticated
  using (user_id = (select auth.uid()) and status in ('draft','changes_requested'))
  with check (user_id = (select auth.uid()) and status in ('draft','changes_requested','submitted'));
create policy "Admins review applications" on public.client_applications for update to authenticated
  using ((select public.current_user_role()) = 'admin') with check ((select public.current_user_role()) = 'admin');

create table public.client_order_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  source text not null check (source in ('existing_client','application'))
);
alter table public.client_order_access enable row level security;
grant select on public.client_order_access to authenticated;
revoke insert, update, delete on public.client_order_access from authenticated, anon;
create policy "Read own ordering access" on public.client_order_access for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_role()) = 'admin');
insert into public.client_order_access(user_id, source)
  select id, 'existing_client' from public.user_profiles where coalesce(role,'client') = 'client'
  on conflict do nothing;

create function atlas_private.validate_client_application() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare k text; is_admin boolean := coalesce(public.current_user_role() = 'admin',false);
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Application ownership cannot be changed';
  end if;
  if not is_admin and (new.review_note is distinct from old.review_note or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at) then
    raise exception 'Only an administrator can review an application';
  end if;
  if new.status = 'submitted' and old.status <> 'submitted' then
    if old.status not in ('draft','changes_requested') then raise exception 'This application cannot be submitted'; end if;
    foreach k in array array['company_name','company_type','country','address','city','postal_code','contact_name','contact_title','contact_email','phone','research_focus','sample_types','monthly_samples','first_batch_samples','shipping_country','billing_email'] loop
      if coalesce(length(btrim(new.details->>k)),0) = 0 then raise exception 'Required application field: %',k; end if;
    end loop;
    if not coalesce((new.details->>'monthly_samples') ~ '^[1-9][0-9]{0,6}$',false)
       or not coalesce((new.details->>'first_batch_samples') ~ '^[1-9][0-9]{0,6}$',false) then raise exception 'Sample volumes must be positive whole numbers'; end if;
    if coalesce(jsonb_typeof(new.details->'testing_needs'),'') <> 'array' then raise exception 'Select at least one testing service'; end if;
    if jsonb_array_length(new.details->'testing_needs') = 0 then raise exception 'Select at least one testing service'; end if;
    if new.details->>'contact_email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or new.details->>'billing_email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter valid contact and billing emails'; end if;
    if new.details->>'confirmed' is distinct from 'true' then raise exception 'Confirm the application information before submitting'; end if;
    new.submitted_at := now();
  else
    new.submitted_at := old.submitted_at;
  end if;
  if new.status in ('approved','changes_requested','rejected') and new.status is distinct from old.status then
    if not is_admin then raise exception 'Administrator review required'; end if;
    if old.status <> 'submitted' then raise exception 'Only submitted applications can be reviewed'; end if;
    if new.status in ('changes_requested','rejected') and length(btrim(new.review_note))=0 then raise exception 'Add a note for the applicant'; end if;
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger validate_client_application before insert or update on public.client_applications
  for each row execute function atlas_private.validate_client_application();
revoke all on function atlas_private.validate_client_application() from public, anon, authenticated;

create function atlas_private.grant_approved_client_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_user_role() <> 'admin' then raise exception 'Administrator review required'; end if;
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.client_order_access(user_id, source) values(new.user_id,'application') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger grant_approved_client_access after update of status on public.client_applications
  for each row when (new.status = 'approved' and old.status is distinct from new.status)
  execute function atlas_private.grant_approved_client_access();
revoke all on function atlas_private.grant_approved_client_access() from public, anon, authenticated;

-- Restrictive policies compose with existing owner/staff policies rather than replacing them.
create policy "Approved clients create orders" on public.orders as restrictive for insert to authenticated
  with check ((select public.current_user_role()) in ('admin','chemist') or exists(select 1 from public.client_order_access a where a.user_id = (select auth.uid())));
create policy "Approved clients update orders" on public.orders as restrictive for update to authenticated
  using ((select public.current_user_role()) in ('admin','chemist') or exists(select 1 from public.client_order_access a where a.user_id = (select auth.uid())))
  with check ((select public.current_user_role()) in ('admin','chemist') or exists(select 1 from public.client_order_access a where a.user_id = (select auth.uid())));

-- Owner profile edits must not bypass the approval requirement by changing their role.
create function atlas_private.protect_profile_role() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null and coalesce(public.current_user_role(),'client') <> 'admin' then
    if tg_op = 'INSERT' and new.role <> 'client' then raise exception 'Only administrators can assign staff roles'; end if;
    if tg_op = 'UPDATE' and new.role is distinct from old.role then raise exception 'Only administrators can change roles'; end if;
  end if;
  return new;
end $$;
create trigger protect_profile_role before insert or update of role on public.user_profiles
  for each row execute function atlas_private.protect_profile_role();
revoke all on function atlas_private.protect_profile_role() from public, anon, authenticated;

-- A private definer performs the narrowly scoped public lookup. No enumeration,
-- wildcard matching, owner IDs, internal audit notes, or private certificates.
create function atlas_private.lookup_public_coa(p_code text, p_images boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.coas; payload jsonb; summary jsonb; candidate text := btrim(p_code);
begin
  if candidate is null or length(candidate) < 6 or length(candidate) > 128 or candidate !~ '^[A-Za-z0-9_-]+$' then return null; end if;
  select * into c from public.coas where slug = candidate and is_public = true limit 1;
  if not found then return null; end if;
  if p_images then
    return jsonb_build_object('id',c.id,'company_logo',coalesce(nullif(c.company_logo,''),c.result_summary->>'company_logo'),'vial_image',coalesce(nullif(c.vial_image,''),c.result_summary->>'vial_image'),'chromatogram_image',coalesce(nullif(c.chromatogram_image,''),c.result_summary->>'chromatogram_image'),'hplc_image',coalesce(nullif(c.hplc_image,''),c.result_summary->>'hplc_image'));
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into summary from jsonb_each(coalesce(c.result_summary,'{}'::jsonb)) where key = any(array[
    'assay_method','assay_method_label','matrix_type','sample_matrix','category','received_date','received_at','mean_of_vials_tested','vials_tested','vial_count',
    'include_cas_number','cas_number','label_claim_unit','labeled_content','label_claim','avg_net_peptide_content','avg_purity','fentanyl_detection','include_molecular_weight','molecular_weight',
    'sterility_method','sterility_pass','sterility_projected_completion','endotoxin_eu_ml','endotoxin_pass','heavy_metals_pass','heavy_metals','include_sterility','include_endotoxin',
    'include_heavy_metals','include_ph','ph_result','include_benzyl_pq','benzyl_purity','benzyl_quantity','test_mode','components','apply_company_logo','apply_watermark','vial_results','multi_vial_results','conformity_vials','variance_vials','net_content','client_website','website','company_website','client_address','address','company_address'
  ]);
  payload := jsonb_build_object('id',c.id,'slug',c.slug,'sample_name',c.sample_name,'display_name',c.display_name,'company_name',c.company_name,
    'batch_number',c.batch_number,'peptide_sequence',c.peptide_sequence,'purity_percent',c.purity_percent,'molecular_weight',c.molecular_weight,
    'overall_result',c.overall_result,'is_public',true,'issued_at',c.issued_at,'created_at',c.created_at,'verified_at',c.verified_at,'published_at',c.published_at,
    'coa_workflow_stage',c.coa_workflow_stage,'seal_serial',c.seal_serial,'accession_number',c.accession_number,'content_hash',c.content_hash,'signature',c.signature,
    'panel_results',c.panel_results,'chromatogram_data',c.chromatogram_data,'result_summary',summary);
  return payload;
end $$;
revoke all on function atlas_private.lookup_public_coa(text,boolean) from public;
grant execute on function atlas_private.lookup_public_coa(text,boolean) to anon,authenticated;
create function public.verify_public_coa(p_code text, p_images boolean default false) returns jsonb
language sql stable security invoker set search_path = '' as $$ select atlas_private.lookup_public_coa(p_code,p_images); $$;
revoke all on function public.verify_public_coa(text,boolean) from public;
grant execute on function public.verify_public_coa(text,boolean) to anon,authenticated;
drop policy if exists "Public can view public COAs" on public.coas;

-- Make application status updates available to the client and admin subscriptions.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.client_applications;
    alter publication supabase_realtime add table public.client_order_access;
  end if;
end $$;
commit;
