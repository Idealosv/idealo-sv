create table if not exists public.bar_promotions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.finished_products(id) on delete cascade,
  name text not null,
  promotion_type text not null check (promotion_type in ('DISCOUNT','COMBO','BALDE','HIELERAZO','HAPPY_HOUR')),
  pricing_mode text not null check (pricing_mode in ('FIXED_PRICE','PERCENT_OFF','AMOUNT_OFF')),
  price_value numeric(14,2) not null check (price_value >= 0),
  min_quantity numeric(12,3) not null default 1 check (min_quantity > 0),
  days_of_week integer[] not null default array[0,1,2,3,4,5,6],
  start_time time,
  end_time time,
  valid_from date,
  valid_until date,
  priority integer not null default 100,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (array_length(days_of_week,1) is null or days_of_week <@ array[0,1,2,3,4,5,6])
);

create table if not exists public.bar_bundle_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.finished_products(id) on delete cascade,
  offer_type text not null check (offer_type in ('BALDE','HIELERAZO')),
  primary_inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  units_per_offer numeric(12,3) not null check (units_per_offer > 0),
  ice_inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  ice_quantity numeric(12,3) not null default 0 check (ice_quantity >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,product_id)
);

alter table public.bar_order_items add column if not exists base_unit_price numeric(14,2);
alter table public.bar_order_items add column if not exists promotion_id uuid references public.bar_promotions(id) on delete set null;
alter table public.bar_order_items add column if not exists promotion_name text;
alter table public.bar_order_items add column if not exists promotion_discount numeric(14,2) not null default 0 check (promotion_discount >= 0);

create index if not exists bar_promotions_company_product_active_idx on public.bar_promotions(company_id,product_id,active,priority);
create index if not exists bar_promotions_created_by_idx on public.bar_promotions(created_by);
create index if not exists bar_bundle_company_offer_idx on public.bar_bundle_definitions(company_id,offer_type,active);
create index if not exists bar_bundle_primary_inventory_idx on public.bar_bundle_definitions(primary_inventory_item_id);
create index if not exists bar_bundle_ice_inventory_idx on public.bar_bundle_definitions(ice_inventory_item_id) where ice_inventory_item_id is not null;
create index if not exists bar_bundle_created_by_idx on public.bar_bundle_definitions(created_by);
create index if not exists bar_order_items_promotion_idx on public.bar_order_items(promotion_id) where promotion_id is not null;

alter table public.bar_promotions enable row level security;
alter table public.bar_bundle_definitions enable row level security;

drop policy if exists bar_promotions_read on public.bar_promotions;
create policy bar_promotions_read on public.bar_promotions for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_promotions_insert on public.bar_promotions;
create policy bar_promotions_insert on public.bar_promotions for insert to authenticated with check (public.erp_can_admin(company_id));
drop policy if exists bar_promotions_update on public.bar_promotions;
create policy bar_promotions_update on public.bar_promotions for update to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
drop policy if exists bar_promotions_delete on public.bar_promotions;
create policy bar_promotions_delete on public.bar_promotions for delete to authenticated using (public.erp_can_admin(company_id));

drop policy if exists bar_bundle_definitions_read on public.bar_bundle_definitions;
create policy bar_bundle_definitions_read on public.bar_bundle_definitions for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_bundle_definitions_insert on public.bar_bundle_definitions;
create policy bar_bundle_definitions_insert on public.bar_bundle_definitions for insert to authenticated with check (public.erp_can_admin(company_id));
drop policy if exists bar_bundle_definitions_update on public.bar_bundle_definitions;
create policy bar_bundle_definitions_update on public.bar_bundle_definitions for update to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
drop policy if exists bar_bundle_definitions_delete on public.bar_bundle_definitions;
create policy bar_bundle_definitions_delete on public.bar_bundle_definitions for delete to authenticated using (public.erp_can_admin(company_id));

revoke all on public.bar_promotions, public.bar_bundle_definitions from anon;
grant select,insert,update,delete on public.bar_promotions, public.bar_bundle_definitions to authenticated;
grant all on public.bar_promotions, public.bar_bundle_definitions to service_role;

create or replace function public.bar_apply_active_promotion()
returns trigger
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_promo public.bar_promotions%rowtype;
  v_now timestamp := now() at time zone 'America/El_Salvador';
  v_base numeric(14,2);
  v_price numeric(14,2);
begin
  if tg_op='UPDATE' and old.product_id = new.product_id and old.base_unit_price is not null then v_base := old.base_unit_price; else v_base := coalesce(new.base_unit_price,new.unit_price,0); end if;
  new.base_unit_price := round(greatest(v_base,0),2);
  new.promotion_id := null; new.promotion_name := null; new.promotion_discount := 0; new.unit_price := new.base_unit_price;
  select p.* into v_promo from public.bar_promotions p
  where p.company_id=new.company_id and p.product_id=new.product_id and p.active=true
    and p.min_quantity <= greatest(coalesce(new.quantity,1),1)
    and (p.valid_from is null or p.valid_from <= v_now::date)
    and (p.valid_until is null or p.valid_until >= v_now::date)
    and extract(dow from v_now)::integer = any(p.days_of_week)
    and (p.start_time is null or p.end_time is null
      or (p.start_time <= p.end_time and v_now::time between p.start_time and p.end_time)
      or (p.start_time > p.end_time and (v_now::time >= p.start_time or v_now::time <= p.end_time)))
  order by p.priority asc,p.created_at desc limit 1;
  if found then
    v_price := case v_promo.pricing_mode when 'FIXED_PRICE' then v_promo.price_value when 'PERCENT_OFF' then new.base_unit_price*(1-least(v_promo.price_value,100)/100) when 'AMOUNT_OFF' then new.base_unit_price-v_promo.price_value else new.base_unit_price end;
    new.unit_price := round(greatest(v_price,0),2); new.promotion_id := v_promo.id; new.promotion_name := v_promo.name; new.promotion_discount := round(greatest(new.base_unit_price-new.unit_price,0),2);
  end if;
  return new;
end;
$$;

drop trigger if exists bar_order_items_apply_active_promotion on public.bar_order_items;
create trigger bar_order_items_apply_active_promotion before insert or update of product_id,quantity,unit_price on public.bar_order_items for each row execute function public.bar_apply_active_promotion();

create or replace function public.bar_create_bundle(p_company_id uuid,p_name text,p_offer_type text,p_primary_inventory_item_id uuid,p_units numeric,p_sale_price numeric,p_ice_inventory_item_id uuid default null,p_ice_quantity numeric default 0)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare v_product uuid; v_type text := upper(trim(coalesce(p_offer_type,'')));
begin
  if not public.erp_can_admin(p_company_id) then raise exception 'Solo propietario o administrador puede configurar Baldes o Hielerazos.'; end if;
  if v_type not in ('BALDE','HIELERAZO') then raise exception 'Tipo de oferta inválido.'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'El nombre es obligatorio.'; end if;
  if coalesce(p_units,0)<=0 then raise exception 'La cantidad de cervezas debe ser mayor que cero.'; end if;
  if coalesce(p_sale_price,0)<0 then raise exception 'El precio no puede ser negativo.'; end if;
  if not exists(select 1 from public.inventory_items i where i.id=p_primary_inventory_item_id and i.company_id=p_company_id and i.active=true and i.deleted_at is null) then raise exception 'La cerveza o insumo principal no pertenece al inventario activo de esta empresa.'; end if;
  if p_ice_inventory_item_id is not null and not exists(select 1 from public.inventory_items i where i.id=p_ice_inventory_item_id and i.company_id=p_company_id and i.active=true and i.deleted_at is null) then raise exception 'El hielo no pertenece al inventario activo de esta empresa.'; end if;
  insert into public.finished_products(company_id,name,category,subcategory,unit,sale_price,active,requires_production,affects_inventory,status,tags)
  values(p_company_id,trim(p_name),'BAR',case when v_type='BALDE' then 'Balde' else 'Hielerazo' end,'unidad',round(p_sale_price,2),true,false,false,'ACTIVE',array['IDEALO BAR',case when v_type='BALDE' then 'Balde' else 'Hielerazo' end]) returning id into v_product;
  insert into public.bar_menu_items(company_id,product_id,display_name,category,station,sale_price_override,emoji,active,sort_order)
  values(p_company_id,v_product,trim(p_name),'Cervezas','bar',round(p_sale_price,2),case when v_type='BALDE' then '🪣' else '🧊' end,true,0)
  on conflict(company_id,product_id) do update set display_name=excluded.display_name,category='Cervezas',station='bar',sale_price_override=excluded.sale_price_override,emoji=excluded.emoji,active=true,updated_at=now();
  insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,notes)
  values(p_company_id,v_product,p_primary_inventory_item_id,p_units,0,case when v_type='BALDE' then 'Consumo automático del Balde' else 'Consumo automático del Hielerazo' end)
  on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=excluded.quantity_per_unit,waste_percent=0,notes=excluded.notes,active=true,updated_at=now();
  if p_ice_inventory_item_id is not null and coalesce(p_ice_quantity,0)>0 then
    insert into public.bar_recipe_components(company_id,product_id,inventory_item_id,quantity_per_unit,waste_percent,notes) values(p_company_id,v_product,p_ice_inventory_item_id,p_ice_quantity,0,'Hielo incluido en la oferta')
    on conflict(company_id,product_id,inventory_item_id) do update set quantity_per_unit=excluded.quantity_per_unit,waste_percent=0,notes=excluded.notes,active=true,updated_at=now();
  end if;
  insert into public.bar_bundle_definitions(company_id,product_id,offer_type,primary_inventory_item_id,units_per_offer,ice_inventory_item_id,ice_quantity) values(p_company_id,v_product,v_type,p_primary_inventory_item_id,p_units,p_ice_inventory_item_id,greatest(coalesce(p_ice_quantity,0),0));
  return v_product;
end;
$$;
revoke execute on function public.bar_create_bundle(uuid,text,text,uuid,numeric,numeric,uuid,numeric) from public,anon;
grant execute on function public.bar_create_bundle(uuid,text,text,uuid,numeric,numeric,uuid,numeric) to authenticated;
