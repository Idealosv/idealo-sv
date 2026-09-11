create or replace function public.bar_group_demo_menu_category()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_demo boolean:=false;
  v_label text:=lower(coalesce(new.display_name,''));
begin
  select coalesce(demo_mode,false)
  into v_demo
  from public.companies
  where id=new.company_id;

  if not coalesce(v_demo,false) then
    return new;
  end if;

  if v_label like '%balde%'
     or v_label like '%hielerazo%'
     or v_label like '%combo%' then
    new.category:='Combos';

  elsif new.category in ('Cervezas','Cerveza') then
    new.category:='Cervezas';

  elsif new.category in (
    'Licores','Aguardiente','Espumantes','Gin y Licores','Hard Seltzer',
    'Ron','Sangrías','Smirnoff / RTD','Tequila / Mezcal','Vinos','Vodka','Whisky'
  ) then
    new.category:='Licores';

  elsif new.category in (
    'Comida','Alitas','Hamburguesas','Hot Dogs','Nachos','Papas','Tacos',
    'Entradas','Snacks','Platos','Cocina'
  ) then
    new.category:='Comida';

  elsif new.category in (
    'Bebidas','Energizantes','Refrescos','Gaseosas','Agua','Jugos',
    'Bebidas sin alcohol','Mezcladores','Hidratantes'
  ) then
    new.category:='Bebidas';
  end if;

  new.sort_order:=case new.category
    when 'Licores' then 10
    when 'Comida' then 20
    when 'Cervezas' then 30
    when 'Bebidas' then 40
    when 'Combos' then 50
    else 60
  end;

  return new;
end;
$$;

drop trigger if exists trg_bar_group_demo_menu_category on public.bar_menu_items;
create trigger trg_bar_group_demo_menu_category
before insert or update of category, display_name
on public.bar_menu_items
for each row
execute function public.bar_group_demo_menu_category();

-- Normaliza la empresa de práctica existente sin tocar empresas reales.
update public.bar_menu_items bmi
set category=bmi.category,
    display_name=bmi.display_name
where exists (
  select 1
  from public.companies c
  where c.id=bmi.company_id
    and c.demo_mode=true
);
