create table public.bar_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  employee_id uuid null references public.employees(id) on delete set null,
  display_name text not null default '',
  bar_role text not null default 'waiter' check (bar_role in ('owner','manager','cashier','waiter','kitchen','bar','warehouse')),
  active boolean not null default true,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bar_staff_assignments_company_member_fk foreign key (company_id,user_id) references public.company_members(company_id,user_id) on delete cascade,
  constraint bar_staff_assignments_company_user_key unique(company_id,user_id)
);
create index bar_staff_assignments_employee_idx on public.bar_staff_assignments(employee_id);
create index bar_staff_assignments_created_by_idx on public.bar_staff_assignments(created_by);
create index bar_staff_assignments_updated_by_idx on public.bar_staff_assignments(updated_by);
create index bar_staff_assignments_company_role_idx on public.bar_staff_assignments(company_id,active,bar_role);

create table public.bar_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  business_name text not null default 'IDEALO BAR',
  timezone text not null default 'America/El_Salvador',
  opening_time time null,
  closing_time time null,
  suggested_tip_percent numeric(6,2) not null default 10 check (suggested_tip_percent between 0 and 100),
  default_guest_count integer not null default 1 check (default_guest_count between 1 and 100),
  manual_discounts_enabled boolean not null default true,
  max_manual_discount_percent numeric(6,2) not null default 20 check (max_manual_discount_percent between 0 and 100),
  require_void_reason boolean not null default true,
  require_manager_after_send boolean not null default true,
  default_dte_environment text not null default 'test' check (default_dte_environment in ('test','production')),
  default_dte_type text not null default '01' check (default_dte_type in ('01','03')),
  low_stock_notifications boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bar_settings_created_by_idx on public.bar_settings(created_by);
create index bar_settings_updated_by_idx on public.bar_settings(updated_by);

create table public.bar_admin_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  area text not null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  details jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index bar_admin_audit_company_created_idx on public.bar_admin_audit(company_id,created_at desc);
create index bar_admin_audit_actor_idx on public.bar_admin_audit(actor_user_id);
create index bar_admin_audit_entity_idx on public.bar_admin_audit(company_id,entity_type,entity_id);

alter table public.bar_staff_assignments enable row level security;
alter table public.bar_settings enable row level security;
alter table public.bar_admin_audit enable row level security;

create policy bar_staff_assignments_select on public.bar_staff_assignments for select to authenticated using (public.erp_can_read(company_id));
create policy bar_staff_assignments_insert on public.bar_staff_assignments for insert to authenticated with check (public.erp_can_admin(company_id));
create policy bar_staff_assignments_update on public.bar_staff_assignments for update to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
create policy bar_staff_assignments_delete on public.bar_staff_assignments for delete to authenticated using (public.erp_can_admin(company_id));
create policy bar_settings_select on public.bar_settings for select to authenticated using (public.erp_can_read(company_id));
create policy bar_settings_insert on public.bar_settings for insert to authenticated with check (public.erp_can_admin(company_id));
create policy bar_settings_update on public.bar_settings for update to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
create policy bar_settings_delete on public.bar_settings for delete to authenticated using (public.erp_can_admin(company_id));
create policy bar_admin_audit_select on public.bar_admin_audit for select to authenticated using (public.erp_can_admin(company_id));

revoke all on public.bar_staff_assignments from anon;
revoke all on public.bar_settings from anon;
revoke all on public.bar_admin_audit from anon;
grant select,insert,update,delete on public.bar_staff_assignments to authenticated;
grant select,insert,update,delete on public.bar_settings to authenticated;
grant select on public.bar_admin_audit to authenticated;
grant all on public.bar_staff_assignments to service_role;
grant all on public.bar_settings to service_role;
grant all on public.bar_admin_audit to service_role;
grant usage,select on sequence public.bar_admin_audit_id_seq to service_role;

create trigger bar_staff_assignments_touch before update on public.bar_staff_assignments for each row execute function public.bar_touch_updated_at();
create trigger bar_settings_touch before update on public.bar_settings for each row execute function public.bar_touch_updated_at();

create or replace function public.bar_validate_staff_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_central public.company_role; v_name text; v_employee_company uuid; v_employee_user uuid;
begin
  select role into v_central from public.company_members where company_id=new.company_id and user_id=new.user_id;
  if not found then raise exception 'El usuario no pertenece a esta empresa.'; end if;
  if new.bar_role='owner' and v_central<>'owner' then raise exception 'El rol Propietario del bar requiere rol owner de la empresa.'; end if;
  if new.bar_role='manager' and v_central not in ('owner','admin') then raise exception 'El rol Gerente requiere owner/admin de la empresa.'; end if;
  if v_central='viewer' and new.active then raise exception 'Un usuario viewer no puede quedar activo como personal operativo del bar.'; end if;
  if new.employee_id is not null then
    select company_id,user_id into v_employee_company,v_employee_user from public.employees where id=new.employee_id;
    if not found or v_employee_company<>new.company_id then raise exception 'El empleado no pertenece a esta empresa.'; end if;
    if v_employee_user is not null and v_employee_user<>new.user_id then raise exception 'El empleado está vinculado a otro usuario.'; end if;
  end if;
  if nullif(trim(new.display_name),'') is null then
    select nullif(trim(full_name),'') into v_name from public.profiles where id=new.user_id;
    if v_name is null and new.employee_id is not null then select nullif(trim(full_name),'') into v_name from public.employees where id=new.employee_id; end if;
    new.display_name=coalesce(v_name,'Usuario del bar');
  end if;
  new.updated_by=coalesce(auth.uid(),new.updated_by);
  if v_central='owner' then new.bar_role='owner'; new.active=true; end if;
  return new;
end; $$;
revoke execute on function public.bar_validate_staff_assignment() from public,anon,authenticated;
create trigger bar_staff_assignments_validate before insert or update on public.bar_staff_assignments for each row execute function public.bar_validate_staff_assignment();

create or replace function public.bar_sync_company_member_to_staff()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  select nullif(trim(full_name),'') into v_name from public.profiles where id=new.user_id;
  insert into public.bar_staff_assignments(company_id,user_id,display_name,bar_role,active,created_by,updated_by)
  values(new.company_id,new.user_id,coalesce(v_name,'Usuario del bar'),case new.role when 'owner' then 'owner' when 'admin' then 'manager' else 'waiter' end,new.role<>'viewer',auth.uid(),auth.uid())
  on conflict(company_id,user_id) do update set
    display_name=case when public.bar_staff_assignments.display_name in ('','Usuario del bar') then excluded.display_name else public.bar_staff_assignments.display_name end,
    bar_role=case when new.role='owner' then 'owner' when new.role='admin' and public.bar_staff_assignments.bar_role='owner' then 'manager' else public.bar_staff_assignments.bar_role end,
    active=case when new.role='viewer' then false else public.bar_staff_assignments.active end,
    updated_at=now();
  return new;
end; $$;
revoke execute on function public.bar_sync_company_member_to_staff() from public,anon,authenticated;
create trigger trg_bar_sync_company_member_to_staff after insert or update of role on public.company_members for each row execute function public.bar_sync_company_member_to_staff();

insert into public.bar_staff_assignments(company_id,user_id,display_name,bar_role,active,created_by,updated_by)
select cm.company_id,cm.user_id,coalesce(nullif(trim(p.full_name),''),'Usuario del bar'),case cm.role when 'owner' then 'owner' when 'admin' then 'manager' else 'waiter' end,cm.role<>'viewer',cm.user_id,cm.user_id
from public.company_members cm left join public.profiles p on p.id=cm.user_id
on conflict(company_id,user_id) do nothing;

create or replace function public.bar_admin_audit_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_entity text; v_area text; v_details jsonb;
begin
  if tg_op='DELETE' then v_company=old.company_id; v_entity=coalesce(to_jsonb(old)->>'id',v_company::text); else v_company=new.company_id; v_entity=coalesce(to_jsonb(new)->>'id',v_company::text); end if;
  v_area=case tg_table_name when 'bar_staff_assignments' then 'PERSONAL' when 'bar_settings' then 'CONFIGURACION' when 'bar_promotions' then 'PROMOCIONES' else 'ADMINISTRACION' end;
  v_details=jsonb_build_object('operation',tg_op,'before',case when tg_op='INSERT' then null else to_jsonb(old) end,'after',case when tg_op='DELETE' then null else to_jsonb(new) end);
  insert into public.bar_admin_audit(company_id,area,action,entity_type,entity_id,details,actor_user_id) values(v_company,v_area,tg_op,upper(tg_table_name),v_entity,v_details,auth.uid());
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke execute on function public.bar_admin_audit_trigger() from public,anon,authenticated;
create trigger bar_staff_assignments_audit after insert or update or delete on public.bar_staff_assignments for each row execute function public.bar_admin_audit_trigger();
create trigger bar_settings_audit after insert or update or delete on public.bar_settings for each row execute function public.bar_admin_audit_trigger();
create trigger bar_promotions_admin_audit after insert or update or delete on public.bar_promotions for each row execute function public.bar_admin_audit_trigger();