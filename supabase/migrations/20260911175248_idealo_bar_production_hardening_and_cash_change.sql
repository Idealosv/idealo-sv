-- IDEALO BAR · endurecimiento integral de operación/caja
-- 1) El acceso operativo respeta el estado SaaS.
-- 2) Caja deja de depender de permisos financieros ERP para roles BAR autorizados.
-- 3) Se elimina exposición anónima innecesaria de RPCs BAR.
-- 4) Cobro en efectivo acepta monto recibido mayor al saldo y devuelve cambio.

create or replace function public.bar_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
select coalesce((
  select s.active
     and public.saas_company_operational_access(p_company_id)
     and (
       '*'=any(public.bar_permissions_for_role(s.bar_role))
       or lower(trim(coalesce(p_permission,'')))=any(public.bar_permissions_for_role(s.bar_role))
     )
  from public.bar_staff_assignments s
  where s.company_id=p_company_id and s.user_id=auth.uid()
  limit 1
),false);
$function$;

create or replace function public.bar_my_access(p_company_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
select coalesce((
  select jsonb_build_object(
    'role',s.bar_role,
    'active',s.active and public.saas_company_operational_access(p_company_id),
    'display_name',s.display_name,
    'permissions',case
      when s.active and public.saas_company_operational_access(p_company_id)
        then to_jsonb(public.bar_permissions_for_role(s.bar_role))
      else '[]'::jsonb
    end
  )
  from public.bar_staff_assignments s
  where s.company_id=p_company_id and s.user_id=auth.uid()
  limit 1
),jsonb_build_object('role','none','active',false,'display_name','', 'permissions','[]'::jsonb));
$function$;

drop policy if exists cash_accounts_read on public.cash_accounts;
create policy cash_accounts_read on public.cash_accounts
for select to authenticated
using (
  public.erp_can_read_finance(company_id)
  or public.bar_has_permission(company_id,'cash.view')
);

drop policy if exists cash_movements_read on public.cash_movements;
create policy cash_movements_read on public.cash_movements
for select to authenticated
using (
  public.erp_can_read_finance(company_id)
  or public.bar_has_permission(company_id,'cash.view')
);

drop policy if exists cash_register_sessions_read on public.cash_register_sessions;
create policy cash_register_sessions_read on public.cash_register_sessions
for select to authenticated
using (
  public.erp_can_read_finance(company_id)
  or public.bar_has_permission(company_id,'cash.view')
);

drop policy if exists cash_register_sessions_write on public.cash_register_sessions;
create policy cash_register_sessions_write on public.cash_register_sessions
for all to authenticated
using (public.erp_can_admin(company_id))
with check (public.erp_can_admin(company_id));

drop policy if exists cash_register_cuts_read on public.cash_register_cuts;
create policy cash_register_cuts_read on public.cash_register_cuts
for select to authenticated
using (
  public.erp_can_read_finance(company_id)
  or public.bar_has_permission(company_id,'cash.view')
);

drop policy if exists cash_register_cuts_write on public.cash_register_cuts;
create policy cash_register_cuts_write on public.cash_register_cuts
for all to authenticated
using (public.erp_can_admin(company_id))
with check (public.erp_can_admin(company_id));

create or replace function public.bar_take_payment(
  p_order_id uuid,
  p_method text,
  p_amount numeric default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.bar_orders%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_method text;
  v_paid numeric;
  v_due numeric;
  v_tendered numeric;
  v_amount numeric;
  v_change numeric:=0;
  v_account_id uuid;
  v_account_count integer;
  v_account_type text;
  v_payment_id uuid;
  v_movement_id uuid;
  v_remaining numeric;
  v_closed boolean:=false;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;

  select * into v_order
  from public.bar_orders
  where id=p_order_id
  for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;

  if not public.bar_has_permission(v_order.company_id,'payment.take') then
    raise exception 'Tu rol no puede cobrar este pedido.';
  end if;
  if v_order.status in ('paid','cancelled') then
    raise exception 'El pedido ya está cerrado.';
  end if;

  v_method:=lower(trim(coalesce(p_method,'')));
  if v_method not in ('cash','card','transfer','other') then
    raise exception 'Método de pago no válido.';
  end if;

  select * into v_session
  from public.cash_register_sessions
  where company_id=v_order.company_id and upper(status)='OPEN'
  order by opened_at desc
  limit 1
  for update;
  if not found then
    raise exception 'Caja cerrada. Abre un turno de caja antes de cobrar.';
  end if;

  select coalesce(sum(amount),0) into v_paid
  from public.bar_payments
  where order_id=v_order.id;

  v_due:=round(greatest(coalesce(v_order.total,0)-v_paid,0),2);
  if v_due<=0 then raise exception 'El pedido no tiene saldo pendiente.'; end if;

  v_tendered:=round(coalesce(p_amount,v_due),2);
  if v_tendered<=0 then raise exception 'Monto de pago inválido.'; end if;

  if v_method='cash' then
    v_amount:=least(v_tendered,v_due);
    v_change:=round(greatest(v_tendered-v_due,0),2);
  else
    if v_tendered>v_due then
      raise exception 'El pago supera el saldo pendiente de %.',v_due;
    end if;
    v_amount:=v_tendered;
  end if;

  if v_method='cash' then
    v_account_id:=v_session.cash_account_id;
  elsif v_method in ('card','transfer') then
    select count(*) into v_account_count
    from public.cash_accounts
    where company_id=v_order.company_id and upper(account_type)='BANK' and active=true;

    if v_account_count=1 then
      select id into v_account_id
      from public.cash_accounts
      where company_id=v_order.company_id and upper(account_type)='BANK' and active=true
      order by id::text limit 1;
    else
      v_account_id:=null;
    end if;
  else
    v_account_id:=null;
  end if;

  insert into public.bar_payments(
    company_id,order_id,cash_register_session_id,method,amount,reference,received_by,
    financial_posting_status,financial_note
  ) values(
    v_order.company_id,v_order.id,v_session.id,v_method,v_amount,
    nullif(trim(coalesce(p_reference,'')),''),auth.uid(),
    case when v_account_id is null then 'pending_account' else 'pending' end,
    case
      when v_account_id is null then 'Cobro registrado; falta seleccionar cuenta para contabilizarlo.'
      when v_change>0 then 'Efectivo recibido '||to_char(v_tendered,'FM999999990.00')||'; cambio '||to_char(v_change,'FM999999990.00')||'.'
      else null
    end
  ) returning id into v_payment_id;

  if v_account_id is not null then
    select upper(coalesce(account_type,'')) into v_account_type
    from public.cash_accounts where id=v_account_id;

    insert into public.cash_movements(
      company_id,cash_account_id,movement_date,movement_type,source_type,source_id,
      concept,amount,reference,notes,cash_register_session_id
    ) values(
      v_order.company_id,v_account_id,now(),'INCOME','BAR_SALE',v_payment_id,
      'IDEALO BAR · '||v_order.order_code,v_amount,
      nullif(trim(coalesce(p_reference,'')),''),
      case when v_change>0
        then 'Cobro EFECTIVO. Recibido '||to_char(v_tendered,'FM999999990.00')||'; cambio '||to_char(v_change,'FM999999990.00')||'.'
        else 'Cobro '||upper(v_method)||' registrado desde Operación IDEALO BAR.'
      end,
      case when v_account_type in ('CASH','CAJA') then v_session.id else null end
    ) returning id into v_movement_id;

    update public.bar_payments
    set cash_movement_id=v_movement_id,
        financial_posting_status='posted',
        financial_note=case when v_change>0
          then 'Ingreso contabilizado. Recibido '||to_char(v_tendered,'FM999999990.00')||'; cambio '||to_char(v_change,'FM999999990.00')||'.'
          else 'Ingreso contabilizado en Caja/Banco.'
        end
    where id=v_payment_id;
  end if;

  v_remaining:=round(greatest(v_due-v_amount,0),2);
  if v_remaining<=0 then
    update public.bar_orders
    set status='paid',closed_at=now(),closed_by=auth.uid(),
        fulfillment_status=case
          when order_type='delivery' then fulfillment_status
          when order_type='takeaway' then 'picked_up'
          else 'served'
        end
    where id=v_order.id;

    if v_order.table_id is not null then
      update public.bar_tables
      set status='available'
      where id=v_order.table_id and company_id=v_order.company_id;
    end if;
    v_closed:=true;
  end if;

  insert into public.bar_order_events(company_id,order_id,event_type,details)
  values(
    v_order.company_id,v_order.id,'PAYMENT_RECEIVED',
    jsonb_build_object(
      'payment_id',v_payment_id,
      'method',v_method,
      'amount',v_amount,
      'tendered',v_tendered,
      'change',v_change,
      'remaining',v_remaining,
      'closed',v_closed
    )
  );

  return jsonb_build_object(
    'payment_id',v_payment_id,
    'amount',v_amount,
    'tendered',v_tendered,
    'change',v_change,
    'remaining',v_remaining,
    'closed',v_closed
  );
end;
$function$;

revoke execute on function public.bar_cash_dashboard(uuid) from public, anon;
revoke execute on function public.bar_close_cash_register(uuid,numeric,text) from public, anon;
revoke execute on function public.bar_register_cash_movement(uuid,text,numeric,text,text,text) from public, anon;
revoke execute on function public.bar_create_equal_splits(uuid,integer) from public, anon;
revoke execute on function public.bar_create_inventory_ingredient(uuid,text,text) from public, anon;
revoke execute on function public.bar_create_item_split(uuid,text,jsonb) from public, anon;
revoke execute on function public.bar_initialize_location_stock(uuid,uuid,uuid,text,numeric) from public, anon;
revoke execute on function public.bar_operational_smoke_test(uuid) from public, anon;
revoke execute on function public.bar_prepare_dte_test_runtime(uuid) from public, anon;
revoke execute on function public.bar_prepare_purchase_by_presentation(uuid,numeric) from public, anon;
revoke execute on function public.bar_queue_station_tickets(uuid) from public, anon;
revoke execute on function public.bar_real_setup_snapshot(uuid) from public, anon;
revoke execute on function public.bar_replace_product_recipe(uuid,jsonb) from public, anon;
revoke execute on function public.bar_save_physical_inventory(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public, anon;
revoke execute on function public.bar_save_product_price(uuid,numeric,boolean) from public, anon;
revoke execute on function public.bar_seed_starter_catalog(uuid) from public, anon;
revoke execute on function public.bar_transfer_location_stock(uuid,uuid,numeric,text) from public, anon;
revoke execute on function public.bar_restore_integrated_catalog_after_seed() from public, anon, authenticated;

grant execute on function public.bar_cash_dashboard(uuid) to authenticated, service_role;
grant execute on function public.bar_close_cash_register(uuid,numeric,text) to authenticated, service_role;
grant execute on function public.bar_register_cash_movement(uuid,text,numeric,text,text,text) to authenticated, service_role;
grant execute on function public.bar_create_equal_splits(uuid,integer) to authenticated, service_role;
grant execute on function public.bar_create_inventory_ingredient(uuid,text,text) to authenticated, service_role;
grant execute on function public.bar_create_item_split(uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.bar_initialize_location_stock(uuid,uuid,uuid,text,numeric) to authenticated, service_role;
grant execute on function public.bar_operational_smoke_test(uuid) to authenticated, service_role;
grant execute on function public.bar_prepare_dte_test_runtime(uuid) to authenticated, service_role;
grant execute on function public.bar_prepare_purchase_by_presentation(uuid,numeric) to authenticated, service_role;
grant execute on function public.bar_queue_station_tickets(uuid) to authenticated, service_role;
grant execute on function public.bar_real_setup_snapshot(uuid) to authenticated, service_role;
grant execute on function public.bar_replace_product_recipe(uuid,jsonb) to authenticated, service_role;
grant execute on function public.bar_save_physical_inventory(uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated, service_role;
grant execute on function public.bar_save_product_price(uuid,numeric,boolean) to authenticated, service_role;
grant execute on function public.bar_seed_starter_catalog(uuid) to authenticated, service_role;
grant execute on function public.bar_transfer_location_stock(uuid,uuid,numeric,text) to authenticated, service_role;

revoke execute on function public.bar_take_payment(uuid,text,numeric,text) from public, anon;
grant execute on function public.bar_take_payment(uuid,text,numeric,text) to authenticated, service_role;
