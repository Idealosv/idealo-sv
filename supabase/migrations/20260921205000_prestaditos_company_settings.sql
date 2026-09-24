-- PRESTADITO$ / IDEALO SV
-- Configuración operativa por empresa. No define ni inventa la fórmula de rendimiento.

create table if not exists public.inv_company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  allowed_term_months integer[] not null default '{}'::integer[],
  payment_methods text[] not null default '{}'::text[],
  payment_places text[] not null default '{}'::text[],
  operational_notes text not null default '',
  yield_mode text not null default 'MANUAL_PENDING_RULE'
    check(yield_mode in ('MANUAL_PENDING_RULE')),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inv_company_settings_updated_at on public.inv_company_settings;
create trigger trg_inv_company_settings_updated_at
before update on public.inv_company_settings
for each row execute function public.inv_set_updated_at();

alter table public.inv_company_settings enable row level security;

drop policy if exists inv_company_settings_select on public.inv_company_settings;
create policy inv_company_settings_select on public.inv_company_settings
for select to authenticated
using(public.inv_company_member(company_id));

create or replace function public.inv_save_company_settings(
  p_company_id uuid,
  p_allowed_term_months integer[] default '{}'::integer[],
  p_payment_methods text[] default '{}'::text[],
  p_payment_places text[] default '{}'::text[],
  p_operational_notes text default ''
)
returns public.inv_company_settings
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_terms integer[];
  v_methods text[];
  v_places text[];
  v_result public.inv_company_settings%rowtype;
begin
  if not public.inv_company_can_review(p_company_id) then
    raise exception 'Solo propietario o administrador puede modificar la configuración.';
  end if;

  select coalesce(array_agg(distinct value order by value),'{}'::integer[])
    into v_terms
  from unnest(coalesce(p_allowed_term_months,'{}'::integer[])) value
  where value>0 and value<=240;

  if cardinality(v_terms)<>cardinality(coalesce(p_allowed_term_months,'{}'::integer[])) then
    raise exception 'Los plazos deben ser meses enteros entre 1 y 240 y no deben repetirse.';
  end if;

  select coalesce(array_agg(value order by first_pos),'{}'::text[])
    into v_methods
  from (
    select min(ord) first_pos, trim(value) value
    from unnest(coalesce(p_payment_methods,'{}'::text[])) with ordinality as t(value,ord)
    where trim(value)<>''
    group by lower(trim(value)),trim(value)
  ) normalized;

  select coalesce(array_agg(value order by first_pos),'{}'::text[])
    into v_places
  from (
    select min(ord) first_pos, trim(value) value
    from unnest(coalesce(p_payment_places,'{}'::text[])) with ordinality as t(value,ord)
    where trim(value)<>''
    group by lower(trim(value)),trim(value)
  ) normalized;

  insert into public.inv_company_settings(
    company_id,allowed_term_months,payment_methods,payment_places,
    operational_notes,yield_mode,created_by,updated_by
  )
  values(
    p_company_id,v_terms,v_methods,v_places,
    coalesce(trim(p_operational_notes),''),'MANUAL_PENDING_RULE',auth.uid(),auth.uid()
  )
  on conflict(company_id) do update set
    allowed_term_months=excluded.allowed_term_months,
    payment_methods=excluded.payment_methods,
    payment_places=excluded.payment_places,
    operational_notes=excluded.operational_notes,
    yield_mode='MANUAL_PENDING_RULE',
    updated_by=auth.uid(),
    updated_at=now()
  returning * into v_result;

  insert into public.inv_audit_log(company_id,action,detail,created_by)
  values(
    p_company_id,'CONFIGURATION_UPDATED',
    jsonb_build_object(
      'allowed_term_months',v_result.allowed_term_months,
      'payment_methods',v_result.payment_methods,
      'payment_places',v_result.payment_places,
      'yield_mode',v_result.yield_mode
    ),
    auth.uid()
  );

  return v_result;
end;
$$;

revoke all on function public.inv_save_company_settings(uuid,integer[],text[],text[],text) from public;
grant execute on function public.inv_save_company_settings(uuid,integer[],text[],text[],text) to authenticated,service_role;

grant select on public.inv_company_settings to authenticated;
grant all privileges on public.inv_company_settings to service_role;
revoke insert,update,delete on public.inv_company_settings from authenticated;
