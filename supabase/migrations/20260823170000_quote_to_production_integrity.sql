-- IDEALO SV · Integridad Cotización -> Orden -> Producción
-- Preserva información comercial y productiva aun cuando el frontend inserte una OT mínima.

alter table public.work_order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists unit_cost numeric(12,4) not null default 0,
  add column if not exists labor_unit_cost numeric(12,4) not null default 0,
  add column if not exists installation_unit_cost numeric(12,4) not null default 0,
  add column if not exists estimated_minutes integer,
  add column if not exists requires_production boolean not null default true,
  add column if not exists installation_included boolean not null default false,
  add column if not exists design_included boolean not null default false,
  add column if not exists source_quote_item_id uuid references public.quote_items(id) on delete set null;

create index if not exists work_order_items_source_quote_item_idx
  on public.work_order_items(source_quote_item_id)
  where source_quote_item_id is not null;

create or replace function public.idealo_enrich_work_order_from_quote()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  q public.quotes%rowtype;
begin
  if new.quote_id is null then
    return new;
  end if;

  select * into q from public.quotes where id = new.quote_id;
  if not found then
    return new;
  end if;

  new.priority := coalesce(nullif(new.priority, ''), q.priority, 'NORMAL');
  new.due_at := coalesce(new.due_at,
    case when q.promised_delivery_date is not null
      then (q.promised_delivery_date::text || ' 17:00:00')::timestamptz
      else null end);
  new.installation_required := coalesce(new.installation_required, false) or coalesce(q.installation_required, false);
  new.installation_address := coalesce(nullif(new.installation_address, ''), q.installation_address, q.delivery_address);
  new.estimated_cost := case when coalesce(new.estimated_cost, 0) > 0 then new.estimated_cost else coalesce(q.cost_total, 0) end;
  new.internal_notes := coalesce(nullif(new.internal_notes, ''), q.internal_notes);
  new.tags := case when coalesce(array_length(new.tags, 1), 0) > 0 then new.tags else coalesce(q.tags, '{}'::text[]) end;
  return new;
end;
$$;

revoke all on function public.idealo_enrich_work_order_from_quote() from public, anon;
grant execute on function public.idealo_enrich_work_order_from_quote() to authenticated;

drop trigger if exists trg_enrich_work_order_from_quote on public.work_orders;
create trigger trg_enrich_work_order_from_quote
before insert or update of quote_id on public.work_orders
for each row execute function public.idealo_enrich_work_order_from_quote();

create or replace function public.idealo_enrich_work_order_item_from_quote()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_item public.quote_items%rowtype;
  source_quote uuid;
begin
  select quote_id into source_quote from public.work_orders where id = new.work_order_id;
  if source_quote is null then
    return new;
  end if;

  select * into source_item
  from public.quote_items
  where quote_id = source_quote
    and sort_order = coalesce(new.sort_order, 0)
  order by id
  limit 1;

  if not found then
    return new;
  end if;

  new.source_quote_item_id := source_item.id;
  new.product_id := coalesce(new.product_id, source_item.product_id);
  new.variant_id := coalesce(new.variant_id, source_item.variant_id);
  new.sku := coalesce(nullif(new.sku, ''), source_item.sku);
  new.category := coalesce(nullif(new.category, ''), source_item.category);
  new.description := coalesce(nullif(new.description, ''), source_item.description);
  new.unit := coalesce(nullif(new.unit, ''), source_item.unit);
  new.specifications := coalesce(nullif(new.specifications, ''), source_item.specifications);
  new.unit_cost := case when coalesce(new.unit_cost, 0) > 0 then new.unit_cost else coalesce(source_item.unit_cost, 0) end;
  new.labor_unit_cost := case when coalesce(new.labor_unit_cost, 0) > 0 then new.labor_unit_cost else coalesce(source_item.labor_unit_cost, 0) end;
  new.installation_unit_cost := case when coalesce(new.installation_unit_cost, 0) > 0 then new.installation_unit_cost else coalesce(source_item.installation_unit_cost, 0) end;
  new.estimated_minutes := coalesce(new.estimated_minutes, source_item.estimated_minutes);
  new.requires_production := coalesce(source_item.requires_production, true);
  new.installation_included := coalesce(source_item.installation_included, false);
  new.design_included := coalesce(source_item.design_included, false);
  return new;
end;
$$;

revoke all on function public.idealo_enrich_work_order_item_from_quote() from public, anon;
grant execute on function public.idealo_enrich_work_order_item_from_quote() to authenticated;

drop trigger if exists trg_enrich_work_order_item_from_quote on public.work_order_items;
create trigger trg_enrich_work_order_item_from_quote
before insert on public.work_order_items
for each row execute function public.idealo_enrich_work_order_item_from_quote();

create or replace function public.idealo_create_production_task_from_order_item()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_company uuid;
  task_minutes integer;
begin
  if not coalesce(new.requires_production, true) then
    return new;
  end if;

  select company_id into target_company from public.work_orders where id = new.work_order_id;
  if target_company is null then
    return new;
  end if;

  task_minutes := greatest(0, coalesce(new.estimated_minutes, 0) * greatest(1, ceil(coalesce(new.quantity, 1))::integer));

  if not exists (
    select 1 from public.production_tasks
    where work_order_id = new.work_order_id
      and title = new.description
      and sequence_no = coalesce(new.sort_order, 0)
  ) then
    insert into public.production_tasks(company_id, work_order_id, title, process_type, sequence_no, estimated_minutes, instructions)
    values(target_company, new.work_order_id, coalesce(nullif(new.description, ''), 'Producción'), 'PRODUCTION', coalesce(new.sort_order, 0), task_minutes, new.specifications);
  end if;

  return new;
end;
$$;

revoke all on function public.idealo_create_production_task_from_order_item() from public, anon;
grant execute on function public.idealo_create_production_task_from_order_item() to authenticated;

drop trigger if exists trg_create_production_task_from_order_item on public.work_order_items;
create trigger trg_create_production_task_from_order_item
after insert on public.work_order_items
for each row execute function public.idealo_create_production_task_from_order_item();
