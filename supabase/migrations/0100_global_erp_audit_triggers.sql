create or replace function public.erp_audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  v_company_id uuid;
  v_record_id text;
  v_actor uuid := auth.uid();
  v_module text;
  v_changed_fields jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  begin
    v_company_id := nullif(coalesce(v_new->>'company_id', v_old->>'company_id'), '')::uuid;
  exception when others then
    v_company_id := null;
  end;

  if v_company_id is null and tg_table_name = 'quote_items' then
    select q.company_id into v_company_id
    from public.quotes q
    where q.id = coalesce((v_new->>'quote_id')::uuid, (v_old->>'quote_id')::uuid)
    limit 1;
  end if;

  if v_company_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_record_id := coalesce(v_new->>'id', v_old->>'id', v_new->>'quote_id', v_old->>'quote_id', '');
  v_module := case tg_table_name
    when 'clients' then 'Clientes'
    when 'quotes' then 'Cotizaciones'
    when 'quote_items' then 'Cotizaciones'
    when 'work_orders' then 'Producción'
    when 'production_tasks' then 'Producción'
    when 'inventory_items' then 'Inventario'
    when 'inventory_movements' then 'Inventario'
    when 'suppliers' then 'Proveedores'
    when 'purchases' then 'Compras'
    when 'purchase_items' then 'Compras'
    when 'cash_accounts' then 'Caja'
    when 'cash_movements' then 'Caja'
    when 'expenses' then 'Finanzas'
    when 'accounts_payable' then 'Finanzas'
    when 'accounts_receivable' then 'Finanzas'
    when 'dte_documents' then 'Facturación'
    else tg_table_name
  end;

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
      into v_changed_fields
    from (
      select n.key as k
      from jsonb_each(v_new) n
      left join jsonb_each(v_old) o on o.key = n.key
      where n.value is distinct from o.value
        and n.key not in ('updated_at','last_activity_at')
    ) s;
  end if;

  insert into public.company_admin_audit(company_id, actor_user_id, target_user_id, action, detail)
  values (
    v_company_id,
    v_actor,
    null,
    case tg_op
      when 'INSERT' then 'ERP_RECORD_CREATED'
      when 'UPDATE' then 'ERP_RECORD_UPDATED'
      else 'ERP_RECORD_DELETED'
    end,
    jsonb_build_object(
      'module', v_module,
      'table', tg_table_name,
      'record_id', v_record_id,
      'operation', tg_op,
      'changed_fields', case when tg_op='UPDATE' then v_changed_fields else '[]'::jsonb end
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.erp_audit_business_change() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients','quotes','quote_items','work_orders','production_tasks',
    'inventory_items','inventory_movements','suppliers','purchases','purchase_items',
    'cash_accounts','cash_movements','expenses','accounts_payable','accounts_receivable','dte_documents'
  ] loop
    execute format('drop trigger if exists trg_erp_audit_change on public.%I', t);
    execute format('create trigger trg_erp_audit_change after insert or update or delete on public.%I for each row execute function public.erp_audit_business_change()', t);
  end loop;
end $$;
