create table if not exists employees (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  employee_code text, full_name text not null, document_number text, phone text, email text,
  position text not null default 'PRODUCTION', employment_type text not null default 'EMPLOYEE' check (employment_type in ('EMPLOYEE','CONTRACTOR')),
  salary_type text not null default 'MONTHLY' check (salary_type in ('MONTHLY','DAILY','HOURLY')),
  base_salary numeric(12,2) not null default 0 check (base_salary>=0), hourly_cost numeric(12,4) not null default 0 check (hourly_cost>=0),
  commission_rate numeric(7,4) not null default 0 check (commission_rate>=0), hire_date date, active boolean not null default true,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id,employee_code)
);
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade, work_date date not null,
  check_in time, check_out time, break_minutes integer not null default 0 check (break_minutes>=0), status text not null default 'PRESENT' check(status in ('PRESENT','ABSENT','LEAVE','REST')),
  notes text, created_at timestamptz not null default now(), unique(company_id,employee_id,work_date)
);
create table if not exists labor_allocations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict, work_order_id uuid not null references work_orders(id) on delete cascade,
  work_date date not null default current_date, hours numeric(10,3) not null check(hours>0), hourly_cost numeric(12,4) not null check(hourly_cost>=0), amount numeric(12,2) generated always as (round(hours*hourly_cost,2)) stored,
  notes text, created_at timestamptz not null default now()
);
create table if not exists employee_commissions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict, work_order_id uuid references work_orders(id) on delete set null,
  commission_date date not null default current_date, concept text not null, base_amount numeric(12,2) not null default 0 check(base_amount>=0), rate numeric(7,4) not null default 0 check(rate>=0), amount numeric(12,2) not null check(amount>=0),
  status text not null default 'PENDING' check(status in ('PENDING','PAID','CANCELLED')), notes text, created_at timestamptz not null default now()
);
create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  period_start date not null, period_end date not null, pay_date date, status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED','PAID','CANCELLED')),
  gross_total numeric(14,2) not null default 0, deductions_total numeric(14,2) not null default 0, net_total numeric(14,2) not null default 0,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(period_end>=period_start)
);
create table if not exists payroll_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade, employee_id uuid not null references employees(id) on delete restrict,
  base_pay numeric(12,2) not null default 0, overtime_pay numeric(12,2) not null default 0, commissions numeric(12,2) not null default 0, bonuses numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0, gross_pay numeric(12,2) generated always as (round(base_pay+overtime_pay+commissions+bonuses,2)) stored,
  net_pay numeric(12,2) generated always as (round(base_pay+overtime_pay+commissions+bonuses-deductions,2)) stored,
  notes text, created_at timestamptz not null default now(), unique(payroll_run_id,employee_id)
);
alter table work_order_costs add column if not exists employee_id uuid references employees(id) on delete set null;
alter table work_order_costs add column if not exists source_type text;
alter table work_order_costs add column if not exists source_id uuid;
create unique index if not exists work_order_costs_source_unique on work_order_costs(company_id,source_type,source_id) where source_id is not null;
create index if not exists employees_company_idx on employees(company_id,active);
create index if not exists attendance_employee_date_idx on attendance_records(employee_id,work_date);
create index if not exists labor_allocations_order_idx on labor_allocations(work_order_id,work_date);
create index if not exists labor_allocations_employee_idx on labor_allocations(employee_id,work_date);
create index if not exists commissions_employee_date_idx on employee_commissions(employee_id,commission_date);
create index if not exists payroll_runs_company_period_idx on payroll_runs(company_id,period_start,period_end);
create index if not exists payroll_items_employee_idx on payroll_items(employee_id);

create or replace function sync_labor_allocation_cost() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op='DELETE' then delete from work_order_costs where source_type='LABOR_ALLOCATION' and source_id=old.id; return old; end if;
  insert into work_order_costs(company_id,work_order_id,cost_type,description,amount,incurred_at,employee_id,source_type,source_id)
  values(new.company_id,new.work_order_id,'LABOR','Mano de obra · empleado',new.amount,new.work_date,new.employee_id,'LABOR_ALLOCATION',new.id)
  on conflict (company_id,source_type,source_id) where source_id is not null do update set work_order_id=excluded.work_order_id,amount=excluded.amount,incurred_at=excluded.incurred_at,employee_id=excluded.employee_id;
  return new;
end $$;
drop trigger if exists labor_allocation_cost_sync on labor_allocations;
create trigger labor_allocation_cost_sync after insert or update or delete on labor_allocations for each row execute function sync_labor_allocation_cost();

alter table employees enable row level security; alter table attendance_records enable row level security; alter table labor_allocations enable row level security; alter table employee_commissions enable row level security; alter table payroll_runs enable row level security; alter table payroll_items enable row level security;
do $$ declare t text; begin foreach t in array array['employees','attendance_records','labor_allocations','employee_commissions','payroll_runs','payroll_items'] loop execute format('drop policy if exists "members manage %1$s" on %1$I',t); execute format('create policy "members manage %1$s" on %1$I for all to authenticated using (is_company_member(company_id)) with check (is_company_member(company_id))',t); end loop; end $$;
grant select,insert,update,delete on employees,attendance_records,labor_allocations,employee_commissions,payroll_runs,payroll_items to authenticated;
