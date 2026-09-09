alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (source_type = any (array['MANUAL'::text,'CUSTOMER_PAYMENT'::text,'CUSTOMER_PAYMENT_REVERSAL'::text,'CUSTOMER_ADVANCE'::text,'PURCHASE'::text,'PURCHASE_REVERSAL'::text,'EXPENSE'::text,'EXPENSE_REVERSAL'::text,'CASH_TRANSFER'::text,'CASH_ADJUSTMENT'::text,'INTERNAL_INCOME'::text,'OTHER'::text,'BAR_SALE'::text,'DTE_PAYMENT'::text,'SUPPLIER_PAYMENT'::text,'PAYROLL'::text]));

alter table public.bar_payments add column if not exists cash_movement_id uuid references public.cash_movements(id) on delete set null;
alter table public.bar_payments add column if not exists financial_posting_status text not null default 'pending';
alter table public.bar_payments add column if not exists financial_note text;
alter table public.bar_payments drop constraint if exists bar_payments_financial_posting_status_check;
alter table public.bar_payments add constraint bar_payments_financial_posting_status_check check (financial_posting_status in ('pending','posted','pending_account'));
create index if not exists bar_payments_cash_movement_idx on public.bar_payments(cash_movement_id) where cash_movement_id is not null;
create index if not exists bar_payments_posting_status_idx on public.bar_payments(company_id,financial_posting_status,created_at desc);

create or replace function public.bar_checkout_order(p_order_id uuid,p_method text,p_reference text default null)
returns public.bar_payments language plpgsql security definer set search_path='public' as $$
declare v_order public.bar_orders%rowtype; v_session public.cash_register_sessions%rowtype; v_payment public.bar_payments%rowtype; v_paid numeric:=0; v_due numeric:=0; v_method text; v_account_id uuid; v_account_count integer:=0; v_movement_id uuid; v_account_type text;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select * into v_order from public.bar_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'No tienes permiso para cobrar este pedido.'; end if;
  if v_order.status in ('paid','cancelled') then raise exception 'El pedido ya está cerrado.'; end if;
  v_method:=lower(trim(coalesce(p_method,'')));
  if v_method not in ('cash','card','transfer','other') then raise exception 'Método de pago no válido.'; end if;
  select * into v_session from public.cash_register_sessions where company_id=v_order.company_id and upper(status)='OPEN' order by opened_at desc limit 1 for update;
  if not found then raise exception 'Caja cerrada. Abre una caja en IDEALO SV antes de cobrar.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.bar_payments where order_id=v_order.id;
  v_due:=round(greatest(coalesce(v_order.total,0)-v_paid,0),2);
  if v_due<=0 then raise exception 'El pedido no tiene saldo pendiente.'; end if;
  if v_method='cash' then v_account_id:=v_session.cash_account_id;
  elsif v_method in ('card','transfer') then select count(*),min(id) into v_account_count,v_account_id from public.cash_accounts where company_id=v_order.company_id and upper(account_type)='BANK' and active=true; if v_account_count<>1 then v_account_id:=null; end if; end if;
  insert into public.bar_payments(company_id,order_id,cash_register_session_id,method,amount,reference,received_by,financial_posting_status,financial_note)
  values(v_order.company_id,v_order.id,v_session.id,v_method,v_due,nullif(trim(coalesce(p_reference,'')),''),auth.uid(),case when v_account_id is null then 'pending_account' else 'pending' end,case when v_account_id is null then 'Cobro registrado en IDEALO BAR; falta seleccionar la cuenta de Caja/Banco para contabilizarlo.' else null end) returning * into v_payment;
  if v_account_id is not null then
    select upper(coalesce(account_type,'')) into v_account_type from public.cash_accounts where id=v_account_id;
    insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
    values(v_order.company_id,v_account_id,now(),'INCOME','BAR_SALE',v_payment.id,'IDEALO BAR · '||v_order.order_code,v_due,nullif(trim(coalesce(p_reference,'')),''),'Cobro '||upper(v_method)||' registrado desde IDEALO BAR.',case when v_account_type in ('CASH','CAJA') then v_session.id else null end) returning id into v_movement_id;
    update public.bar_payments set cash_movement_id=v_movement_id,financial_posting_status='posted',financial_note='Ingreso contabilizado en Caja/Banco de IDEALO SV.' where id=v_payment.id returning * into v_payment;
  end if;
  update public.bar_orders set status='paid',closed_at=now(),closed_by=auth.uid() where id=v_order.id;
  if v_order.table_id is not null then update public.bar_tables set status='available' where id=v_order.table_id and company_id=v_order.company_id; end if;
  return v_payment;
end;
$$;
revoke execute on function public.bar_checkout_order(uuid,text,text) from public,anon;
grant execute on function public.bar_checkout_order(uuid,text,text) to authenticated;

create or replace function public.bar_post_pending_payment(p_payment_id uuid,p_cash_account_id uuid)
returns uuid language plpgsql security definer set search_path='public' as $$
declare v_payment public.bar_payments%rowtype; v_order public.bar_orders%rowtype; v_account public.cash_accounts%rowtype; v_movement uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;
  select * into v_payment from public.bar_payments where id=p_payment_id for update;
  if not found then raise exception 'Cobro no encontrado.'; end if;
  if not public.erp_can_admin(v_payment.company_id) then raise exception 'Solo propietario o administrador puede resolver cobros pendientes de cuenta.'; end if;
  if v_payment.cash_movement_id is not null or v_payment.financial_posting_status='posted' then return v_payment.cash_movement_id; end if;
  select * into v_account from public.cash_accounts where id=p_cash_account_id and company_id=v_payment.company_id and active=true;
  if not found then raise exception 'La cuenta no pertenece a esta empresa o está inactiva.'; end if;
  select * into v_order from public.bar_orders where id=v_payment.order_id;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(v_payment.company_id,v_account.id,now(),'INCOME','BAR_SALE',v_payment.id,'IDEALO BAR · '||coalesce(v_order.order_code,v_payment.order_id::text),v_payment.amount,v_payment.reference,'Cobro conciliado manualmente desde IDEALO BAR.') returning id into v_movement;
  update public.bar_payments set cash_movement_id=v_movement,financial_posting_status='posted',financial_note='Ingreso conciliado en Caja/Banco de IDEALO SV.' where id=v_payment.id;
  return v_movement;
end;
$$;
revoke execute on function public.bar_post_pending_payment(uuid,uuid) from public,anon;
grant execute on function public.bar_post_pending_payment(uuid,uuid) to authenticated;

create table if not exists public.bar_dte_requests (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.bar_orders(id) on delete restrict, client_id uuid references public.clients(id) on delete set null,
  dte_type text not null default '01' check (dte_type in ('01','03')), environment text not null default 'test' check (environment in ('test','production')),
  status text not null default 'PENDING' check (status in ('PENDING','DRAFT_LINKED','PROCESSED','REJECTED','CANCELLED')),
  dte_document_id uuid unique references public.dte_documents(id) on delete set null, requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  requested_at timestamptz not null default now(), updated_at timestamptz not null default now(), notes text, unique(company_id,order_id)
);
alter table public.dte_documents add column if not exists bar_order_id uuid references public.bar_orders(id) on delete set null;
alter table public.dte_documents add column if not exists bar_cash_prepaid boolean not null default false;
create index if not exists bar_dte_requests_company_status_idx on public.bar_dte_requests(company_id,status,requested_at desc);
create index if not exists bar_dte_requests_order_idx on public.bar_dte_requests(order_id);
create index if not exists bar_dte_requests_client_idx on public.bar_dte_requests(client_id) where client_id is not null;
create index if not exists bar_dte_requests_requested_by_idx on public.bar_dte_requests(requested_by) where requested_by is not null;
create index if not exists dte_documents_bar_order_idx on public.dte_documents(bar_order_id) where bar_order_id is not null;
alter table public.bar_dte_requests enable row level security;
drop policy if exists bar_dte_requests_read on public.bar_dte_requests;
create policy bar_dte_requests_read on public.bar_dte_requests for select to authenticated using (public.erp_can_read(company_id));
drop policy if exists bar_dte_requests_insert on public.bar_dte_requests;
create policy bar_dte_requests_insert on public.bar_dte_requests for insert to authenticated with check (public.erp_can_operate(company_id));
drop policy if exists bar_dte_requests_update on public.bar_dte_requests;
create policy bar_dte_requests_update on public.bar_dte_requests for update to authenticated using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));
revoke all on public.bar_dte_requests from anon;
grant select,insert,update on public.bar_dte_requests to authenticated;
grant all on public.bar_dte_requests to service_role;

create or replace function public.bar_request_dte(p_order_id uuid,p_client_id uuid default null,p_dte_type text default '01',p_environment text default 'test')
returns uuid language plpgsql security invoker set search_path='public' as $$
declare v_order public.bar_orders%rowtype; v_id uuid; v_type text:=trim(coalesce(p_dte_type,'01')); v_env text:=lower(trim(coalesce(p_environment,'test')));
begin
  select * into v_order from public.bar_orders where id=p_order_id;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if not public.erp_can_operate(v_order.company_id) then raise exception 'Sin permiso para solicitar DTE.'; end if;
  if v_order.status<>'paid' then raise exception 'El pedido debe estar pagado antes de preparar el DTE.'; end if;
  if v_type not in ('01','03') then raise exception 'Tipo de DTE inválido.'; end if;
  if v_env not in ('test','production') then raise exception 'Ambiente DTE inválido.'; end if;
  if v_type='03' and p_client_id is null then raise exception 'El CCF requiere seleccionar un cliente fiscal.'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients c where c.id=p_client_id and c.company_id=v_order.company_id and c.status='active') then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  insert into public.bar_dte_requests(company_id,order_id,client_id,dte_type,environment,status,requested_by,updated_at)
  values(v_order.company_id,v_order.id,p_client_id,v_type,v_env,'PENDING',auth.uid(),now())
  on conflict(company_id,order_id) do update set client_id=excluded.client_id,dte_type=excluded.dte_type,environment=excluded.environment,status=case when public.bar_dte_requests.dte_document_id is null then 'PENDING' else public.bar_dte_requests.status end,requested_by=auth.uid(),updated_at=now() returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.bar_request_dte(uuid,uuid,text,text) from public,anon;
grant execute on function public.bar_request_dte(uuid,uuid,text,text) to authenticated;

create or replace function public.bar_link_dte_request(p_request_id uuid,p_dte_document_id uuid)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare v_req public.bar_dte_requests%rowtype; v_dte public.dte_documents%rowtype;
begin
  select * into v_req from public.bar_dte_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud DTE no encontrada.'; end if;
  if not public.erp_can_admin(v_req.company_id) then raise exception 'Solo propietario o administrador puede vincular el DTE fiscal.'; end if;
  select * into v_dte from public.dte_documents where id=p_dte_document_id for update;
  if not found or v_dte.company_id<>v_req.company_id then raise exception 'El DTE no pertenece a la empresa de la solicitud.'; end if;
  if v_dte.status in ('PROCESSED','INVALIDATED') then raise exception 'El DTE ya no puede vincularse a este pedido.'; end if;
  if v_dte.dte_type<>v_req.dte_type or v_dte.environment<>v_req.environment then raise exception 'El tipo o ambiente del DTE no coincide con la solicitud.'; end if;
  if v_req.client_id is not null and v_dte.client_id is distinct from v_req.client_id then raise exception 'El cliente del DTE no coincide con la solicitud del bar.'; end if;
  update public.dte_documents set bar_order_id=v_req.order_id,bar_cash_prepaid=true where id=v_dte.id;
  update public.bar_dte_requests set dte_document_id=v_dte.id,status='DRAFT_LINKED',updated_at=now() where id=v_req.id;
  return v_dte.id;
end;
$$;
revoke execute on function public.bar_link_dte_request(uuid,uuid) from public,anon;
grant execute on function public.bar_link_dte_request(uuid,uuid) to authenticated;

drop trigger if exists trg_post_processed_dte_financials on public.dte_documents;
create trigger trg_post_processed_dte_financials after update of status on public.dte_documents for each row when (not coalesce(new.bar_cash_prepaid,false)) execute function public.post_processed_dte_financials();

create or replace function public.bar_sync_dte_request_status()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_payment record;
begin
  if new.bar_order_id is null then return new; end if;
  if new.status='PROCESSED' then
    update public.bar_dte_requests set status='PROCESSED',updated_at=now() where company_id=new.company_id and order_id=new.bar_order_id and dte_document_id=new.id;
    for v_payment in select bp.id,bp.cash_movement_id from public.bar_payments bp where bp.order_id=new.bar_order_id and bp.company_id=new.company_id and bp.cash_movement_id is not null loop
      update public.cash_movements set source_type='CUSTOMER_PAYMENT',source_id=new.id,concept='Cobro DTE '||new.control_number||' · IDEALO BAR',notes=coalesce(notes,'')||' DTE aceptado por Hacienda y vinculado al pedido de IDEALO BAR.' where id=v_payment.cash_movement_id and source_type='BAR_SALE'; exit;
    end loop;
    update public.dte_documents set financial_state='PERCEIVED',financial_posted_at=now(),financial_note='Cobro registrado previamente por IDEALO BAR y conciliado con este DTE; no se generó un segundo ingreso.' where id=new.id;
  elsif new.status='REJECTED' then update public.bar_dte_requests set status='REJECTED',updated_at=now() where company_id=new.company_id and order_id=new.bar_order_id and dte_document_id=new.id; end if;
  return new;
end;
$$;
revoke execute on function public.bar_sync_dte_request_status() from public,anon,authenticated;
drop trigger if exists trg_bar_sync_dte_request_status on public.dte_documents;
create trigger trg_bar_sync_dte_request_status after update of status on public.dte_documents for each row when (new.bar_order_id is not null) execute function public.bar_sync_dte_request_status();

create or replace function public.bar_owner_dashboard(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb language plpgsql security invoker set search_path='public' as $$
declare v_result jsonb; v_from timestamptz; v_to timestamptz;
begin
  if not public.erp_can_read_finance(p_company_id) then raise exception 'Tu rol no tiene acceso al tablero financiero del bar.'; end if;
  if p_to<p_from then raise exception 'Rango de fechas inválido.'; end if;
  v_from:=(p_from::timestamp at time zone 'America/El_Salvador'); v_to:=((p_to+1)::timestamp at time zone 'America/El_Salvador');
  select jsonb_build_object(
    'sales',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.created_at>=v_from and bp.created_at<v_to),0),
    'orders',coalesce((select count(*) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
    'average_ticket',coalesce((select avg(o.total) from public.bar_orders o where o.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
    'cash',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.method='cash' and bp.created_at>=v_from and bp.created_at<v_to),0),
    'card',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.method='card' and bp.created_at>=v_from and bp.created_at<v_to),0),
    'transfer',coalesce((select sum(bp.amount) from public.bar_payments bp where bp.company_id=p_company_id and bp.method='transfer' and bp.created_at>=v_from and bp.created_at<v_to),0),
    'promotion_discount',coalesce((select sum(i.promotion_discount*i.quantity) from public.bar_order_items i join public.bar_orders o on o.id=i.order_id where i.company_id=p_company_id and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to),0),
    'courtesy_cost',coalesce((select sum(e.estimated_cost) from public.bar_inventory_events e where e.company_id=p_company_id and e.event_type='COURTESY' and e.created_at>=v_from and e.created_at<v_to),0),
    'waste_cost',coalesce((select sum(e.estimated_cost) from public.bar_inventory_events e where e.company_id=p_company_id and e.event_type in ('WASTE','DAMAGE') and e.created_at>=v_from and e.created_at<v_to),0),
    'internal_cost',coalesce((select sum(e.estimated_cost) from public.bar_inventory_events e where e.company_id=p_company_id and e.event_type='INTERNAL' and e.created_at>=v_from and e.created_at<v_to),0),
    'pending_cash_postings',coalesce((select count(*) from public.bar_payments bp where bp.company_id=p_company_id and bp.financial_posting_status<>'posted' and bp.created_at>=v_from and bp.created_at<v_to),0),
    'top_product',coalesce((select jsonb_build_object('name',x.item_name,'quantity',x.qty,'sales',x.amount) from (select i.item_name,sum(i.quantity) qty,sum(i.line_total) amount from public.bar_order_items i join public.bar_orders o on o.id=i.order_id where i.company_id=p_company_id and i.status<>'cancelled' and o.status='paid' and o.closed_at>=v_from and o.closed_at<v_to group by i.item_name order by sum(i.quantity) desc,sum(i.line_total) desc limit 1) x),'{}'::jsonb)
  ) into v_result; return v_result;
end;
$$;
revoke execute on function public.bar_owner_dashboard(uuid,date,date) from public,anon;
grant execute on function public.bar_owner_dashboard(uuid,date,date) to authenticated;

create or replace function public.bar_stock_alerts(p_company_id uuid)
returns table(inventory_item_id uuid,sku text,name text,unit text,current_stock numeric,available_stock numeric,reorder_point numeric,target_stock numeric,suggested_qty numeric,severity text)
language plpgsql security invoker set search_path='public' as $$
begin
  if not public.erp_can_read(p_company_id) then raise exception 'Sin acceso al inventario del bar.'; end if;
  return query select i.id,i.sku,i.name,i.unit,i.current_stock,greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0),greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0)),coalesce(i.target_stock,0),greatest(coalesce(i.target_stock,0)-greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0),0),case when greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=0 then 'CRITICAL' else 'LOW' end
  from public.inventory_items i where i.company_id=p_company_id and i.active=true and i.deleted_at is null and exists(select 1 from public.bar_recipe_components r where r.company_id=p_company_id and r.inventory_item_id=i.id and r.active=true) and greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=greatest(coalesce(i.reorder_point,0),coalesce(i.minimum_stock,0)) order by case when greatest(i.current_stock-coalesce(i.reserved_stock,0)-coalesce(i.blocked_stock,0)-coalesce(i.damaged_stock,0),0)<=0 then 0 else 1 end,6 asc,i.name;
end;
$$;
revoke execute on function public.bar_stock_alerts(uuid) from public,anon;
grant execute on function public.bar_stock_alerts(uuid) to authenticated;

create or replace function public.bar_prepare_restock(p_company_id uuid,p_inventory_item_id uuid)
returns uuid language plpgsql security invoker set search_path='public' as $$
begin
  if not public.erp_can_admin(p_company_id) then raise exception 'Solo propietario o administrador puede preparar compras de reposición.'; end if;
  if not exists(select 1 from public.bar_recipe_components r where r.company_id=p_company_id and r.inventory_item_id=p_inventory_item_id and r.active=true) then raise exception 'El insumo no está siendo utilizado por una receta activa de IDEALO BAR.'; end if;
  if not exists(select 1 from public.inventory_items i where i.id=p_inventory_item_id and i.company_id=p_company_id and i.active=true and i.deleted_at is null) then raise exception 'Insumo no disponible.'; end if;
  return public.prepare_inventory_purchase(p_inventory_item_id,null);
end;
$$;
revoke execute on function public.bar_prepare_restock(uuid,uuid) from public,anon;
grant execute on function public.bar_prepare_restock(uuid,uuid) to authenticated;
