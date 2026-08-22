-- Evidencia móvil de producción, instalación y entrega
create table if not exists public.work_order_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete set null,
  evidence_type text not null check (evidence_type in ('PRODUCTION','INSTALLATION','DELIVERY','SIGNATURE','OTHER')),
  storage_path text not null,
  file_name text,
  mime_type text,
  notes text,
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  recipient_name text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists work_order_evidence_company_order_idx on public.work_order_evidence(company_id, work_order_id, created_at desc);
alter table public.work_order_evidence enable row level security;

drop policy if exists evidence_company_select on public.work_order_evidence;
create policy evidence_company_select on public.work_order_evidence for select using (is_company_member(company_id));
drop policy if exists evidence_company_insert on public.work_order_evidence;
create policy evidence_company_insert on public.work_order_evidence for insert with check (is_company_member(company_id) and created_by = auth.uid());
drop policy if exists evidence_company_update on public.work_order_evidence;
create policy evidence_company_update on public.work_order_evidence for update using (exists(select 1 from public.company_members cm where cm.company_id=work_order_evidence.company_id and cm.user_id=auth.uid() and cm.role in ('owner','admin')));
drop policy if exists evidence_company_delete on public.work_order_evidence;
create policy evidence_company_delete on public.work_order_evidence for delete using (exists(select 1 from public.company_members cm where cm.company_id=work_order_evidence.company_id and cm.user_id=auth.uid() and cm.role in ('owner','admin')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('work-order-evidence','work-order-evidence',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists work_order_evidence_storage_select on storage.objects;
create policy work_order_evidence_storage_select on storage.objects for select to authenticated using (
  bucket_id='work-order-evidence' and exists(
    select 1 from public.company_members cm
    where cm.user_id=auth.uid() and cm.company_id=((storage.foldername(name))[1])::uuid
  )
);
drop policy if exists work_order_evidence_storage_insert on storage.objects;
create policy work_order_evidence_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='work-order-evidence' and exists(
    select 1 from public.company_members cm
    where cm.user_id=auth.uid() and cm.company_id=((storage.foldername(name))[1])::uuid
  )
);
drop policy if exists work_order_evidence_storage_delete on storage.objects;
create policy work_order_evidence_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='work-order-evidence' and exists(
    select 1 from public.company_members cm
    where cm.user_id=auth.uid() and cm.company_id=((storage.foldername(name))[1])::uuid and cm.role in ('owner','admin')
  )
);
