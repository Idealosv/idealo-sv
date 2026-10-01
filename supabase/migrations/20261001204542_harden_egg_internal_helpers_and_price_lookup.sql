-- IDEALO Eggs security hardening.
-- Applied to Supabase as migration 20261001204542.

create or replace function public.egg_resolve_price(
  p_company_id uuid,
  p_customer_id uuid,
  p_grade_id uuid,
  p_presentation text,
  p_quantity_units numeric,
  p_eggs_per_unit integer
)
returns numeric
language sql
stable
security definer
set search_path='public'
as $$
  select r.unit_price
  from public.egg_price_rules r
  where (
      public.egg_company_member(p_company_id)
      or coalesce(auth.jwt()->>'role','')='service_role'
    )
    and r.company_id=p_company_id
    and r.grade_id=p_grade_id
    and r.active=true
    and lower(r.presentation)=lower(coalesce(p_presentation,'Bandeja'))
    and r.eggs_per_unit=coalesce(p_eggs_per_unit,r.eggs_per_unit)
    and coalesce(p_quantity_units,0)>=r.min_units
    and (r.max_units is null or coalesce(p_quantity_units,0)<=r.max_units)
    and (r.customer_id is null or r.customer_id=p_customer_id)
    and (r.valid_from is null or r.valid_from<=current_date)
    and (r.valid_until is null or r.valid_until>=current_date)
  order by (r.customer_id is not null) desc,r.min_units desc,r.created_at desc
  limit 1
$$;

revoke execute on function public.egg_grade_for_weight(uuid,numeric) from authenticated;
revoke execute on function public.egg_module_enabled(uuid,text) from authenticated;

grant execute on function public.egg_resolve_price(uuid,uuid,uuid,text,numeric,integer) to authenticated, service_role;
