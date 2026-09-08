create unique index if not exists quotes_company_number_unique
  on public.quotes(company_id, number)
  where number is not null;

create or replace function public.validate_quote_item_integrity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
declare
  v_company_id uuid;
begin
  select q.company_id into v_company_id
  from public.quotes q
  where q.id = new.quote_id;

  if v_company_id is null then
    raise exception 'La partida no pertenece a una cotización válida';
  end if;

  if btrim(coalesce(new.description, '')) = '' then
    raise exception 'La partida necesita descripción';
  end if;
  if coalesce(new.quantity, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;
  if coalesce(new.unit_price, 0) < 0 or coalesce(new.line_total, 0) < 0 then
    raise exception 'Los importes de la partida no pueden ser negativos';
  end if;
  if coalesce(new.discount, 0) < 0 or coalesce(new.discount_fixed, 0) < 0 or coalesce(new.surcharge_fixed, 0) < 0 or coalesce(new.tax_amount, 0) < 0 then
    raise exception 'Descuentos, recargos e impuestos no pueden ser negativos';
  end if;

  if new.product_id is not null and not exists (
    select 1 from public.finished_products p
    where p.id = new.product_id and p.company_id = v_company_id
  ) then
    raise exception 'El producto de la partida no pertenece a la empresa de la cotización';
  end if;

  if new.variant_id is not null and not exists (
    select 1 from public.product_variants v
    where v.id = new.variant_id and v.company_id = v_company_id
  ) then
    raise exception 'La variante de la partida no pertenece a la empresa de la cotización';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quote_item_integrity on public.quote_items;
create trigger trg_quote_item_integrity
before insert or update on public.quote_items
for each row execute function public.validate_quote_item_integrity();

create or replace function public.save_quote_quick(
  p_company_id uuid,
  p_quote_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quote public.quotes%rowtype;
  v_item jsonb;
  v_product uuid;
  v_description text;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_total numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.erp_can_operate(p_company_id) then raise exception 'Sin permiso operativo para guardar cotizaciones'; end if;
  if coalesce(jsonb_typeof(p_payload), '') <> 'object' then raise exception 'Datos de cotización inválidos'; end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Agregá al menos una partida'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'La cotización supera el máximo de 200 partidas'; end if;
  if nullif(p_payload->>'client_id', '') is null then raise exception 'Seleccioná el cliente'; end if;
  if not exists (
    select 1 from public.clients c
    where c.id = (p_payload->>'client_id')::uuid
      and c.company_id = p_company_id
      and lower(coalesce(c.status, 'active')) = 'active'
  ) then
    raise exception 'El cliente no pertenece a la empresa activa o está inactivo';
  end if;

  if coalesce(nullif(p_payload->>'subtotal', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'tax_total', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'total', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'cost_total', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'discount_percent', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'discount_fixed', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'surcharge_percent', ''), '0')::numeric < 0
     or coalesce(nullif(p_payload->>'surcharge_fixed', ''), '0')::numeric < 0 then
    raise exception 'Los importes de la cotización no pueden ser negativos';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_quantity := coalesce(nullif(v_item->>'quantity', ''), '0')::numeric;
    v_unit_price := coalesce(nullif(v_item->>'unit_price', ''), '0')::numeric;
    v_line_total := coalesce(nullif(v_item->>'line_total', ''), '0')::numeric;
    if v_description = '' then raise exception 'Todas las partidas necesitan descripción'; end if;
    if v_quantity <= 0 then raise exception 'Todas las partidas necesitan cantidad mayor que cero'; end if;
    if v_unit_price < 0 or v_line_total < 0 then raise exception 'Las partidas no pueden tener importes negativos'; end if;
    v_product := nullif(v_item->>'product_id', '')::uuid;
    if v_product is not null and not exists (
      select 1 from public.finished_products p
      where p.id = v_product and p.company_id = p_company_id
    ) then
      raise exception 'Una partida contiene un producto de otra empresa';
    end if;
  end loop;

  if p_quote_id is null then
    insert into public.quotes(
      company_id, client_id, status, title, valid_until, payment_method, payment_terms, promised_delivery_date,
      customer_notes, notes, internal_notes, include_tax, tax_mode, subtotal, tax_total, total, cost_total, profit_total,
      margin_percent, discount_percent, discount_fixed, surcharge_percent, surcharge_fixed, minimum_margin
    ) values (
      p_company_id, (p_payload->>'client_id')::uuid, 'DRAFT', nullif(p_payload->>'title', ''), nullif(p_payload->>'valid_until', '')::date,
      nullif(p_payload->>'payment_method', ''), nullif(p_payload->>'payment_terms', ''), nullif(p_payload->>'promised_delivery_date', '')::date,
      nullif(p_payload->>'customer_notes', ''), nullif(p_payload->>'customer_notes', ''), nullif(p_payload->>'internal_notes', ''), true,
      case when p_payload->>'tax_mode' = 'ADDED' then 'ADDED' else 'INCLUDED' end,
      coalesce(nullif(p_payload->>'subtotal', ''), '0')::numeric, coalesce(nullif(p_payload->>'tax_total', ''), '0')::numeric,
      coalesce(nullif(p_payload->>'total', ''), '0')::numeric, coalesce(nullif(p_payload->>'cost_total', ''), '0')::numeric,
      coalesce(nullif(p_payload->>'profit_total', ''), '0')::numeric, coalesce(nullif(p_payload->>'margin_percent', ''), '0')::numeric,
      coalesce(nullif(p_payload->>'discount_percent', ''), '0')::numeric, coalesce(nullif(p_payload->>'discount_fixed', ''), '0')::numeric,
      coalesce(nullif(p_payload->>'surcharge_percent', ''), '0')::numeric, coalesce(nullif(p_payload->>'surcharge_fixed', ''), '0')::numeric,
      coalesce(nullif(p_payload->>'minimum_margin', ''), '0')::numeric
    ) returning * into v_quote;
  else
    select * into v_quote from public.quotes where id = p_quote_id and company_id = p_company_id for update;
    if not found then raise exception 'Cotización no encontrada'; end if;
    if v_quote.status not in ('DRAFT', 'PREPARED', 'NEGOTIATION') then raise exception 'La cotización ya fue enviada o aprobada; no se puede modificar su contenido'; end if;
    update public.quotes set
      client_id = (p_payload->>'client_id')::uuid,
      title = nullif(p_payload->>'title', ''),
      valid_until = nullif(p_payload->>'valid_until', '')::date,
      payment_method = nullif(p_payload->>'payment_method', ''),
      payment_terms = nullif(p_payload->>'payment_terms', ''),
      promised_delivery_date = nullif(p_payload->>'promised_delivery_date', '')::date,
      customer_notes = nullif(p_payload->>'customer_notes', ''),
      notes = nullif(p_payload->>'customer_notes', ''),
      internal_notes = nullif(p_payload->>'internal_notes', ''),
      include_tax = true,
      tax_mode = case when p_payload->>'tax_mode' = 'ADDED' then 'ADDED' else 'INCLUDED' end,
      subtotal = coalesce(nullif(p_payload->>'subtotal', ''), '0')::numeric,
      tax_total = coalesce(nullif(p_payload->>'tax_total', ''), '0')::numeric,
      total = coalesce(nullif(p_payload->>'total', ''), '0')::numeric,
      cost_total = coalesce(nullif(p_payload->>'cost_total', ''), '0')::numeric,
      profit_total = coalesce(nullif(p_payload->>'profit_total', ''), '0')::numeric,
      margin_percent = coalesce(nullif(p_payload->>'margin_percent', ''), '0')::numeric,
      discount_percent = coalesce(nullif(p_payload->>'discount_percent', ''), '0')::numeric,
      discount_fixed = coalesce(nullif(p_payload->>'discount_fixed', ''), '0')::numeric,
      surcharge_percent = coalesce(nullif(p_payload->>'surcharge_percent', ''), '0')::numeric,
      surcharge_fixed = coalesce(nullif(p_payload->>'surcharge_fixed', ''), '0')::numeric,
      minimum_margin = coalesce(nullif(p_payload->>'minimum_margin', ''), '0')::numeric,
      updated_at = now()
    where id = p_quote_id returning * into v_quote;
    delete from public.quote_items where quote_id = p_quote_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.quote_items(
      quote_id, product_id, description, quantity, unit, unit_price, line_total, sort_order, minimum_price, width, height, dimension_unit, area_m2,
      price_per_m2, discount_percent, discount_fixed, discount, surcharge_percent, surcharge_fixed, taxable, tax_rate, tax_amount,
      unit_cost, labor_unit_cost, installation_unit_cost, cost_total, profit_total, margin_percent, markup_percent, requires_production, specifications, internal_notes
    ) values (
      v_quote.id, nullif(v_item->>'product_id', '')::uuid, btrim(v_item->>'description'), coalesce(nullif(v_item->>'quantity', ''), '0')::numeric,
      coalesce(nullif(v_item->>'unit', ''), 'unidad'), coalesce(nullif(v_item->>'unit_price', ''), '0')::numeric, coalesce(nullif(v_item->>'line_total', ''), '0')::numeric,
      coalesce(nullif(v_item->>'sort_order', ''), '0')::int, coalesce(nullif(v_item->>'minimum_price', ''), '0')::numeric, nullif(v_item->>'width', '')::numeric,
      nullif(v_item->>'height', '')::numeric, coalesce(nullif(v_item->>'dimension_unit', ''), 'm'), coalesce(nullif(v_item->>'area_m2', ''), '0')::numeric,
      coalesce(nullif(v_item->>'price_per_m2', ''), '0')::numeric, coalesce(nullif(v_item->>'discount_percent', ''), '0')::numeric,
      coalesce(nullif(v_item->>'discount_fixed', ''), '0')::numeric, coalesce(nullif(v_item->>'discount', ''), '0')::numeric,
      coalesce(nullif(v_item->>'surcharge_percent', ''), '0')::numeric, coalesce(nullif(v_item->>'surcharge_fixed', ''), '0')::numeric,
      coalesce((v_item->>'taxable')::boolean, true), coalesce(nullif(v_item->>'tax_rate', ''), '13')::numeric, coalesce(nullif(v_item->>'tax_amount', ''), '0')::numeric,
      coalesce(nullif(v_item->>'unit_cost', ''), '0')::numeric, coalesce(nullif(v_item->>'labor_unit_cost', ''), '0')::numeric,
      coalesce(nullif(v_item->>'installation_unit_cost', ''), '0')::numeric, coalesce(nullif(v_item->>'cost_total', ''), '0')::numeric,
      coalesce(nullif(v_item->>'profit_total', ''), '0')::numeric, coalesce(nullif(v_item->>'margin_percent', ''), '0')::numeric,
      coalesce(nullif(v_item->>'markup_percent', ''), '0')::numeric, coalesce((v_item->>'requires_production')::boolean, true),
      nullif(v_item->>'specifications', ''), nullif(v_item->>'internal_notes', '')
    );
  end loop;

  select * into v_quote from public.quotes where id = v_quote.id;
  return to_jsonb(v_quote);
end;
$$;

create or replace function public.transition_quote_status(p_quote_id uuid, p_to_status text, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q public.quotes%rowtype;
  v_from text;
  allowed boolean := false;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if not public.erp_can_operate(q.company_id) then raise exception 'Sin permiso operativo'; end if;
  if q.status = p_to_status then return to_jsonb(q); end if;
  if p_to_status in ('SENT', 'APPROVED') and not exists (select 1 from public.quote_items where quote_id = q.id) then
    raise exception 'La cotización no tiene partidas';
  end if;

  v_from := q.status;
  allowed := case v_from
    when 'DRAFT' then p_to_status in ('PREPARED', 'SENT', 'CANCELLED', 'ARCHIVED')
    when 'PREPARED' then p_to_status in ('DRAFT', 'SENT', 'CANCELLED', 'ARCHIVED')
    when 'SENT' then p_to_status in ('VIEWED', 'NEGOTIATION', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')
    when 'VIEWED' then p_to_status in ('NEGOTIATION', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')
    when 'NEGOTIATION' then p_to_status in ('SENT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')
    when 'PENDING' then p_to_status in ('NEGOTIATION', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')
    when 'APPROVED' then p_to_status in ('NEGOTIATION', 'PARTIALLY_CONVERTED', 'CONVERTED', 'CANCELLED')
    when 'REJECTED' then p_to_status in ('NEGOTIATION', 'ARCHIVED')
    when 'EXPIRED' then p_to_status in ('NEGOTIATION', 'ARCHIVED')
    when 'PARTIALLY_CONVERTED' then p_to_status in ('CONVERTED', 'CANCELLED')
    when 'CONVERTED' then p_to_status = 'ARCHIVED'
    when 'CANCELLED' then p_to_status in ('DRAFT', 'ARCHIVED')
    when 'ARCHIVED' then p_to_status = 'DRAFT'
    else false end;

  if not allowed then raise exception 'Transición de estado no permitida: % -> %', v_from, p_to_status; end if;

  update public.quotes set
    status = p_to_status,
    updated_at = now(),
    sent_at = case when p_to_status = 'SENT' then coalesce(sent_at, now()) else sent_at end,
    approved_at = case when p_to_status = 'APPROVED' then coalesce(approved_at, now()) else approved_at end,
    rejected_at = case when p_to_status = 'REJECTED' then coalesce(rejected_at, now()) else rejected_at end,
    converted_at = case when p_to_status = 'CONVERTED' then coalesce(converted_at, now()) else converted_at end,
    archived_at = case when p_to_status = 'ARCHIVED' then coalesce(archived_at, now()) else archived_at end
  where id = q.id returning * into q;

  insert into public.quote_status_history(company_id, quote_id, from_status, to_status, changed_by, comment)
  values(q.company_id, q.id, v_from, p_to_status, auth.uid(), coalesce(p_comment, 'Cambio de estado'));
  return to_jsonb(q);
end;
$$;

create or replace function public.convert_quote_to_work_order(p_quote_id uuid, p_due_at timestamptz default null, p_priority text default 'NORMAL')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q public.quotes%rowtype;
  v_id uuid;
  v_from text;
  v_number bigint;
  v_specs text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Cotización no encontrada'; end if;
  if not public.erp_can_operate(q.company_id) then raise exception 'Sin permiso operativo'; end if;
  if p_priority not in ('LOW', 'NORMAL', 'HIGH', 'URGENT') then raise exception 'Prioridad inválida'; end if;

  select id, number into v_id, v_number from public.work_orders where quote_id = q.id limit 1;
  if v_id is not null then
    if q.status <> 'CONVERTED' then
      v_from := q.status;
      update public.quotes set status = 'CONVERTED', converted_at = coalesce(converted_at, now()), updated_at = now() where id = q.id;
      insert into public.quote_status_history(company_id, quote_id, from_status, to_status, changed_by, comment)
      values(q.company_id, q.id, v_from, 'CONVERTED', auth.uid(), 'Orden de trabajo existente vinculada');
    end if;
    return jsonb_build_object('id', v_id, 'number', v_number, 'existing', true);
  end if;

  if q.status <> 'APPROVED' then raise exception 'La cotización debe estar aprobada antes de crear la orden'; end if;
  if not exists(select 1 from public.quote_items where quote_id = q.id) then raise exception 'La cotización no tiene partidas'; end if;

  select string_agg(nullif(trim(specifications), ''), E'\n' order by sort_order)
    into v_specs
  from public.quote_items
  where quote_id = q.id and nullif(trim(coalesce(specifications, '')), '') is not null;

  insert into public.work_orders(
    company_id, quote_id, client_id, status, title, due_at, total, priority,
    production_notes, internal_notes, specifications,
    installation_required, installation_address, installation_contact, installation_phone
  ) values (
    q.company_id, q.id, q.client_id, 'PENDING', coalesce(nullif(q.title, ''), 'Trabajo ' || coalesce(q.code, 'COT-' || q.number)),
    coalesce(p_due_at, case when q.promised_delivery_date is not null then q.promised_delivery_date::timestamptz + interval '17 hours' else null end),
    q.total, p_priority, q.internal_notes, q.internal_notes, v_specs,
    q.installation_required, q.installation_address, q.contact_name, q.contact_phone
  ) returning id, number into v_id, v_number;

  insert into public.work_order_items(work_order_id, product_id, description, quantity, unit, unit_price, line_total, specifications, sort_order)
  select v_id, product_id, description, quantity, unit, unit_price, line_total, specifications, sort_order
  from public.quote_items where quote_id = q.id order by sort_order;

  update public.quotes set status = 'CONVERTED', converted_at = now(), updated_at = now() where id = q.id;
  insert into public.quote_status_history(company_id, quote_id, from_status, to_status, changed_by, comment)
  values(q.company_id, q.id, 'APPROVED', 'CONVERTED', auth.uid(), 'Cotización convertida a orden de trabajo');

  return jsonb_build_object('id', v_id, 'number', v_number, 'existing', false);
end;
$$;

revoke all on function public.save_quote_quick(uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.transition_quote_status(uuid, text, text) from public, anon;
revoke all on function public.convert_quote_to_work_order(uuid, timestamptz, text) from public, anon;
grant execute on function public.save_quote_quick(uuid, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.transition_quote_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.convert_quote_to_work_order(uuid, timestamptz, text) to authenticated, service_role;
