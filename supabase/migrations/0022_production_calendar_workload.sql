create table if not exists public.production_schedule_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete set null,
  event_type text not null default 'PRODUCTION' check (event_type in ('DESIGN','PRODUCTION','INSTALLATION','DELIVERY','SITE_VISIT','OTHER')),
  title text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  estimated_hours numeric(10,2) not null default 0 check (estimated_hours >= 0),
  status text not null default 'PLANNED' check (status in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create table if not exists public.production_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.production_schedule_events(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  allocated_hours numeric(10,2) not null default 0 check (allocated_hours >= 0),
  role text,
  created_at timestamptz not null default now(),
  unique(event_id, employee_id)
);

create index if not exists idx_schedule_events_company_start on public.production_schedule_events(company_id, scheduled_start);
create index if not exists idx_schedule_events_work_order on public.production_schedule_events(work_order_id);
create index if not exists idx_schedule_assignments_company_employee on public.production_schedule_assignments(company_id, employee_id);
create index if not exists idx_schedule_assignments_event on public.production_schedule_assignments(event_id);

alter table public.production_schedule_events enable row level security;
alter table public.production_schedule_assignments enable row level security;

create policy schedule_events_company_all on public.production_schedule_events for all to authenticated
using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy schedule_assignments_company_all on public.production_schedule_assignments for all to authenticated
using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create or replace function public.validate_schedule_assignment_company()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not exists (
    select 1 from public.production_schedule_events e
    join public.employees emp on emp.id = new.employee_id
    where e.id = new.event_id and e.company_id = new.company_id and emp.company_id = new.company_id
  ) then raise exception 'Evento y empleado deben pertenecer a la misma empresa'; end if;
  return new;
end; $$;

drop trigger if exists trg_validate_schedule_assignment_company on public.production_schedule_assignments;
create trigger trg_validate_schedule_assignment_company before insert or update on public.production_schedule_assignments
for each row execute function public.validate_schedule_assignment_company();
