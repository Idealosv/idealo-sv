-- IDEALO SV · Integridad y auditoría completa de Clientes 360

create unique index if not exists uq_client_contacts_primary
  on public.client_contacts(client_id) where is_primary;
create unique index if not exists uq_client_addresses_primary
  on public.client_addresses(client_id) where is_primary;

create or replace function public.audit_client_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare k text; ov jsonb; nv jsonb;
begin
  if tg_op='UPDATE' then
    for k in select key from jsonb_each(to_jsonb(new)) loop
      ov:=to_jsonb(old)->k; nv:=to_jsonb(new)->k;
      if ov is distinct from nv and k not in('updated_at') then
        insert into public.client_audit_log(company_id,client_id,action,field_name,old_value,new_value,actor_id)
        values(new.company_id,new.id,'UPDATE',k,ov,nv,auth.uid());
      end if;
    end loop;
    return new;
  elsif tg_op='INSERT' then
    insert into public.client_audit_log(company_id,client_id,action,new_value,actor_id)
    values(new.company_id,new.id,'CREATE',to_jsonb(new),auth.uid());
    return new;
  end if;
  return old;
end $$;
revoke all on function public.audit_client_changes() from public, anon, authenticated;

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
  before_value := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_value := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  insert into public.client_audit_log(company_id,client_id,action,field_name,old_value,new_value,actor_id)
  values(row_company,row_client,tg_op,tg_table_name,before_value,after_value,auth.uid());
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.audit_client360_related() from public, anon, authenticated;

drop trigger if exists trg_client_contacts_audit on public.client_contacts;
create trigger trg_client_contacts_audit after insert or update or delete on public.client_contacts
for each row execute function public.audit_client360_related();

drop trigger if exists trg_client_addresses_audit on public.client_addresses;
create trigger trg_client_addresses_audit after insert or update or delete on public.client_addresses
for each row execute function public.audit_client360_related();

drop trigger if exists trg_client_interactions_audit on public.client_interactions;
create trigger trg_client_interactions_audit after insert or update or delete on public.client_interactions
for each row execute function public.audit_client360_related();

drop trigger if exists trg_client_credit_profiles_audit on public.client_credit_profiles;
create trigger trg_client_credit_profiles_audit after insert or update or delete on public.client_credit_profiles
for each row execute function public.audit_client360_related();

drop policy if exists client_audit_log_member_all on public.client_audit_log;
drop policy if exists client_audit_log_member_select on public.client_audit_log;
create policy client_audit_log_member_select on public.client_audit_log
for select to authenticated using (public.is_company_member(company_id));
revoke insert,update,delete on public.client_audit_log from authenticated;
grant select on public.client_audit_log to authenticated;
