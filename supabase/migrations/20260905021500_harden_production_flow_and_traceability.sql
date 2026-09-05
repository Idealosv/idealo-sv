-- Producción: transición atómica, trazabilidad y permisos por rol

create or replace function public.transition_work_order_status(
  p_work_order_id uuid,
  p_to_status text,
  p_comment text default null
) returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.work_orders%rowtype;
  v_from text;
  v_progress numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into w from public.work_orders where id = p_work_order_id for update;
  if not found then raise exception 'Orden de trabajo no encontrada'; end if;

  if not exists (
    select 1 from public.company_members
    where company_id = w.company_id and user_id = auth.uid() and role in ('owner','admin','staff')
  ) then raise exception 'Sin permiso'; end if;

  v_from := w.status;
  if v_from = p_to_status then return w; end if;

  if not (
    (v_from='PENDING' and p_to_status='DESIGN') or
    (v_from in ('DESIGN','APPROVAL') and p_to_status='PRODUCTION') or
    (v_from='PRODUCTION' and p_to_status='READY') or
    (v_from='READY' and p_to_status='DELIVERED')
  ) then
    raise exception 'Transición de producción no permitida: % -> %', v_from, p_to_status;
  end if;

  v_progress := case p_to_status
    when 'DESIGN' then greatest(coalesce(w.progress_percent,0),20)
    when 'PRODUCTION' then greatest(coalesce(w.progress_percent,0),50)
    when 'READY' then greatest(coalesce(w.progress_percent,0),90)
    when 'DELIVERED' then 100
    else coalesce(w.progress_percent,0)
  end;

  update public.work_orders
  set status = p_to_status,
      progress_percent = v_progress,
      production_started_at = case when p_to_status='PRODUCTION' then coalesce(production_started_at,now()) else production_started_at end,
      ready_at = case when p_to_status='READY' then coalesce(ready_at,now()) else ready_at end,
      delivered_at = case when p_to_status='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,
      updated_at = now()
  where id = w.id
  returning * into w;

  insert into public.production_status_history(company_id,work_order_id,from_status,to_status,comment,changed_by)
  values(w.company_id,w.id,v_from,p_to_status,nullif(trim(coalesce(p_comment,'')),''),auth.uid());

  return w;
end;
$$;

revoke all on function public.transition_work_order_status(uuid,text,text) from public, anon;
grant execute on function public.transition_work_order_status(uuid,text,text) to authenticated;

drop policy if exists company_members_access on public.production_status_history;
create policy production_status_history_read on public.production_status_history for select using (public.erp_can_read(company_id));
create policy production_status_history_write on public.production_status_history for all using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

drop policy if exists company_members_access on public.production_material_requirements;
create policy production_material_requirements_read on public.production_material_requirements for select using (public.erp_can_read(company_id));
create policy production_material_requirements_write on public.production_material_requirements for all using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

drop policy if exists company_members_manage_inventory_reservations on public.inventory_reservations;
create policy inventory_reservations_read on public.inventory_reservations for select using (public.erp_can_read(company_id));
create policy inventory_reservations_write on public.inventory_reservations for all using (public.erp_can_operate(company_id)) with check (public.erp_can_operate(company_id));

drop policy if exists "members manage work order costs" on public.work_order_costs;
create policy work_order_costs_read on public.work_order_costs for select using (
  public.erp_can_read(company_id) and exists(select 1 from public.work_orders w where w.id=work_order_costs.work_order_id and w.company_id=work_order_costs.company_id)
);
create policy work_order_costs_write on public.work_order_costs for all using (
  public.erp_can_operate(company_id) and exists(select 1 from public.work_orders w where w.id=work_order_costs.work_order_id and w.company_id=work_order_costs.company_id)
) with check (
  public.erp_can_operate(company_id) and exists(select 1 from public.work_orders w where w.id=work_order_costs.work_order_id and w.company_id=work_order_costs.company_id)
);

create or replace function public.convert_quote_to_work_order(p_quote_id uuid, p_due_at timestamptz default null, p_priority text default 'NORMAL')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  v_id uuid;
  v_from text;
  v_number bigint;
  v_specs text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if not exists(select 1 from public.company_members where company_id=q.company_id and user_id=auth.uid() and role in ('owner','admin','staff')) then raise exception 'Sin permiso'; end if;
  if p_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'Prioridad inválida'; end if;

  select id,number into v_id,v_number from public.work_orders where quote_id=q.id limit 1;
  if v_id is not null then
    if q.status<>'CONVERTED' then
      v_from:=q.status;
      update public.quotes set status='CONVERTED',converted_at=coalesce(converted_at,now()),updated_at=now() where id=q.id;
      insert into public.quote_status_history(company_id,quote_id,from_status,to_status,changed_by,comment)
      values(q.company_id,q.id,v_from,'CONVERTED',auth.uid(),'Orden de trabajo existente vinculada');
    end if;
    return jsonb_build_object('id',v_id,'number',v_number,'existing',true);
  end if;

  if q.status<>'APPROVED' then raise exception 'La cotización debe estar aprobada antes de crear la orden'; end if;
  if not exists(select 1 from public.quote_items where quote_id=q.id) then raise exception 'La cotización no tiene partidas'; end if;

  select string_agg(nullif(trim(specifications),''), E'\n' order by sort_order)
  into v_specs
  from public.quote_items
  where quote_id=q.id and nullif(trim(coalesce(specifications,'')),'') is not null;

  insert into public.work_orders(
    company_id,quote_id,client_id,status,title,due_at,total,priority,
    production_notes,internal_notes,specifications,
    installation_required,installation_address,installation_contact,installation_phone
  ) values (
    q.company_id,q.id,q.client_id,'PENDING',coalesce(nullif(q.title,''),'Trabajo '||coalesce(q.code,'COT-'||q.number)),
    coalesce(p_due_at,case when q.promised_delivery_date is not null then q.promised_delivery_date::timestamptz + interval '17 hours' else null end),
    q.total,p_priority,q.internal_notes,q.internal_notes,v_specs,
    q.installation_required,q.installation_address,q.contact_name,q.contact_phone
  ) returning id,number into v_id,v_number;

  insert into public.work_order_items(work_order_id,product_id,description,quantity,unit,unit_price,line_total,specifications,sort_order)
  select v_id,product_id,description,quantity,unit,unit_price,line_total,specifications,sort_order
  from public.quote_items where quote_id=q.id order by sort_order;

  update public.quotes set status='CONVERTED',converted_at=now(),updated_at=now() where id=q.id;
  insert into public.quote_status_history(company_id,quote_id,from_status,to_status,changed_by,comment)
  values(q.company_id,q.id,'APPROVED','CONVERTED',auth.uid(),'Cotización convertida a orden de trabajo');

  return jsonb_build_object('id',v_id,'number',v_number,'existing',false);
end;
$$;

revoke all on function public.convert_quote_to_work_order(uuid,timestamptz,text) from public, anon;
grant execute on function public.convert_quote_to_work_order(uuid,timestamptz,text) to authenticated;
