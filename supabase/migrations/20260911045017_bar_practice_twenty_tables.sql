do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='bar_seed_practice_environment'
    and pg_get_function_identity_arguments(p.oid)='p_company_id uuid';

  if v_def is null then
    raise exception 'bar_seed_practice_environment(uuid) no existe';
  end if;

  if position('perform public.bar_bootstrap_business(p_company_id,8);' in v_def)=0 then
    raise exception 'No se encontró la configuración de 8 mesas esperada';
  end if;

  v_def:=replace(
    v_def,
    'perform public.bar_bootstrap_business(p_company_id,8);',
    'perform public.bar_bootstrap_business(p_company_id,20);'
  );

  execute v_def;
end $$;

grant execute on function public.bar_seed_practice_environment(uuid) to authenticated;
