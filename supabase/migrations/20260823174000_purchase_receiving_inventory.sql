-- IDEALO SV · Compra -> Recepción -> Inventario
-- Extiende la recepción existente con parcialidad, idempotencia y un único trigger de stock.

drop trigger if exists trg_apply_inventory_movement on public.inventory_movements;

alter table public.purchase_items
  add column if not exists last_received_at timestamptz;

alter table public.purchase_items drop constraint if exists purchase_items_received_quantity_check;
alter table public.purchase_items
  add constraint purchase_items_received_quantity_check
  check (received_quantity >= 0 and received_quantity <= quantity) not valid;
alter table public.purchase_items validate constraint purchase_items_received_quantity_check;

create table if not exists public.purchase_receipts(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  receipt_key uuid not null,
  received_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id,receipt_key)
);

create table if not exists public.purchase_receipt_lines(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  purchase_item_id uuid not null references public.purchase_items(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(18,3) not null check(quantity>0),
  unit_cost numeric(18,4) not null default 0 check(unit_cost>=0),
  inventory_movement_id uuid references public.inventory_movements(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(purchase_receipt_id,purchase_item_id)
);

create index if not exists idx_purchase_receipts_purchase on public.purchase_receipts(purchase_id,received_at desc);
create index if not exists idx_purchase_receipt_lines_item on public.purchase_receipt_lines(purchase_item_id,created_at desc);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;

drop policy if exists company_members_manage_purchase_receipts on public.purchase_receipts;
create policy company_members_manage_purchase_receipts on public.purchase_receipts for all to authenticated
using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

drop policy if exists company_members_manage_purchase_receipt_lines on public.purchase_receipt_lines;
create policy company_members_manage_purchase_receipt_lines on public.purchase_receipt_lines for all to authenticated
using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

grant select,insert,update,delete on public.purchase_receipts,public.purchase_receipt_lines to authenticated;

create or replace function public.confirm_purchase_order(p_purchase uuid)
returns void
language plpgsql
security invoker
set search_path='public'
as $$
declare p public.purchases%rowtype; n integer;
begin
  select * into p from public.purchases where id=p_purchase for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if not public.is_company_member(p.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if p.procurement_status='CANCELLED' then raise exception 'La compra está cancelada'; end if;
  if p.procurement_status='RECEIVED' then return; end if;
  select count(*) into n from public.purchase_items where purchase_id=p.id;
  if n=0 then raise exception 'La compra no tiene partidas para ordenar'; end if;
  update public.purchases set procurement_status='ORDERED',updated_at=now() where id=p.id;
end;
$$;

revoke all on function public.confirm_purchase_order(uuid) from public,anon;
grant execute on function public.confirm_purchase_order(uuid) to authenticated;

create or replace function public.receive_purchase_item(
  p_purchase_item uuid,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_receipt_key uuid default gen_random_uuid(),
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path='public'
as $$
declare
  li public.purchase_items%rowtype;
  p public.purchases%rowtype;
  inv public.inventory_items%rowtype;
  r_id uuid;
  m_id uuid;
  v_remaining numeric(18,3);
  v_cost numeric(18,4);
  v_total_items integer;
  v_complete_items integer;
begin
  if coalesce(p_quantity,0)<=0 then raise exception 'La cantidad recibida debe ser mayor a cero'; end if;
  select * into li from public.purchase_items where id=p_purchase_item for update;
  if not found then raise exception 'Partida de compra no encontrada'; end if;
  select * into p from public.purchases where id=li.purchase_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if not public.is_company_member(p.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if p.procurement_status not in ('ORDERED','PARTIAL_RECEIVED') then raise exception 'La compra debe estar ordenada antes de recibir materiales'; end if;
  if li.inventory_item_id is null then raise exception 'La partida no está vinculada a un artículo de Inventario'; end if;

  select id into r_id from public.purchase_receipts where company_id=p.company_id and receipt_key=p_receipt_key;
  if r_id is not null then return r_id; end if;

  v_remaining:=greatest(li.quantity-li.received_quantity,0);
  if p_quantity>v_remaining then raise exception 'Recepción excede pendiente: pendiente %, recibido %',v_remaining,p_quantity; end if;

  select * into inv from public.inventory_items where id=li.inventory_item_id and company_id=p.company_id and active=true and deleted_at is null for update;
  if not found then raise exception 'Artículo de Inventario no disponible'; end if;

  v_cost:=coalesce(p_unit_cost,li.unit_cost,inv.last_cost,inv.average_cost,0);
  if v_cost<0 then raise exception 'Costo unitario inválido'; end if;

  insert into public.purchase_receipts(company_id,purchase_id,receipt_key,notes,created_by)
  values(p.company_id,p.id,p_receipt_key,p_notes,auth.uid()) returning id into r_id;

  insert into public.inventory_movements(
    company_id,inventory_item_id,movement_type,quantity,unit_cost,purchase_id,
    warehouse_id,location_id,document_type,document_id,reference,notes,created_by
  ) values(
    p.company_id,li.inventory_item_id,'PURCHASE_IN',p_quantity,v_cost,p.id,
    inv.warehouse_id,inv.location_id,'PURCHASE_RECEIPT',r_id,
    'COM-'||coalesce(p.number::text,p.id::text),coalesce(p_notes,'Recepción de compra · '||li.description),auth.uid()
  ) returning id into m_id;

  insert into public.purchase_receipt_lines(
    company_id,purchase_receipt_id,purchase_item_id,inventory_item_id,quantity,unit_cost,inventory_movement_id
  ) values(p.company_id,r_id,li.id,li.inventory_item_id,p_quantity,v_cost,m_id);

  update public.purchase_items
  set received_quantity=received_quantity+p_quantity,last_received_at=now(),
      unit_cost=case when p_unit_cost is not null then v_cost else unit_cost end
  where id=li.id;

  select count(*),count(*) filter(where received_quantity>=quantity)
  into v_total_items,v_complete_items from public.purchase_items where purchase_id=p.id;

  update public.purchases
  set procurement_status=case when v_total_items>0 and v_complete_items=v_total_items then 'RECEIVED' else 'PARTIAL_RECEIVED' end,
      received_at=case when v_total_items>0 and v_complete_items=v_total_items then now() else received_at end,
      updated_at=now()
  where id=p.id;
  return r_id;
end;
$$;

revoke all on function public.receive_purchase_item(uuid,numeric,numeric,uuid,text) from public,anon;
grant execute on function public.receive_purchase_item(uuid,numeric,numeric,uuid,text) to authenticated;
