create or replace function public.bar_import_super_selectos_reference_items(
  p_company_id uuid,
  p_items jsonb,
  p_checked_at date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_demo boolean;
  v_row record;
  v_sku text;
  v_product_id uuid;
  v_total integer:=0;
  v_with_price integer:=0;
begin
  if auth.uid() is null then raise exception 'No autenticado.'; end if;

  select demo_mode into v_demo from public.companies where id=p_company_id;
  if not found or coalesce(v_demo,false)=false then
    raise exception 'El catálogo de referencia de Super Selectos solo se carga en la empresa de práctica.';
  end if;
  if not public.erp_can_admin(p_company_id)
     and not public.bar_has_permission(p_company_id,'admin.manage') then
    raise exception 'Solo Propietario o Gerente puede actualizar el catálogo de referencia.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'p_items debe ser un arreglo JSON.';
  end if;

  for v_row in
    select * from jsonb_to_recordset(p_items)
      as x(category text,name text,price numeric,source_category text,source_url text)
  loop
    if nullif(trim(v_row.name),'') is null then continue; end if;
    v_sku := 'SS-' || upper(substr(md5(coalesce(v_row.category,'Otros') || '|' || trim(v_row.name)),1,12));

    select id into v_product_id
    from public.finished_products
    where company_id=p_company_id and sku=v_sku
    order by created_at limit 1;

    if v_product_id is null then
      insert into public.finished_products(
        company_id,name,category,subcategory,description,short_description,technical_description,
        unit,sale_price,cost_estimate,minimum_price,active,requires_production,affects_inventory,
        status,tags,internal_notes,sku
      ) values (
        p_company_id,trim(v_row.name),coalesce(nullif(v_row.category,''),'Otros'),'BAR',
        'Referencia del catálogo público de Súper Selectos El Salvador. No está activa en la Carta del bar.',
        'Catálogo Super Selectos · '||coalesce(nullif(v_row.category,''),'Otros'),
        'Fuente pública consultada: '||coalesce(nullif(v_row.source_url,''),'https://www.superselectos.com/'),
        'unidad',0,coalesce(v_row.price,0),0,true,false,false,'ACTIVE',
        array['bar','super-selectos','catalogo-referencia','alcohol'],
        case when v_row.price is null then
          'Referencia pública Súper Selectos · consultado '||p_checked_at::text||' · precio no verificado · NO usar como precio de venta.'
        else
          'Referencia pública Súper Selectos · consultado '||p_checked_at::text||' · precio de referencia supermercado $'||to_char(v_row.price,'FM999999990.00')||' · puede variar por sala/promoción · NO usar como precio de venta.'
        end,
        v_sku
      ) returning id into v_product_id;
    else
      update public.finished_products
      set name=trim(v_row.name),category=coalesce(nullif(v_row.category,''),'Otros'),subcategory='BAR',
          description='Referencia del catálogo público de Súper Selectos El Salvador. No está activa en la Carta del bar.',
          short_description='Catálogo Super Selectos · '||coalesce(nullif(v_row.category,''),'Otros'),
          technical_description='Fuente pública consultada: '||coalesce(nullif(v_row.source_url,''),'https://www.superselectos.com/'),
          cost_estimate=coalesce(v_row.price,0),active=true,requires_production=false,affects_inventory=false,status='ACTIVE',
          tags=array['bar','super-selectos','catalogo-referencia','alcohol'],
          internal_notes=case when v_row.price is null then
            'Referencia pública Súper Selectos · consultado '||p_checked_at::text||' · precio no verificado · NO usar como precio de venta.'
          else
            'Referencia pública Súper Selectos · consultado '||p_checked_at::text||' · precio de referencia supermercado $'||to_char(v_row.price,'FM999999990.00')||' · puede variar por sala/promoción · NO usar como precio de venta.'
          end,
          updated_at=now()
      where id=v_product_id;
    end if;

    v_total:=v_total+1;
    if v_row.price is not null then v_with_price:=v_with_price+1; end if;
  end loop;

  return jsonb_build_object(
    'source','Súper Selectos El Salvador',
    'checked_at',p_checked_at,
    'reference_items',v_total,
    'items_with_reference_price',v_with_price
  );
end;
$$;

revoke all on function public.bar_import_super_selectos_reference_items(uuid,jsonb,date) from public, anon;
grant execute on function public.bar_import_super_selectos_reference_items(uuid,jsonb,date) to authenticated;
