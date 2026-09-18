-- Restringe el hook de IDEALO BAR al entorno de práctica.
-- Antes se ejecutaba para cualquier empresa demo al actualizar demo_seeded_at,
-- lo que rompía la creación de demos de otros verticales (Publicidad, Huevos, etc.).

create or replace function public.bar_restore_integrated_catalog_after_seed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.demo_mode = true
     and new.demo_seeded_at is distinct from old.demo_seeded_at
     and (
       new.slug = 'idealo-bar-practica'
       or new.demo_label = 'MODO PRÁCTICA'
     )
  then
    perform public.bar_integrate_reference_products(new.id);
  end if;

  return new;
end;
$function$;
