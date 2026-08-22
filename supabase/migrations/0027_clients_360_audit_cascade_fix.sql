create or replace function public.audit_client360_related()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_company uuid;
  row_client uuid;
  before_value jsonb;
  after_value jsonb;
begin
  row_company := case when tg_op='DELETE' then old.company_id else new.company_id end;
  row_client := case when tg_op='DELETE' then old.client_id else new.client_id end;

  -- En borrados en cascada, el cliente padre puede haber desaparecido antes
  -- de que se ejecuten los triggers AFTER DELETE de sus entidades relacionadas.
  if tg_op='DELETE' and not exists(select 1 from public.clients c where c.id=row_client) then
    return old;
  end if;

  before_value := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_value := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  insert into public.client_audit_log(company_id,client_id,action,field_name,old_value,new_value,actor_id)
  values(row_company,row_client,tg_op,tg_table_name,before_value,after_value,auth.uid());
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.audit_client360_related() from public, anon, authenticated;
