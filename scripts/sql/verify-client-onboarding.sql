-- Run after the migration. All fixtures and changes roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('a7100000-0000-4000-8000-000000000001','atlas-onboarding-test@example.invalid','{}'),
('a7100000-0000-4000-8000-000000000002','atlas-review-test@example.invalid','{}'),
('a7100000-0000-4000-8000-000000000003','atlas-other-test@example.invalid','{}');
update public.user_profiles set role='admin' where id='a7100000-0000-4000-8000-000000000002';
insert into public.coas(user_id,slug,sample_name,is_public) values
('a7100000-0000-4000-8000-000000000001','ATLAS-TEST-PUBLIC','Test certificate',true),
('a7100000-0000-4000-8000-000000000001','ATLAS-TEST-PRIVATE','Private certificate',false);
set local role anon;
do $$ begin
 assert not exists(select 1 from public.coas), 'Anonymous users must not enumerate COAs';
 assert public.verify_public_coa('ATLAS-TEST-PUBLIC')->>'sample_name' = 'Test certificate', 'Exact lookup failed';
 assert public.verify_public_coa('ATLAS-TEST-PRIVATE') is null, 'Private certificate leaked';
 assert public.verify_public_coa('ATLAS%') is null, 'Wildcard lookup allowed';
 assert not (public.verify_public_coa('ATLAS-TEST-PUBLIC') ? 'user_id'), 'Owner ID leaked';
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into public.client_applications(user_id,details) values(auth.uid(),'{}');
do $$ declare allowed boolean := false; begin
 assert (select status='draft' from public.client_applications where user_id=auth.uid()), 'Start must persist draft';
 begin insert into public.orders(user_id) values(auth.uid()); allowed:=true; exception when insufficient_privilege then null; end;
 assert not allowed, 'Unapproved client created order';
 begin update public.user_profiles set role='admin' where id=auth.uid(); allowed:=true; exception when raise_exception then null; end;
 assert not allowed, 'Client escalated own role';
 begin update public.client_applications set status='approved' where user_id=auth.uid(); allowed:=true; exception when raise_exception or insufficient_privilege then null; end;
 assert not allowed, 'Client approved own application';
 begin update public.client_applications set status='submitted' where user_id=auth.uid(); allowed:=true; exception when raise_exception then null; end;
 assert not allowed, 'Incomplete application submitted';
end $$;
update public.client_applications set details='{"company_name":"Test Research","company_type":"Research company","country":"US","address":"Test address","city":"Test city","postal_code":"00000","contact_name":"Test applicant","contact_title":"Researcher","contact_email":"test@example.invalid","phone":"123","research_focus":"Peptide research","sample_types":"Lyophilized","monthly_samples":"12","first_batch_samples":"3","shipping_country":"US","billing_email":"test@example.invalid","testing_needs":["Identity, purity & quantity"],"confirmed":true}',status='submitted' where user_id=auth.uid();
reset role;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ begin assert not exists(select 1 from public.client_applications), 'Cross-client application disclosure'; end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
update public.client_applications set status='changes_requested',review_note='Please confirm shipping.' where user_id='a7100000-0000-4000-8000-000000000001';
reset role;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
update public.client_applications set status='submitted' where user_id=auth.uid();
reset role;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
update public.client_applications set status='approved',review_note='Approved.' where user_id='a7100000-0000-4000-8000-000000000001';
reset role;
select set_config('request.jwt.claims','{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin assert exists(select 1 from public.client_order_access where user_id=auth.uid()), 'Approval did not grant access'; end $$;
insert into public.orders(user_id) values(auth.uid());
reset role;
rollback;
