-- TEMPORARY TEST DB ONLY; never run on IDEALO SV production.
-- Minimal SaaS/auth/storage prerequisites; finance tables are created from the REAL ERP migrations.
create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists test;
create table auth.users(id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $
 select jsonb_build_object('email',coalesce(current_setting('request.jwt.claim.email',true),''))
$;
grant execute on function auth.jwt() to authenticated,anon;
-- PostgreSQL with a trusted test-only JWT subject emulates auth.uid().
-- No real tokens or real users are used in these tests.
create table public.companies(id uuid primary key, name text not null);
create table public.company_members(company_id uuid not null references public.companies(id), user_id uuid not null references auth.users(id),role text not null,primary key(company_id,user_id));
create table public.saas_verticals(id uuid primary key default gen_random_uuid(), code text not null unique,name text not null,description text not null default '',active boolean not null default true,updated_at timestamptz not null default now());
create table public.saas_modules(id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,description text not null default '',is_core boolean default false,active boolean default true);
create table public.saas_vertical_modules(vertical_id uuid references public.saas_verticals(id),module_id uuid references public.saas_modules(id),enabled_by_default boolean,primary key(vertical_id,module_id));
create table public.saas_plans(id uuid primary key default gen_random_uuid(),name text,active boolean default true);
create table public.saas_plan_modules(plan_id uuid references public.saas_plans(id),module_id uuid references public.saas_modules(id),enabled boolean,primary key(plan_id,module_id));
create table public.saas_company_subscriptions(company_id uuid primary key references public.companies(id),vertical_id uuid references public.saas_verticals(id),plan_id uuid references public.saas_plans(id),status text,grace_ends_at timestamptz);
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
create function storage.foldername(p_name text) returns text[] language sql stable as $$
 select (string_to_array(p_name,'/'))[1:greatest(array_length(string_to_array(p_name,'/'),1)-1,0)]
$$;
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage,test to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon;
grant execute on function storage.foldername(text) to authenticated;
grant select,insert on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on all functions in schema test to authenticated,anon;
-- Seed completely fake companies, users and membership, before real finance migrations.
insert into public.companies(id,name) values
 ('11111111-1111-4111-8111-111111111111','Prestaditos QA Company A'),
 ('22222222-2222-4222-8222-222222222222','Prestaditos QA Company B');
insert into auth.users(id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','investor-a@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','investor-b@example.invalid'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin-a@example.invalid'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','staff-a@example.invalid'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','outsider@example.invalid'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','admin-b@example.invalid');
insert into public.company_members(company_id,user_id,role) values
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','owner'),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','staff'),
 ('22222222-2222-4222-8222-222222222222','ffffffff-ffff-4fff-8fff-ffffffffffff','owner');
insert into public.saas_verticals(code,name) values ('OTHER','Other');
insert into public.saas_plans(id,name) values ('12341234-1234-4234-8234-123412341234','Test Plan');
-- Membership of other vertical for company B is switched to financial after ERP migration.
insert into public.saas_company_subscriptions(company_id,vertical_id,plan_id,status) values
 ('11111111-1111-4111-8111-111111111111',(select id from public.saas_verticals where code='OTHER'),'12341234-1234-4234-8234-123412341234','active'),
 ('22222222-2222-4222-8222-222222222222',(select id from public.saas_verticals where code='OTHER'),'12341234-1234-4234-8234-123412341234','active');
-- Assertion functions run with the CALLER's role, not elevated privileges.
create function test.assert_true(ok boolean,detail text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'TEST FAIL: %',detail; end if;
 raise notice 'PASS: %',detail;
end $$;
create function test.expect_error(statement text,detail text) returns void language plpgsql as $$
begin
 begin
  execute statement;
  raise exception 'TEST FAIL: expected rejection: %',detail;
 exception when others then
  if sqlerrm like 'TEST FAIL:%' then raise; end if;
  -- Reject malformed test SQL: only permission denied and explicit business guard
  -- errors count as genuine security denials.
  if sqlstate not in ('42501','P0001') then
   raise exception 'TEST FAIL: unexpected SQLSTATE % for %: %',sqlstate,detail,sqlerrm;
  end if;
  raise notice 'PASS: % (rejected: %)',detail,sqlerrm;
 end;
end $$;
grant execute on function test.assert_true(boolean,text),test.expect_error(text,text) to authenticated,anon;
