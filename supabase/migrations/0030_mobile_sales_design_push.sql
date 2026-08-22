-- App móvil: ventas rápidas, aprobación de diseño y suscripciones push

create table if not exists public.mobile_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
alter table public.mobile_push_subscriptions enable row level security;
drop policy if exists mobile_push_own_select on public.mobile_push_subscriptions;
create policy mobile_push_own_select on public.mobile_push_subscriptions for select using (user_id=auth.uid() and is_company_member(company_id));
drop policy if exists mobile_push_own_insert on public.mobile_push_subscriptions;
create policy mobile_push_own_insert on public.mobile_push_subscriptions for insert with check (user_id=auth.uid() and is_company_member(company_id));
drop policy if exists mobile_push_own_update on public.mobile_push_subscriptions;
create policy mobile_push_own_update on public.mobile_push_subscriptions for update using (user_id=auth.uid() and is_company_member(company_id));
drop policy if exists mobile_push_own_delete on public.mobile_push_subscriptions;
create policy mobile_push_own_delete on public.mobile_push_subscriptions for delete using (user_id=auth.uid() and is_company_member(company_id));

create table if not exists public.design_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','CHANGES_REQUESTED')),
  comments text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(work_order_id)
);
alter table public.design_approvals enable row level security;
drop policy if exists design_approvals_company_select on public.design_approvals;
create policy design_approvals_company_select on public.design_approvals for select using (is_company_member(company_id));
drop policy if exists design_approvals_company_insert on public.design_approvals;
create policy design_approvals_company_insert on public.design_approvals for insert with check (is_company_member(company_id));
drop policy if exists design_approvals_company_update on public.design_approvals;
create policy design_approvals_company_update on public.design_approvals for update using (is_company_member(company_id));

create or replace function public.mobile_create_quick_quote(p_company_id uuid,p_client_id uuid,p_description text,p_quantity numeric,p_unit_price numeric,p_valid_until date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_role text; v_quote uuid; v_total numeric;
begin
  select role::text into v_role from company_members where company_id=p_company_id and user_id=auth.uid();
  if v_role not in ('owner','admin','staff') then raise exception 'Sin permiso para crear cotizaciones'; end if;
  if coalesce(trim(p_description),'')='' or p_quantity<=0 or p_unit_price<0 then raise exception 'Datos de cotización inválidos'; end if;
  v_total=round(p_quantity*p_unit_price,2);
  insert into quotes(company_id,client_id,status,valid_until,notes,subtotal,discount,total) values(p_company_id,p_client_id,'DRAFT',p_valid_until,p_notes,v_total,0,v_total) returning id into v_quote;
  insert into quote_items(quote_id,description,quantity,unit,unit_price,discount,line_total,sort_order) values(v_quote,p_description,p_quantity,'unidad',p_unit_price,0,v_total,0);
  return v_quote;
end $$;
revoke all on function public.mobile_create_quick_quote(uuid,uuid,text,numeric,numeric,date,text) from public,anon;
grant execute on function public.mobile_create_quick_quote(uuid,uuid,text,numeric,numeric,date,text) to authenticated;

create or replace function public.mobile_create_quick_work_order(p_company_id uuid,p_client_id uuid,p_title text,p_description text,p_quantity numeric,p_unit_price numeric,p_due_at timestamptz default null,p_priority text default 'NORMAL')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_role text; v_order uuid; v_total numeric;
begin
  select role::text into v_role from company_members where company_id=p_company_id and user_id=auth.uid();
  if v_role not in ('owner','admin','staff') then raise exception 'Sin permiso para crear órdenes'; end if;
  if coalesce(trim(p_title),'')='' or coalesce(trim(p_description),'')='' or p_quantity<=0 or p_unit_price<0 then raise exception 'Datos de OT inválidos'; end if;
  if p_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'Prioridad inválida'; end if;
  v_total=round(p_quantity*p_unit_price,2);
  insert into work_orders(company_id,client_id,status,title,due_at,total,priority,specifications,design_status) values(p_company_id,p_client_id,'PENDING',p_title,p_due_at,v_total,p_priority,p_description,'PENDING') returning id into v_order;
  insert into work_order_items(work_order_id,description,quantity,unit,unit_price,line_total,specifications,sort_order) values(v_order,p_description,p_quantity,'unidad',p_unit_price,v_total,p_description,0);
  return v_order;
end $$;
revoke all on function public.mobile_create_quick_work_order(uuid,uuid,text,text,numeric,numeric,timestamptz,text) from public,anon;
grant execute on function public.mobile_create_quick_work_order(uuid,uuid,text,text,numeric,numeric,timestamptz,text) to authenticated;

create or replace function public.mobile_set_design_decision(p_work_order_id uuid,p_decision text,p_comments text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_company uuid; v_role text;
begin
 select company_id into v_company from work_orders where id=p_work_order_id;
 if v_company is null then raise exception 'OT no encontrada'; end if;
 select role::text into v_role from company_members where company_id=v_company and user_id=auth.uid();
 if v_role not in ('owner','admin','staff') then raise exception 'Sin permiso'; end if;
 if p_decision not in ('APPROVED','CHANGES_REQUESTED') then raise exception 'Decisión inválida'; end if;
 insert into design_approvals(company_id,work_order_id,status,comments,approved_by,approved_at) values(v_company,p_work_order_id,p_decision,p_comments,auth.uid(),now())
 on conflict(work_order_id) do update set status=excluded.status,comments=excluded.comments,approved_by=auth.uid(),approved_at=now(),updated_at=now();
 update work_orders set design_status=p_decision,client_approval_at=case when p_decision='APPROVED' then now() else null end,status=case when p_decision='APPROVED' and status in ('DESIGN','APPROVAL') then 'PRODUCTION' else status end,updated_at=now() where id=p_work_order_id;
end $$;
revoke all on function public.mobile_set_design_decision(uuid,text,text) from public,anon;
grant execute on function public.mobile_set_design_decision(uuid,text,text) to authenticated;
