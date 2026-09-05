create or replace function public.consume_work_order_inventory_on_production()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_qty numeric(18,3);
  v_cost numeric(18,4);
  v_total numeric(14,2);
begin
  if new.status<>'PRODUCTION' or old.status='PRODUCTION' then return new; end if;

  for r in
    select pm.*,i.average_cost,i.current_stock
    from public.production_material_requirements pm
    left join public.inventory_items i on i.id=pm.inventory_item_id and i.company_id=pm.company_id
    where pm.work_order_id=new.id and coalesce(pm.required_qty,0)>coalesce(pm.consumed_qty,0)
    order by pm.created_at,pm.id
  loop
    if r.inventory_item_id is null then raise exception 'El material % no está vinculado al Inventario',r.material_name; end if;
    if coalesce(r.reserved_qty,0)<coalesce(r.required_qty,0) then raise exception 'El material % no está completamente reservado',r.material_name; end if;

    v_qty:=r.required_qty-r.consumed_qty;
    v_cost:=coalesce(nullif(r.unit_cost,0),r.average_cost,0);

    insert into public.inventory_movements(
      company_id,inventory_item_id,movement_type,quantity,unit_cost,work_order_id,
      warehouse_id,location_id,reservation_id,document_type,document_id,reference,notes,created_by
    ) values (
      new.company_id,r.inventory_item_id,'PRODUCTION_OUT',v_qty,v_cost,new.id,
      (select warehouse_id from public.inventory_items where id=r.inventory_item_id),
      (select location_id from public.inventory_items where id=r.inventory_item_id),
      r.reservation_id,'WORK_ORDER',new.id,
      'OT-'||coalesce(new.number::text,new.id::text),
      'Consumo automático de '||r.material_name||' al iniciar producción',auth.uid()
    );

    update public.production_material_requirements
    set consumed_qty=required_qty,status='CONSUMED',unit_cost=v_cost,updated_at=now()
    where id=r.id;

    if r.reservation_id is not null then
      update public.inventory_reservations
      set consumed_quantity=quantity,status='CONSUMED',updated_at=now()
      where id=r.reservation_id;
    end if;

    perform public.refresh_inventory_reserved_stock(r.inventory_item_id);

    insert into public.work_order_costs(company_id,work_order_id,cost_type,concept,amount,notes,incurred_at,source_type,source_id)
    values(new.company_id,new.id,'MATERIAL',r.material_name,round((v_qty*v_cost)::numeric,2),'Consumo automático desde Inventario',current_date,'PRODUCTION_MATERIAL',r.id)
    on conflict (company_id,source_type,source_id) where source_id is not null
    do update set amount=excluded.amount,concept=excluded.concept,notes=excluded.notes,updated_at=now();
  end loop;

  select coalesce(sum(c.amount),0) into v_total from public.work_order_costs c where c.work_order_id=new.id;
  update public.work_orders set actual_cost=v_total where id=new.id;
  return new;
end;
$$;
