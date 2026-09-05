-- Procurement, suppliers and payables integrity hardening

create unique index if not exists suppliers_company_nit_normalized_uidx
on public.suppliers(company_id, (regexp_replace(nit,'[^0-9]','','g')))
where nullif(regexp_replace(coalesce(nit,''),'[^0-9]','','g'),'') is not null;

create unique index if not exists suppliers_company_nrc_normalized_uidx
on public.suppliers(company_id, (regexp_replace(nrc,'[^0-9]','','g')))
where nullif(regexp_replace(coalesce(nrc,''),'[^0-9]','','g'),'') is not null;

create or replace function public.enforce_procurement_company_links()
returns trigger
language plpgsql
security definer
set search_path=public
set row_security=off
as $$
begin
  if tg_table_name='purchases' then
    if new.supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=new.supplier_id and s.company_id=new.company_id) then raise exception 'El proveedor no pertenece a esta empresa'; end if;
    if new.cash_account_id is not null and not exists(select 1 from public.cash_accounts c where c.id=new.cash_account_id and c.company_id=new.company_id and c.active=true) then raise exception 'La Caja o Banco no pertenece a esta empresa o está inactiva'; end if;
    if tg_op='INSERT' and new.payment_status='PARTIAL' then raise exception 'Una compra nueva no puede iniciar como pago parcial. Regístrala pendiente y luego aplica el abono.'; end if;
  elsif tg_table_name='purchase_items' then
    if not exists(select 1 from public.purchases p where p.id=new.purchase_id and p.company_id=new.company_id) then raise exception 'La compra no pertenece a esta empresa'; end if;
    if new.inventory_item_id is not null and not exists(select 1 from public.inventory_items i where i.id=new.inventory_item_id and i.company_id=new.company_id) then raise exception 'El artículo de inventario no pertenece a esta empresa'; end if;
    if new.work_order_id is not null and not exists(select 1 from public.work_orders w where w.id=new.work_order_id and w.company_id=new.company_id) then raise exception 'La orden de trabajo no pertenece a esta empresa'; end if;
  elsif tg_table_name='accounts_payable' then
    if new.purchase_id is not null and not exists(select 1 from public.purchases p where p.id=new.purchase_id and p.company_id=new.company_id) then raise exception 'La compra asociada no pertenece a esta empresa'; end if;
    if new.supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=new.supplier_id and s.company_id=new.company_id) then raise exception 'El proveedor de la cuenta por pagar no pertenece a esta empresa'; end if;
  elsif tg_table_name='supplier_payments' then
    if not exists(select 1 from public.accounts_payable a where a.id=new.payable_id and a.company_id=new.company_id) then raise exception 'La cuenta por pagar no pertenece a esta empresa'; end if;
    if not exists(select 1 from public.cash_accounts c where c.id=new.cash_account_id and c.company_id=new.company_id and c.active=true) then raise exception 'La Caja o Banco no pertenece a esta empresa o está inactiva'; end if;
    if new.supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=new.supplier_id and s.company_id=new.company_id) then raise exception 'El proveedor del pago no pertenece a esta empresa'; end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_procurement_company_links() from public, anon, authenticated;

drop trigger if exists trg_procurement_company_links on public.purchases;
create trigger trg_procurement_company_links before insert or update of company_id,supplier_id,cash_account_id,payment_status on public.purchases for each row execute function public.enforce_procurement_company_links();
drop trigger if exists trg_procurement_company_links on public.purchase_items;
create trigger trg_procurement_company_links before insert or update of company_id,purchase_id,inventory_item_id,work_order_id on public.purchase_items for each row execute function public.enforce_procurement_company_links();
drop trigger if exists trg_procurement_company_links on public.accounts_payable;
create trigger trg_procurement_company_links before insert or update of company_id,purchase_id,supplier_id on public.accounts_payable for each row execute function public.enforce_procurement_company_links();
drop trigger if exists trg_procurement_company_links on public.supplier_payments;
create trigger trg_procurement_company_links before insert or update of company_id,payable_id,supplier_id,cash_account_id on public.supplier_payments for each row execute function public.enforce_procurement_company_links();

drop policy if exists "members manage supplier payments" on public.supplier_payments;
drop policy if exists supplier_payments_read on public.supplier_payments;
drop policy if exists supplier_payments_write on public.supplier_payments;
create policy supplier_payments_read on public.supplier_payments for select to authenticated using (public.erp_can_read_finance(company_id));
create policy supplier_payments_write on public.supplier_payments for all to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

create or replace function public.sync_purchase_to_payable()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare v_status text:=coalesce(new.procurement_status,'REGISTERED'); v_eligible boolean;
begin
  v_eligible:=new.payment_status in ('PENDING','PARTIAL') and new.total>0 and v_status in ('REGISTERED','RECEIVED');
  if v_eligible then
    insert into public.accounts_payable(company_id,supplier_id,purchase_id,concept,amount_total,due_date,status)
    values(new.company_id,new.supplier_id,new.id,new.concept,new.total,new.due_date,case when new.due_date is not null and new.due_date<current_date then 'OVERDUE' else 'OPEN' end)
    on conflict (purchase_id) where purchase_id is not null do update set supplier_id=excluded.supplier_id,concept=excluded.concept,amount_total=excluded.amount_total,due_date=excluded.due_date,status=case when public.accounts_payable.amount_paid>=excluded.amount_total then 'PAID' when public.accounts_payable.amount_paid>0 then 'PARTIAL' when excluded.due_date is not null and excluded.due_date<current_date then 'OVERDUE' else 'OPEN' end,updated_at=now();
  elsif new.payment_status='PAID' then
    update public.accounts_payable set amount_paid=amount_total,status='PAID',updated_at=now() where purchase_id=new.id;
  elsif v_status in ('DRAFT','ORDERED','PARTIAL_RECEIVED','CANCELLED') then
    delete from public.accounts_payable where purchase_id=new.id and amount_paid=0;
  end if;
  return new;
end $$;
revoke all on function public.sync_purchase_to_payable() from public, anon, authenticated;

create or replace function public.post_paid_purchase_to_cash()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare v_account public.cash_accounts%rowtype; v_balance numeric; v_type text;
begin
  if new.payment_status <> 'PAID' or new.cash_account_id is null then return new; end if;
  if auth.uid() is not null and not public.erp_can_admin(new.company_id) then raise exception 'Solo propietario o administrador puede registrar una compra pagada desde Caja o Banco.'; end if;
  if new.total<=0 then raise exception 'El total pagado debe ser mayor a cero'; end if;
  select * into v_account from public.cash_accounts where id=new.cash_account_id and company_id=new.company_id and active=true for update;
  if not found then raise exception 'La cuenta de caja/banco seleccionada no es válida o no está activa.'; end if;
  select coalesce(current_balance,0) into v_balance from public.cash_account_balances where cash_account_id=v_account.id;
  if coalesce(v_balance,0)+0.001<new.total then raise exception 'Saldo insuficiente en %. Disponible: %',v_account.name,coalesce(v_balance,0); end if;
  v_type:=upper(coalesce(v_account.account_type,''));
  if v_type in ('CASH','CAJA') and not exists(select 1 from public.cash_register_sessions s where s.company_id=new.company_id and s.cash_account_id=v_account.id and s.status='OPEN') then raise exception 'Caja cerrada. Primero debes abrir la caja antes de registrar esta compra pagada.'; end if;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,new.cash_account_id,new.purchase_date::timestamp+time '12:00:00','EXPENSE','PURCHASE',new.id,new.concept,new.total,new.document_number,new.notes) on conflict do nothing;
  return new;
end $$;
revoke all on function public.post_paid_purchase_to_cash() from public, anon, authenticated;

create or replace function public.confirm_purchase_order(p_purchase uuid)
returns void language plpgsql set search_path=public as $$
declare p public.purchases%rowtype; n integer;
begin
  select * into p from public.purchases where id=p_purchase for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if not public.erp_can_operate(p.company_id) then raise exception 'Sin permiso para ordenar compras'; end if;
  if p.procurement_status='CANCELLED' then raise exception 'La compra está cancelada'; end if;
  if p.procurement_status='RECEIVED' then return; end if;
  select count(*) into n from public.purchase_items where purchase_id=p.id and company_id=p.company_id;
  if n=0 then raise exception 'La compra no tiene partidas para ordenar'; end if;
  update public.purchases set procurement_status='ORDERED',prepared_at=coalesce(prepared_at,now()),updated_at=now() where id=p.id;
end $$;
revoke all on function public.confirm_purchase_order(uuid) from public, anon;
grant execute on function public.confirm_purchase_order(uuid) to authenticated;

create or replace function public.receive_purchase_item(p_purchase_item uuid,p_quantity numeric,p_unit_cost numeric default null,p_receipt_key uuid default gen_random_uuid(),p_notes text default null)
returns uuid language plpgsql set search_path=public as $$
declare li public.purchase_items%rowtype; p public.purchases%rowtype; inv public.inventory_items%rowtype; r_id uuid; m_id uuid; v_remaining numeric(18,3); v_cost numeric(18,4); v_total_items integer; v_complete_items integer;
begin
  if coalesce(p_quantity,0)<=0 then raise exception 'La cantidad recibida debe ser mayor a cero'; end if;
  if p_receipt_key is null then raise exception 'Falta clave idempotente de recepción'; end if;
  select * into li from public.purchase_items where id=p_purchase_item for update;
  if not found then raise exception 'Partida de compra no encontrada'; end if;
  select * into p from public.purchases where id=li.purchase_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  if li.company_id<>p.company_id then raise exception 'La partida no pertenece a la empresa de la compra'; end if;
  if not public.erp_can_operate(p.company_id) then raise exception 'Sin permiso para recibir compras'; end if;
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
  insert into public.purchase_receipts(company_id,purchase_id,receipt_key,notes,created_by) values(p.company_id,p.id,p_receipt_key,p_notes,auth.uid()) returning id into r_id;
  insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,purchase_id,warehouse_id,location_id,document_type,document_id,reference,notes,created_by)
  values(p.company_id,li.inventory_item_id,'PURCHASE_IN',p_quantity,v_cost,p.id,inv.warehouse_id,inv.location_id,'PURCHASE_RECEIPT',r_id,'COM-'||coalesce(p.number::text,p.id::text),coalesce(p_notes,'Recepción de compra · '||li.description),auth.uid()) returning id into m_id;
  insert into public.purchase_receipt_lines(company_id,purchase_receipt_id,purchase_item_id,inventory_item_id,quantity,unit_cost,inventory_movement_id) values(p.company_id,r_id,li.id,li.inventory_item_id,p_quantity,v_cost,m_id);
  update public.purchase_items set received_quantity=received_quantity+p_quantity,last_received_at=now(),unit_cost=case when p_unit_cost is not null then v_cost else unit_cost end where id=li.id;
  select count(*),count(*) filter(where received_quantity>=quantity) into v_total_items,v_complete_items from public.purchase_items where purchase_id=p.id and company_id=p.company_id;
  update public.purchases set procurement_status=case when v_total_items>0 and v_complete_items=v_total_items then 'RECEIVED' else 'PARTIAL_RECEIVED' end,received_at=case when v_total_items>0 and v_complete_items=v_total_items then coalesce(received_at,now()) else received_at end,updated_at=now() where id=p.id;
  return r_id;
end $$;
revoke all on function public.receive_purchase_item(uuid,numeric,numeric,uuid,text) from public, anon;
grant execute on function public.receive_purchase_item(uuid,numeric,numeric,uuid,text) to authenticated;

create or replace function public.register_supplier_payment(p_payable uuid,p_cash_account uuid,p_amount numeric,p_payment_method text default 'CASH',p_reference text default null,p_notes text default null,p_payment_key uuid default gen_random_uuid())
returns uuid language plpgsql set search_path=public as $$
declare ap public.accounts_payable%rowtype; ca public.cash_accounts%rowtype; v_balance numeric(12,2); v_account_balance numeric(12,2); v_existing uuid; v_payment uuid; v_type text;
begin
  if p_payment_key is null then raise exception 'Falta clave idempotente del pago'; end if;
  select * into ap from public.accounts_payable where id=p_payable for update;
  if not found then raise exception 'Cuenta por pagar no encontrada'; end if;
  if not public.erp_can_admin(ap.company_id) then raise exception 'Solo propietario o administrador puede registrar pagos a proveedores'; end if;
  select id into v_existing from public.supplier_payments where company_id=ap.company_id and payment_key=p_payment_key;
  if v_existing is not null then return v_existing; end if;
  if ap.status in ('PAID','CANCELLED') then raise exception 'La cuenta por pagar no admite nuevos pagos'; end if;
  select * into ca from public.cash_accounts where id=p_cash_account and company_id=ap.company_id and active=true for update;
  if not found then raise exception 'Caja o banco no disponible'; end if;
  v_balance:=greatest(ap.amount_total-ap.amount_paid,0);
  if coalesce(p_amount,0)<=0 or p_amount>v_balance+0.001 then raise exception 'Monto inválido. Saldo pendiente: %',v_balance; end if;
  select coalesce(current_balance,0) into v_account_balance from public.cash_account_balances where cash_account_id=ca.id;
  if coalesce(v_account_balance,0)+0.001<p_amount then raise exception 'Saldo insuficiente en %. Disponible: %',ca.name,coalesce(v_account_balance,0); end if;
  v_type:=upper(coalesce(ca.account_type,''));
  if v_type in ('CASH','CAJA') and not exists(select 1 from public.cash_register_sessions s where s.company_id=ap.company_id and s.cash_account_id=ca.id and s.status='OPEN') then raise exception 'Caja cerrada. Primero debes abrir la caja antes de registrar este pago en efectivo.'; end if;
  insert into public.supplier_payments(company_id,payable_id,supplier_id,cash_account_id,amount,payment_method,reference,notes,payment_key)
  values(ap.company_id,ap.id,ap.supplier_id,ca.id,p_amount,case when p_payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER') then p_payment_method else 'OTHER' end,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_payment_key) returning id into v_payment;
  return v_payment;
end $$;
revoke all on function public.register_supplier_payment(uuid,uuid,numeric,text,text,text,uuid) from public, anon;
grant execute on function public.register_supplier_payment(uuid,uuid,numeric,text,text,text,uuid) to authenticated;

create or replace function public.void_purchase(p_purchase_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare v_purchase public.purchases%rowtype;v_move public.cash_movements%rowtype;v_reversal_id uuid;v_paid numeric:=0;
begin
 if nullif(btrim(p_reason),'') is null then raise exception 'Debes indicar el motivo de la anulación.'; end if;
 select * into v_purchase from public.purchases where id=p_purchase_id for update;
 if v_purchase.id is null then raise exception 'La compra no existe.'; end if;
 if not public.erp_can_admin(v_purchase.company_id) then raise exception 'Solo propietario o administrador puede anular esta compra.'; end if;
 if v_purchase.voided_at is not null then return jsonb_build_object('ok',true,'already_voided',true,'reversal_id',v_purchase.void_reversal_id); end if;
 if exists(select 1 from public.purchase_receipt_lines l where l.company_id=v_purchase.company_id and exists(select 1 from public.purchase_receipts r where r.id=l.purchase_receipt_id and r.purchase_id=v_purchase.id)) then raise exception 'La compra ya tiene materiales recibidos en Inventario. Revierte primero la recepción antes de anularla.'; end if;
 select coalesce(amount_paid,0) into v_paid from public.accounts_payable where purchase_id=v_purchase.id limit 1;
 if coalesce(v_paid,0)>0 then raise exception 'La compra tiene pagos a proveedor aplicados. Revierte primero esos pagos antes de anular la compra.'; end if;
 select * into v_move from public.cash_movements where company_id=v_purchase.company_id and source_type='PURCHASE' and source_id=v_purchase.id order by movement_date desc limit 1;
 if v_move.id is not null then
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(v_purchase.company_id,v_move.cash_account_id,now(),'INCOME','PURCHASE_REVERSAL',v_purchase.id,'Anulación compra: '||v_purchase.concept,v_move.amount,v_purchase.document_number,'Motivo: '||btrim(p_reason))
  on conflict (source_type,source_id) where source_id is not null do update set notes=excluded.notes returning id into v_reversal_id;
 end if;
 update public.purchases set payment_status='CANCELLED',procurement_status='CANCELLED',void_reason=btrim(p_reason),voided_at=now(),voided_by=auth.uid(),void_reversal_id=v_reversal_id,updated_at=now() where id=v_purchase.id;
 update public.accounts_payable set status='CANCELLED',updated_at=now() where purchase_id=v_purchase.id;
 return jsonb_build_object('ok',true,'reversed_amount',coalesce(v_move.amount,0),'reversal_id',v_reversal_id);
end $$;
revoke all on function public.void_purchase(uuid,text) from public, anon;
grant execute on function public.void_purchase(uuid,text) to authenticated;
