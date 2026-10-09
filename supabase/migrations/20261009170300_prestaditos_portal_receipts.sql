-- Optional receipt upload for investment applications. Same ERP application record.
alter table public.inv_applications
 add column if not exists portal_receipt_path text;
create extension if not exists pgcrypto;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('prestaditos-portal-receipts','prestaditos-portal-receipts',false,5242880,
array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- These SECURITY DEFINER helpers are necessary because investor users are
-- NOT company_members and must never receive broad inv_applications SELECT privileges.
create function public.inv_portal_receipt_upload_allowed(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
 select length(coalesce(p_path,''))<=280
  and cardinality(string_to_array(coalesce(p_path,''),'/'))=4
  and exists (
   select 1 from public.inv_portal_links l
   join public.inv_portal_enrollments e on e.company_id=l.company_id
     and e.user_id=l.user_id and e.status='APPROVED'
   join public.inv_investors i on i.company_id=l.company_id
     and i.id=l.investor_id and i.status='ACTIVE'
   join public.inv_applications a on a.company_id=l.company_id
     and a.investor_id=l.investor_id and a.created_by=l.user_id and a.status='PENDING'
   where l.user_id=auth.uid()
    and l.company_id::text=split_part(p_path,'/',1)
    and l.user_id::text=split_part(p_path,'/',2)
    and a.id::text=split_part(p_path,'/',3)
    and a.portal_receipt_path is null
    and public.inv_portal_company_available(l.company_id)
 );
$$;

create function public.inv_portal_receipt_read_allowed(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
 select length(coalesce(p_path,''))<=280
  and cardinality(string_to_array(coalesce(p_path,''),'/'))=4
  and (
   exists (
    select 1 from public.inv_portal_links l
    join public.inv_portal_enrollments e on e.company_id=l.company_id
      and e.user_id=l.user_id and e.status='APPROVED'
    join public.inv_investors i on i.company_id=l.company_id
      and i.id=l.investor_id and i.status='ACTIVE'
    where l.user_id=auth.uid()
      and l.company_id::text=split_part(p_path,'/',1)
      and l.user_id::text=split_part(p_path,'/',2)
   )
   or exists (
    select 1 from public.companies c
    where c.id::text=split_part(p_path,'/',1)
      and public.inv_company_can_review(c.id)
   )
  );
$$;
revoke all on function public.inv_portal_receipt_upload_allowed(text),
 public.inv_portal_receipt_read_allowed(text) from public,anon;
grant execute on function public.inv_portal_receipt_upload_allowed(text),
 public.inv_portal_receipt_read_allowed(text) to authenticated;

create policy inv_portal_receipt_upload on storage.objects
for insert to authenticated with check (
 bucket_id='prestaditos-portal-receipts'
 and public.inv_portal_receipt_upload_allowed(name)
);
create policy inv_portal_receipt_read on storage.objects
for select to authenticated using (
 bucket_id='prestaditos-portal-receipts'
 and public.inv_portal_receipt_read_allowed(name)
);

create function public.inv_portal_attach_receipt(p_application uuid,p_path text)
returns void language plpgsql security definer set search_path=''
as $$
declare a public.inv_applications%rowtype;
begin
 select * into a from public.inv_applications where id=p_application for update;
 if not found or a.status<>'PENDING' or a.created_by<>auth.uid() or a.portal_receipt_path is not null
 then raise exception 'Solicitud sin permiso para adjuntar'; end if;
 if not exists (select 1 from public.inv_portal_links l
   join public.inv_portal_enrollments e on e.user_id=l.user_id and e.company_id=l.company_id and e.status='APPROVED'
   where l.user_id=auth.uid() and l.company_id=a.company_id and l.investor_id=a.investor_id)
 then raise exception 'Cuenta no autorizada'; end if;
 if p_path not like a.company_id::text||'/'||auth.uid()::text||'/'||p_application::text||'/%'
 then raise exception 'Ruta de comprobante inválida'; end if;
 if length(p_path)>280 or not exists(select 1 from storage.objects where bucket_id='prestaditos-portal-receipts' and name=p_path)
 then raise exception 'Archivo no encontrado'; end if;
 update public.inv_applications set portal_receipt_path=p_path where id=p_application;
 insert into public.inv_audit_log(company_id,investor_id,action,detail,created_by)
 values(a.company_id,a.investor_id,'PORTAL_RECEIPT_ATTACHED',jsonb_build_object('application_id',a.id),auth.uid());
end $$;
revoke all on function public.inv_portal_attach_receipt(uuid,text) from public,anon;
grant execute on function public.inv_portal_attach_receipt(uuid,text) to authenticated;
