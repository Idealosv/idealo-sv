-- IDEALO Eggs: controles comerciales iniciales
-- Evita exceder el límite de crédito configurado por cliente.

create or replace function public.egg_create_order(
  p_company_id uuid,
  p_customer_id uuid,
  p_grade_id uuid,
  p_presentation text,
  p_quantity_units numeric,
  p_eggs_per_unit integer,
  p_unit_price numeric,
  p_payment_type text default 'CREDIT',
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_total_eggs integer;
  v_stock bigint;
  v_total numeric;
  v_credit_days integer;
  v_credit_limit numeric;
  v_open_balance numeric;
  v_due date;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if not exists(select 1 from public.egg_customers where id=p_customer_id and company_id=p_company_id and active=true) then raise exception 'Cliente inválido.'; end if;
  if not exists(select 1 from public.egg_grades where id=p_grade_id and company_id=p_company_id and active=true) then raise exception 'Clasificación inválida.'; end if;
  if coalesce(p_quantity_units,0)<=0 or coalesce(p_eggs_per_unit,0)<=0 then raise exception 'Cantidad inválida.'; end if;
  if coalesce(p_unit_price,0)<0 then raise exception 'Precio inválido.'; end if;

  v_total_eggs:=round(p_quantity_units*p_eggs_per_unit);
  select coalesce(sum(quantity_eggs),0) into v_stock
  from public.egg_inventory_movements
  where company_id=p_company_id and grade_id=p_grade_id;
  if v_stock<v_total_eggs then
    raise exception 'Inventario insuficiente para este pedido. Disponible: % huevos.',v_stock;
  end if;

  select credit_days,credit_limit into v_credit_days,v_credit_limit
  from public.egg_customers where id=p_customer_id;

  v_total:=round((p_quantity_units*p_unit_price)::numeric,2);

  if upper(coalesce(p_payment_type,'CREDIT'))='CREDIT' and coalesce(v_credit_limit,0)>0 then
    select coalesce(sum(greatest(total-paid_amount,0)),0) into v_open_balance
    from public.egg_orders
    where company_id=p_company_id and customer_id=p_customer_id and status not in ('PAID','CANCELLED');
    if v_open_balance+v_total>v_credit_limit then
      raise exception 'El pedido supera el límite de crédito del cliente. Disponible: %.',
        greatest(v_credit_limit-v_open_balance,0);
    end if;
  end if;

  v_order_id:=gen_random_uuid();
  v_order_number:='EGG-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,6));
  v_due:=case when upper(coalesce(p_payment_type,'CREDIT'))='CREDIT' and coalesce(v_credit_days,0)>0 then current_date+v_credit_days else current_date end;

  insert into public.egg_orders(id,company_id,customer_id,order_number,order_date,due_date,status,payment_type,subtotal,total,paid_amount,notes,created_by)
  values(v_order_id,p_company_id,p_customer_id,v_order_number,current_date,v_due,
    case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then 'PAID' else 'CONFIRMED' end,
    case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then 'CASH' else 'CREDIT' end,
    v_total,v_total,case when upper(coalesce(p_payment_type,'CREDIT'))='CASH' then v_total else 0 end,coalesce(p_notes,''),auth.uid());

  insert into public.egg_order_items(company_id,order_id,grade_id,presentation,quantity_units,eggs_per_unit,total_eggs,unit_price,line_total)
  values(p_company_id,v_order_id,p_grade_id,coalesce(nullif(trim(p_presentation),''),'TRAY'),p_quantity_units,p_eggs_per_unit,v_total_eggs,p_unit_price,v_total);

  insert into public.egg_inventory_movements(company_id,grade_id,order_id,movement_type,quantity_eggs,unit_cost,notes,created_by)
  values(p_company_id,p_grade_id,v_order_id,'SALE',-v_total_eggs,0,'Salida por pedido '||v_order_number,auth.uid());

  if upper(coalesce(p_payment_type,'CREDIT'))='CASH' and v_total>0 then
    insert into public.egg_payments(company_id,order_id,amount,method,reference,created_by)
    values(p_company_id,v_order_id,v_total,'CASH','Pago al contado',auth.uid());
  end if;

  return v_order_id;
end;
$$;

grant execute on function public.egg_create_order(uuid,uuid,uuid,text,numeric,integer,numeric,text,text) to authenticated;
