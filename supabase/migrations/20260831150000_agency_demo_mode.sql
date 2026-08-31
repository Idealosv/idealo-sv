-- IDEALO SV · Entorno Demo para Agencias
-- Marca empresas de evaluación, registra vencimiento y bloquea DTE de PRODUCCIÓN a nivel de base.

alter table public.companies
  add column if not exists demo_mode boolean not null default false,
  add column if not exists demo_label text,
  add column if not exists demo_expires_at timestamptz,
  add column if not exists demo_seeded_at timestamptz;

create index if not exists companies_demo_mode_idx
  on public.companies(demo_mode, demo_expires_at)
  where demo_mode = true;

create or replace function public.block_demo_company_production_dte()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  is_demo boolean := false;
begin
  if new.environment <> 'production' then
    return new;
  end if;

  select coalesce(c.demo_mode, false)
    into is_demo
  from public.companies c
  where c.id = new.company_id;

  if is_demo then
    raise exception using
      errcode = '42501',
      message = 'ENTORNO DEMO: los DTE de PRODUCCIÓN están bloqueados. Utilice ambiente TEST.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_demo_company_production_dte on public.dte_documents;
create trigger trg_block_demo_company_production_dte
before insert or update of environment, company_id on public.dte_documents
for each row execute function public.block_demo_company_production_dte();

comment on column public.companies.demo_mode is 'Empresa destinada a demostraciones comerciales. Nunca debe transmitir DTE de PRODUCCIÓN.';
comment on column public.companies.demo_expires_at is 'Fecha hasta la cual se ofrece acceso de evaluación a la empresa demo.';
comment on function public.block_demo_company_production_dte() is 'Defensa en profundidad que impide crear o convertir DTE de PRODUCCIÓN para empresas demo.';
