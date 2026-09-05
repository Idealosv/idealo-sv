create or replace function public.idealo_assign_quote_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':quotes', 0));
    select coalesce(max(q.number),0)+1 into new.number from public.quotes q where q.company_id=new.company_id;
  end if;
  if nullif(btrim(coalesce(new.prefix,'')),'') is null then new.prefix := 'COT'; end if;
  if nullif(btrim(coalesce(new.code,'')),'') is null then
    new.code := new.prefix || '-' || extract(year from coalesce(new.created_at,now()))::int || '-' || lpad(new.number::text,5,'0');
  end if;
  return new;
end $$;

drop trigger if exists trg_quote_assign_identity on public.quotes;
create trigger trg_quote_assign_identity before insert on public.quotes
for each row execute function public.idealo_assign_quote_identity();

create or replace function public.idealo_assign_work_order_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':work_orders', 0));
    select coalesce(max(w.number),0)+1 into new.number from public.work_orders w where w.company_id=new.company_id;
  end if;
  if nullif(btrim(coalesce(new.production_code,'')),'') is null then
    new.production_code := 'OT-' || lpad(new.number::text,5,'0');
  end if;
  return new;
end $$;

drop trigger if exists trg_work_order_assign_number on public.work_orders;
create trigger trg_work_order_assign_number before insert on public.work_orders
for each row execute function public.idealo_assign_work_order_number();

create or replace function public.save_quote_quick(
  p_company_id uuid,
  p_quote_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_item jsonb;
  v_product uuid;
  v_description text;
  v_quantity numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid() and role in ('owner','admin','staff')) then raise exception 'Sin permiso para guardar cotizaciones'; end if;
  if coalesce(jsonb_typeof(p_items),'') <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Agregá al menos una partida'; end if;
  if nullif(p_payload->>'client_id','') is null then raise exception 'Seleccioná el cliente'; end if;
  if not exists(select 1 from public.clients c where c.id=(p_payload->>'client_id')::uuid and c.company_id=p_company_id) then raise exception 'El cliente no pertenece a la empresa activa'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_description := btrim(coalesce(v_item->>'description',''));
    v_quantity := coalesce(nullif(v_item->>'quantity',''),'0')::numeric;
    if v_description='' then raise exception 'Todas las partidas necesitan descripción'; end if;
    if v_quantity<=0 then raise exception 'Todas las partidas necesitan cantidad mayor que cero'; end if;
    v_product := nullif(v_item->>'product_id','')::uuid;
    if v_product is not null and not exists(select 1 from public.finished_products p where p.id=v_product and p.company_id=p_company_id) then raise exception 'Una partida contiene un producto de otra empresa'; end if;
  end loop;

  if p_quote_id is null then
    insert into public.quotes(
      company_id,client_id,status,title,valid_until,payment_method,payment_terms,promised_delivery_date,
      customer_notes,notes,internal_notes,include_tax,tax_mode,subtotal,tax_total,total,cost_total,profit_total,
      margin_percent,discount_percent,discount_fixed,surcharge_percent,surcharge_fixed,minimum_margin
    ) values (
      p_company_id,(p_payload->>'client_id')::uuid,'DRAFT',nullif(p_payload->>'title',''),nullif(p_payload->>'valid_until','')::date,
      nullif(p_payload->>'payment_method',''),nullif(p_payload->>'payment_terms',''),nullif(p_payload->>'promised_delivery_date','')::date,
      nullif(p_payload->>'customer_notes',''),nullif(p_payload->>'customer_notes',''),nullif(p_payload->>'internal_notes',''),true,
      case when p_payload->>'tax_mode'='ADDED' then 'ADDED' else 'INCLUDED' end,
      coalesce(nullif(p_payload->>'subtotal',''),'0')::numeric,coalesce(nullif(p_payload->>'tax_total',''),'0')::numeric,
      coalesce(nullif(p_payload->>'total',''),'0')::numeric,coalesce(nullif(p_payload->>'cost_total',''),'0')::numeric,
      coalesce(nullif(p_payload->>'profit_total',''),'0')::numeric,coalesce(nullif(p_payload->>'margin_percent',''),'0')::numeric,
      coalesce(nullif(p_payload->>'discount_percent',''),'0')::numeric,coalesce(nullif(p_payload->>'discount_fixed',''),'0')::numeric,
      coalesce(nullif(p_payload->>'surcharge_percent',''),'0')::numeric,coalesce(nullif(p_payload->>'surcharge_fixed',''),'0')::numeric,
      coalesce(nullif(p_payload->>'minimum_margin',''),'0')::numeric
    ) returning * into v_quote;
  else
    select * into v_quote from public.quotes where id=p_quote_id and company_id=p_company_id for update;
    if not found then raise exception 'Cotización no encontrada'; end if;
    if v_quote.status not in ('DRAFT','PREPARED','NEGOTIATION') then raise exception 'La cotización ya fue enviada o aprobada; no se puede modificar su contenido'; end if;
    update public.quotes set
      client_id=(p_payload->>'client_id')::uuid,title=nullif(p_payload->>'title',''),valid_until=nullif(p_payload->>'valid_until','')::date,
      payment_method=nullif(p_payload->>'payment_method',''),payment_terms=nullif(p_payload->>'payment_terms',''),
      promised_delivery_date=nullif(p_payload->>'promised_delivery_date','')::date,customer_notes=nullif(p_payload->>'customer_notes',''),
      notes=nullif(p_payload->>'customer_notes',''),internal_notes=nullif(p_payload->>'internal_notes',''),include_tax=true,
      tax_mode=case when p_payload->>'tax_mode'='ADDED' then 'ADDED' else 'INCLUDED' end,
      subtotal=coalesce(nullif(p_payload->>'subtotal',''),'0')::numeric,tax_total=coalesce(nullif(p_payload->>'tax_total',''),'0')::numeric,
      total=coalesce(nullif(p_payload->>'total',''),'0')::numeric,cost_total=coalesce(nullif(p_payload->>'cost_total',''),'0')::numeric,
      profit_total=coalesce(nullif(p_payload->>'profit_total',''),'0')::numeric,margin_percent=coalesce(nullif(p_payload->>'margin_percent',''),'0')::numeric,
      discount_percent=coalesce(nullif(p_payload->>'discount_percent',''),'0')::numeric,discount_fixed=coalesce(nullif(p_payload->>'discount_fixed',''),'0')::numeric,
      surcharge_percent=coalesce(nullif(p_payload->>'surcharge_percent',''),'0')::numeric,surcharge_fixed=coalesce(nullif(p_payload->>'surcharge_fixed',''),'0')::numeric,
      minimum_margin=coalesce(nullif(p_payload->>'minimum_margin',''),'0')::numeric,updated_at=now()
    where id=p_quote_id returning * into v_quote;
    delete from public.quote_items where quote_id=p_quote_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.quote_items(
      quote_id,product_id,description,quantity,unit,unit_price,line_total,sort_order,minimum_price,width,height,dimension_unit,area_m2,
      price_per_m2,discount_percent,discount_fixed,discount,surcharge_percent,surcharge_fixed,taxable,tax_rate,tax_amount,
      unit_cost,labor_unit_cost,installation_unit_cost,cost_total,profit_total,margin_percent,markup_percent,requires_production,specifications,internal_notes
    ) values (
      v_quote.id,nullif(v_item->>'product_id','')::uuid,btrim(v_item->>'description'),coalesce(nullif(v_item->>'quantity',''),'0')::numeric,
      coalesce(nullif(v_item->>'unit',''),'unidad'),coalesce(nullif(v_item->>'unit_price',''),'0')::numeric,coalesce(nullif(v_item->>'line_total',''),'0')::numeric,
      coalesce(nullif(v_item->>'sort_order',''),'0')::int,coalesce(nullif(v_item->>'minimum_price',''),'0')::numeric,nullif(v_item->>'width','')::numeric,
      nullif(v_item->>'height','')::numeric,coalesce(nullif(v_item->>'dimension_unit',''),'m'),coalesce(nullif(v_item->>'area_m2',''),'0')::numeric,
      coalesce(nullif(v_item->>'price_per_m2',''),'0')::numeric,coalesce(nullif(v_item->>'discount_percent',''),'0')::numeric,
      coalesce(nullif(v_item->>'discount_fixed',''),'0')::numeric,coalesce(nullif(v_item->>'discount',''),'0')::numeric,
      coalesce(nullif(v_item->>'surcharge_percent',''),'0')::numeric,coalesce(nullif(v_item->>'surcharge_fixed',''),'0')::numeric,
      coalesce((v_item->>'taxable')::boolean,true),coalesce(nullif(v_item->>'tax_rate',''),'13')::numeric,coalesce(nullif(v_item->>'tax_amount',''),'0')::numeric,
      coalesce(nullif(v_item->>'unit_cost',''),'0')::numeric,coalesce(nullif(v_item->>'labor_unit_cost',''),'0')::numeric,
      coalesce(nullif(v_item->>'installation_unit_cost',''),'0')::numeric,coalesce(nullif(v_item->>'cost_total',''),'0')::numeric,
      coalesce(nullif(v_item->>'profit_total',''),'0')::numeric,coalesce(nullif(v_item->>'margin_percent',''),'0')::numeric,
      coalesce(nullif(v_item->>'markup_percent',''),'0')::numeric,coalesce((v_item->>'requires_production')::boolean,true),
      nullif(v_item->>'specifications',''),nullif(v_item->>'internal_notes','')
    );
  end loop;

  select * into v_quote from public.quotes where id=v_quote.id;
  return to_jsonb(v_quote);
end $$;

create or replace function public.transition_quote_status(p_quote_id uuid,p_to_status text,p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q public.quotes%rowtype; v_from text; allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if not exists(select 1 from public.company_members where company_id=q.company_id and user_id=auth.uid() and role in ('owner','admin','staff')) then raise exception 'Sin permiso'; end if;
  if q.status=p_to_status then return to_jsonb(q); end if;
  v_from := q.status;
  allowed := case v_from
    when 'DRAFT' then p_to_status in ('PREPARED','SENT','CANCELLED','ARCHIVED')
    when 'PREPARED' then p_to_status in ('DRAFT','SENT','CANCELLED','ARCHIVED')
    when 'SENT' then p_to_status in ('VIEWED','NEGOTIATION','PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED')
    when 'VIEWED' then p_to_status in ('NEGOTIATION','PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED')
    when 'NEGOTIATION' then p_to_status in ('SENT','PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED')
    when 'PENDING' then p_to_status in ('NEGOTIATION','APPROVED','REJECTED','EXPIRED','CANCELLED')
    when 'APPROVED' then p_to_status in ('NEGOTIATION','PARTIALLY_CONVERTED','CONVERTED','CANCELLED')
    when 'REJECTED' then p_to_status in ('NEGOTIATION','ARCHIVED')
    when 'EXPIRED' then p_to_status in ('NEGOTIATION','ARCHIVED')
    when 'PARTIALLY_CONVERTED' then p_to_status in ('CONVERTED','CANCELLED')
    when 'CONVERTED' then p_to_status='ARCHIVED'
    when 'CANCELLED' then p_to_status in ('DRAFT','ARCHIVED')
    when 'ARCHIVED' then p_to_status='DRAFT'
    else false end;
  if not allowed then raise exception 'Transición de estado no permitida: % -> %',v_from,p_to_status; end if;
  update public.quotes set status=p_to_status,updated_at=now(),
    sent_at=case when p_to_status='SENT' then coalesce(sent_at,now()) else sent_at end,
    approved_at=case when p_to_status='APPROVED' then coalesce(approved_at,now()) else approved_at end,
    rejected_at=case when p_to_status='REJECTED' then coalesce(rejected_at,now()) else rejected_at end,
    converted_at=case when p_to_status='CONVERTED' then coalesce(converted_at,now()) else converted_at end,
    archived_at=case when p_to_status='ARCHIVED' then coalesce(archived_at,now()) else archived_at end
  where id=q.id returning * into q;
  insert into public.quote_status_history(company_id,quote_id,from_status,to_status,changed_by,comment)
  values(q.company_id,q.id,v_from,p_to_status,auth.uid(),coalesce(p_comment,'Cambio de estado'));
  return to_jsonb(q);
end $$;

create or replace function public.convert_quote_to_work_order(p_quote_id uuid,p_due_at timestamptz default null,p_priority text default 'NORMAL')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q public.quotes%rowtype; v_id uuid; v_from text; v_number bigint;
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
  insert into public.work_orders(company_id,quote_id,client_id,status,title,due_at,total,priority,production_notes,installation_required,installation_address)
  values(q.company_id,q.id,q.client_id,'PENDING',coalesce(nullif(q.title,''),'Trabajo '||coalesce(q.code,'COT-'||q.number)),p_due_at,q.total,p_priority,q.internal_notes,q.installation_required,q.installation_address)
  returning id,number into v_id,v_number;
  insert into public.work_order_items(work_order_id,product_id,description,quantity,unit,unit_price,line_total,specifications,sort_order)
  select v_id,product_id,description,quantity,unit,unit_price,line_total,specifications,sort_order from public.quote_items where quote_id=q.id order by sort_order;
  update public.quotes set status='CONVERTED',converted_at=now(),updated_at=now() where id=q.id;
  insert into public.quote_status_history(company_id,quote_id,from_status,to_status,changed_by,comment)
  values(q.company_id,q.id,'APPROVED','CONVERTED',auth.uid(),'Cotización convertida a orden de trabajo');
  return jsonb_build_object('id',v_id,'number',v_number,'existing',false);
end $$;

create or replace function public.mobile_convert_quote_to_work_order(p_quote_id uuid,p_due_at timestamptz default null,p_priority text default 'NORMAL')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb;
begin
  r:=public.convert_quote_to_work_order(p_quote_id,p_due_at,p_priority);
  return (r->>'id')::uuid;
end $$;

grant execute on function public.save_quote_quick(uuid,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.transition_quote_status(uuid,text,text) to authenticated;
grant execute on function public.convert_quote_to_work_order(uuid,timestamptz,text) to authenticated;