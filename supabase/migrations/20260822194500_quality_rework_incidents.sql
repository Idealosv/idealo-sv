create table if not exists public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  checked_by_employee_id uuid references public.employees(id) on delete set null,
  check_stage text not null default 'FINAL' check (check_stage in ('DESIGN','PREPRESS','PRODUCTION','FINAL','INSTALLATION','DELIVERY')),
  result text not null default 'PENDING' check (result in ('PENDING','APPROVED','REJECTED','CONDITIONAL')),
  checklist jsonb not null default '{}'::jsonb,
  observations text,
  checked_at timestamptz not null default now(),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quality_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  quality_check_id uuid references public.quality_checks(id) on delete set null,
  reported_by_employee_id uuid references public.employees(id) on delete set null,
  responsible_employee_id uuid references public.employees(id) on delete set null,
  incident_type text not null check (incident_type in ('PRINT_ERROR','MEASUREMENT_ERROR','COLOR_ERROR','DESIGN_ERROR','MATERIAL_DAMAGE','INSTALLATION_ERROR','CLIENT_CHANGE','MACHINE_FAILURE','OTHER')),
  severity text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_REWORK','RESOLVED','CANCELLED')),
  title text not null,
  description text,
  root_cause text,
  corrective_action text,
  material_cost numeric(14,2) not null default 0 check (material_cost >= 0),
  labor_cost numeric(14,2) not null default 0 check (labor_cost >= 0),
  outsourced_cost numeric(14,2) not null default 0 check (outsourced_cost >= 0),
  other_cost numeric(14,2) not null default 0 check (other_cost >= 0),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quality_checks_company_order on public.quality_checks(company_id,work_order_id,checked_at desc);
create index if not exists idx_quality_incidents_company_order on public.quality_incidents(company_id,work_order_id,status);
create index if not exists idx_quality_incidents_responsible on public.quality_incidents(responsible_employee_id);

alter table public.quality_checks enable row level security;
alter table public.quality_incidents enable row level security;

drop policy if exists quality_checks_company_access on public.quality_checks;
create policy quality_checks_company_access on public.quality_checks for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists quality_incidents_company_access on public.quality_incidents;
create policy quality_incidents_company_access on public.quality_incidents for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create or replace function public.sync_quality_incident_cost() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_amount numeric(14,2);
begin
  v_amount := coalesce(new.material_cost,0)+coalesce(new.labor_cost,0)+coalesce(new.outsourced_cost,0)+coalesce(new.other_cost,0);
  delete from public.work_order_costs where source_type='QUALITY_INCIDENT' and source_id=new.id;
  if new.status <> 'CANCELLED' and v_amount > 0 then
    insert into public.work_order_costs(company_id,work_order_id,cost_type,concept,amount,notes,incurred_at,source_type,source_id)
    values(new.company_id,new.work_order_id,'OTHER','Retrabajo / incidencia de calidad',v_amount,new.title,new.occurred_at::date,'QUALITY_INCIDENT',new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_quality_incident_cost on public.quality_incidents;
create trigger trg_sync_quality_incident_cost after insert or update of material_cost,labor_cost,outsourced_cost,other_cost,status,work_order_id,title on public.quality_incidents for each row execute function public.sync_quality_incident_cost();

create or replace function public.delete_quality_incident_cost() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  delete from public.work_order_costs where source_type='QUALITY_INCIDENT' and source_id=old.id;
  return old;
end $$;

drop trigger if exists trg_delete_quality_incident_cost on public.quality_incidents;
create trigger trg_delete_quality_incident_cost after delete on public.quality_incidents for each row execute function public.delete_quality_incident_cost();