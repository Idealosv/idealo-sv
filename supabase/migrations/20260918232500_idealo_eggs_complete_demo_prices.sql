-- IDEALO Eggs: completar precios demostrativos en todas las clasificaciones activas.
create or replace function public.egg_complete_demo_prices(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path='public'
as $$
declare v_demo boolean; v_count integer:=0; r record; v_price numeric;
begin
  if not public.egg_company_member(p_company_id) then raise exception 'Sin acceso a la empresa.'; end if;
  if public.egg_effective_role(p_company_id) not in ('OWNER','MANAGER') then raise exception 'Solo propietario o gerente puede completar precios demo.'; end if;
  select demo_mode into v_demo from public.companies where id=p_company_id;
  if coalesce(v_demo,false)=false then raise exception 'Solo disponible en empresas DEMO/desarrollo.'; end if;

  for r in
    select g.id,g.code from public.egg_grades g
    where g.company_id=p_company_id and g.active=true
      and not exists (
        select 1 from public.egg_price_rules pr
        where pr.company_id=p_company_id and pr.grade_id=g.id and pr.customer_id is null and pr.active=true
      )
    order by g.sort_order
  loop
    v_price:=case r.code
      when 'JUMBO' then 5.75
      when 'XL' then 5.35
      when 'L' then 4.85
      when 'M' then 4.35
      when 'S' then 3.85
      when 'SECOND' then 3.25
      else 4.00
    end;
    insert into public.egg_price_rules(company_id,grade_id,presentation,eggs_per_unit,min_units,unit_price,notes,created_by)
    values(p_company_id,r.id,'Bandeja',30,1,v_price,'DEMO_COMERCIAL_EGGS',auth.uid());
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.egg_complete_demo_prices(uuid) to authenticated,service_role;
