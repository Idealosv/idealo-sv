-- PRESTADITO$ / IDEALO SV
-- Repositorio documental privado para expedientes de inversionistas e inversiones.

create table if not exists public.inv_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  application_id uuid references public.inv_applications(id) on delete set null,
  investment_id uuid references public.inv_investments(id) on delete set null,
  document_code text not null,
  document_type text not null check(document_type in ('IDENTITY','CONTRACT','PAYMENT_PROOF','BENEFICIARY','FORM','ANNEX','OTHER')),
  title text not null,
  storage_path text not null,
  mime_type text not null default '',
  file_size bigint,
  document_date date,
  notes text not null default '',
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inactivated_by uuid,
  inactivated_at timestamptz,
  inactivation_reason text not null default '',
  unique(company_id,document_code)
);

create index if not exists inv_documents_investor_idx
  on public.inv_documents(investor_id,created_at desc);
create index if not exists inv_documents_investment_idx
  on public.inv_documents(investment_id,created_at desc);
create index if not exists inv_documents_company_type_idx
  on public.inv_documents(company_id,document_type,status,created_at desc);

drop trigger if exists trg_inv_documents_updated_at on public.inv_documents;
create trigger trg_inv_documents_updated_at
before update on public.inv_documents
for each row execute function public.inv_set_updated_at();

alter table public.inv_documents enable row level security;

drop policy if exists inv_documents_select on public.inv_documents;
create policy inv_documents_select on public.inv_documents
for select to authenticated
using(public.inv_company_member(company_id));

create or replace function public.inv_record_document(
  p_company_id uuid,
  p_investor_id uuid,
  p_application_id uuid,
  p_investment_id uuid,
  p_document_type text,
  p_title text,
  p_storage_path text,
  p_mime_type text default '',
  p_file_size bigint default null,
  p_document_date date default null,
  p_notes text default ''
)
returns public.inv_documents
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_type text;
  v_id uuid;
  v_code text;
  v_result public.inv_documents%rowtype;
begin
  if not public.inv_company_can_submit(p_company_id) then
    raise exception 'No tenés permiso para registrar documentos.';
  end if;

  if not exists(
    select 1 from public.inv_investors
    where id=p_investor_id and company_id=p_company_id
  ) then
    raise exception 'El inversionista no pertenece a esta empresa.';
  end if;

  if p_application_id is not null and not exists(
    select 1 from public.inv_applications
    where id=p_application_id and company_id=p_company_id and investor_id=p_investor_id
  ) then
    raise exception 'La solicitud indicada no pertenece a este inversionista.';
  end if;

  if p_investment_id is not null and not exists(
    select 1 from public.inv_investments
    where id=p_investment_id and company_id=p_company_id and investor_id=p_investor_id
  ) then
    raise exception 'La inversión indicada no pertenece a este inversionista.';
  end if;

  if coalesce(trim(p_title),'')='' then
    raise exception 'El título del documento es obligatorio.';
  end if;

  if coalesce(trim(p_storage_path),'')='' then
    raise exception 'El archivo es obligatorio.';
  end if;

  v_type:=upper(trim(coalesce(p_document_type,'')));
  if v_type not in ('IDENTITY','CONTRACT','PAYMENT_PROOF','BENEFICIARY','FORM','ANNEX','OTHER') then
    raise exception 'Tipo de documento no permitido.';
  end if;

  v_id:=gen_random_uuid();
  v_code:='DOC-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));

  insert into public.inv_documents(
    id,company_id,investor_id,application_id,investment_id,document_code,
    document_type,title,storage_path,mime_type,file_size,document_date,notes,status,created_by
  )
  values(
    v_id,p_company_id,p_investor_id,p_application_id,p_investment_id,v_code,
    v_type,trim(p_title),trim(p_storage_path),coalesce(trim(p_mime_type),''),
    p_file_size,p_document_date,coalesce(trim(p_notes),''),'ACTIVE',auth.uid()
  )
  returning * into v_result;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    p_company_id,p_investor_id,p_investment_id,'DOCUMENT_RECORDED',
    jsonb_build_object(
      'document_id',v_result.id,
      'document_code',v_result.document_code,
      'document_type',v_result.document_type,
      'title',v_result.title,
      'application_id',p_application_id
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

create or replace function public.inv_set_document_active(
  p_document_id uuid,
  p_active boolean,
  p_reason text default ''
)
returns public.inv_documents
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_row public.inv_documents%rowtype;
begin
  select * into v_row
  from public.inv_documents
  where id=p_document_id
  for update;

  if not found then
    raise exception 'Documento no encontrado.';
  end if;

  if not public.inv_company_can_review(v_row.company_id) then
    raise exception 'Solo propietario o administrador puede cambiar el estado de un documento.';
  end if;

  if not p_active and coalesce(trim(p_reason),'')='' then
    raise exception 'Indicá el motivo de la inactivación.';
  end if;

  update public.inv_documents
  set
    status=case when p_active then 'ACTIVE' else 'INACTIVE' end,
    inactivated_by=case when p_active then null else auth.uid() end,
    inactivated_at=case when p_active then null else now() end,
    inactivation_reason=case when p_active then '' else trim(p_reason) end,
    updated_at=now()
  where id=p_document_id
  returning * into v_row;

  insert into public.inv_audit_log(company_id,investor_id,investment_id,action,detail,created_by)
  values(
    v_row.company_id,v_row.investor_id,v_row.investment_id,
    case when p_active then 'DOCUMENT_REACTIVATED' else 'DOCUMENT_INACTIVATED' end,
    jsonb_build_object(
      'document_id',v_row.id,
      'document_code',v_row.document_code,
      'reason',v_row.inactivation_reason
    ),
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.inv_record_document(uuid,uuid,uuid,uuid,text,text,text,text,bigint,date,text) from public;
revoke all on function public.inv_set_document_active(uuid,boolean,text) from public;
grant execute on function public.inv_record_document(uuid,uuid,uuid,uuid,text,text,text,text,bigint,date,text) to authenticated,service_role;
grant execute on function public.inv_set_document_active(uuid,boolean,text) to authenticated,service_role;

grant select on public.inv_documents to authenticated;
grant all privileges on public.inv_documents to service_role;
revoke insert,update,delete on public.inv_documents from authenticated;
