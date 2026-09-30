-- PRESTADITO$ / IDEALO SV
-- Beneficiarios avanzados: edición controlada, estados y trazabilidad sin borrado.

alter table public.inv_beneficiaries
  add column if not exists beneficiary_code text,
  add column if not exists email text not null default '',
  add column if not exists alternate_phone text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid;

update public.inv_beneficiaries
set beneficiary_code=
  'BEN-' || to_char(created_at at time zone 'America/El_Salvador','YYYYMMDD') || '-' ||
  upper(substr(replace(id::text,'-',''),1,6))
where coalesce(trim(beneficiary_code),'')='';

create unique index if not exists inv_beneficiaries_company_code_uidx
  on public.inv_beneficiaries(company_id,beneficiary_code);

create unique index if not exists inv_beneficiaries_investor_dui_uidx
  on public.inv_beneficiaries(investor_id,dui)
  where trim(dui)<>'' and active=true;

create or replace function public.inv_save_beneficiary(
  p_beneficiary_id uuid,
  p_company_id uuid,
  p_investor_id uuid,
  p_full_name text,
  p_dui text default '',
  p_birth_date date default null,
  p_relationship text default '',
  p_phone text default '',
  p_alternate_phone text default '',
  p_email text default '',
  p_address text default '',
  p_percentage numeric default 0,
  p_notes text default ''
)
returns public.inv_beneficiaries
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_result public.inv_beneficiaries%rowtype;
  v_total numeric;
  v_id uuid;
  v_code text;
begin
  if not public.inv_company_can_review(p_company_id) then
    raise exception 'Solo propietario o administrador puede modificar beneficiarios.';
  end if;

  if not exists(
    select 1 from public.inv_investors
    where id=p_investor_id and company_id=p_company_id
  ) then
    raise exception 'El inversionista no pertenece a esta empresa.';
  end if;

  if coalesce(trim(p_full_name),'')='' then
    raise exception 'El nombre del beneficiario es obligatorio.';
  end if;

  if coalesce(p_percentage,0)<=0 or p_percentage>100 then
    raise exception 'El porcentaje debe ser mayor que cero y no superar 100%%.';
  end if;

  select coalesce(sum(percentage),0)
    into v_total
  from public.inv_beneficiaries
  where investor_id=p_investor_id
    and active=true
    and id<>coalesce(p_beneficiary_id,'00000000-0000-0000-0000-000000000000'::uuid);

  if v_total+p_percentage>100 then
    raise exception 'El porcentaje total de beneficiarios activos no puede superar 100%%.';
  end if;

  if p_beneficiary_id is null then
    v_id:=gen_random_uuid();
    v_code:='BEN-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,6));

    insert into public.inv_beneficiaries(
      id,company_id,investor_id,beneficiary_code,full_name,dui,birth_date,relationship,
      phone,alternate_phone,email,address,percentage,active,notes,created_by
    )
    values(
      v_id,p_company_id,p_investor_id,v_code,trim(p_full_name),coalesce(trim(p_dui),''),
      p_birth_date,coalesce(trim(p_relationship),''),coalesce(trim(p_phone),''),
      coalesce(trim(p_alternate_phone),''),lower(coalesce(trim(p_email),'')),
      coalesce(trim(p_address),''),p_percentage,true,coalesce(trim(p_notes),''),auth.uid()
    )
    returning * into v_result;

    insert into public.inv_audit_log(company_id,investor_id,action,detail,created_by)
    values(
      p_company_id,p_investor_id,'BENEFICIARY_ADDED',
      jsonb_build_object(
        'beneficiary_id',v_result.id,
        'beneficiary_code',v_result.beneficiary_code,
        'full_name',v_result.full_name,
        'percentage',v_result.percentage
      ),
      auth.uid()
    );
  else
    update public.inv_beneficiaries
    set
      full_name=trim(p_full_name),
      dui=coalesce(trim(p_dui),''),
      birth_date=p_birth_date,
      relationship=coalesce(trim(p_relationship),''),
      phone=coalesce(trim(p_phone),''),
      alternate_phone=coalesce(trim(p_alternate_phone),''),
      email=lower(coalesce(trim(p_email),'')),
      address=coalesce(trim(p_address),''),
      percentage=p_percentage,
      notes=coalesce(trim(p_notes),''),
      updated_at=now()
    where id=p_beneficiary_id
      and company_id=p_company_id
      and investor_id=p_investor_id
      and active=true
    returning * into v_result;

    if not found then
      raise exception 'Beneficiario activo no encontrado.';
    end if;

    insert into public.inv_audit_log(company_id,investor_id,action,detail,created_by)
    values(
      p_company_id,p_investor_id,'BENEFICIARY_UPDATED',
      jsonb_build_object(
        'beneficiary_id',v_result.id,
        'beneficiary_code',v_result.beneficiary_code,
        'full_name',v_result.full_name,
        'percentage',v_result.percentage
      ),
      auth.uid()
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.inv_set_beneficiary_active(
  p_beneficiary_id uuid,
  p_active boolean,
  p_reason text default ''
)
returns public.inv_beneficiaries
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_row public.inv_beneficiaries%rowtype;
  v_total numeric;
begin
  select * into v_row
  from public.inv_beneficiaries
  where id=p_beneficiary_id
  for update;

  if not found then
    raise exception 'Beneficiario no encontrado.';
  end if;

  if not public.inv_company_can_review(v_row.company_id) then
    raise exception 'Solo propietario o administrador puede cambiar beneficiarios.';
  end if;

  if p_active and not v_row.active then
    select coalesce(sum(percentage),0)
      into v_total
    from public.inv_beneficiaries
    where investor_id=v_row.investor_id
      and active=true
      and id<>v_row.id;

    if v_total+v_row.percentage>100 then
      raise exception 'No se puede reactivar porque el total superaría 100%%.';
    end if;
  end if;

  update public.inv_beneficiaries
  set
    active=p_active,
    deactivated_at=case when p_active then null else now() end,
    deactivated_by=case when p_active then null else auth.uid() end,
    updated_at=now()
  where id=p_beneficiary_id
  returning * into v_row;

  insert into public.inv_audit_log(company_id,investor_id,action,detail,created_by)
  values(
    v_row.company_id,v_row.investor_id,
    case when p_active then 'BENEFICIARY_REACTIVATED' else 'BENEFICIARY_DEACTIVATED' end,
    jsonb_build_object(
      'beneficiary_id',v_row.id,
      'beneficiary_code',v_row.beneficiary_code,
      'reason',coalesce(trim(p_reason),'')
    ),
    auth.uid()
  );

  return v_row;
end;
$$;

revoke all on function public.inv_save_beneficiary(uuid,uuid,uuid,text,text,date,text,text,text,text,text,numeric,text) from public;
revoke all on function public.inv_set_beneficiary_active(uuid,boolean,text) from public;
grant execute on function public.inv_save_beneficiary(uuid,uuid,uuid,text,text,date,text,text,text,text,text,numeric,text) to authenticated,service_role;
grant execute on function public.inv_set_beneficiary_active(uuid,boolean,text) to authenticated,service_role;

revoke insert,update,delete on public.inv_beneficiaries from authenticated;
drop policy if exists inv_member_insert on public.inv_beneficiaries;
drop policy if exists inv_member_update on public.inv_beneficiaries;
drop policy if exists inv_member_delete on public.inv_beneficiaries;
