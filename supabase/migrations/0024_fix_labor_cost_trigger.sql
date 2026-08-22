create or replace function sync_labor_allocation_cost() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op='DELETE' then
    delete from work_order_costs where source_type='LABOR_ALLOCATION' and source_id=old.id;
    return old;
  end if;
  insert into work_order_costs(company_id,work_order_id,cost_type,concept,amount,incurred_at,employee_id,source_type,source_id)
  values(new.company_id,new.work_order_id,'LABOR','Mano de obra · empleado',new.amount,new.work_date,new.employee_id,'LABOR_ALLOCATION',new.id)
  on conflict (company_id,source_type,source_id) where source_id is not null
  do update set work_order_id=excluded.work_order_id,concept=excluded.concept,amount=excluded.amount,incurred_at=excluded.incurred_at,employee_id=excluded.employee_id,updated_at=now();
  return new;
end $$;
