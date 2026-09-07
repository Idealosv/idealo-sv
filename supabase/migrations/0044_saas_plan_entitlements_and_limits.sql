update public.saas_plans set max_users=5, updated_at=now() where code='PRO';

delete from public.saas_plan_modules;

insert into public.saas_plan_modules(plan_id,module_id,enabled)
select p.id,m.id,true
from public.saas_plans p
cross join public.saas_modules m
where
 (p.code='BASIC' and m.code in ('DASHBOARD','CLIENTS','QUOTES','PRODUCTION','INVENTORY','SUPPLIERS','PURCHASES','CASH','REPORTS','SECURITY','USERS'))
 or (p.code='PRO' and m.code in ('DASHBOARD','CLIENTS','QUOTES','PRODUCTION','INVENTORY','SUPPLIERS','PURCHASES','CASH','REPORTS','SECURITY','USERS','DTE','AI'))
 or (p.code='BUSINESS' and m.code in ('DASHBOARD','CLIENTS','QUOTES','PRODUCTION','INVENTORY','SUPPLIERS','PURCHASES','CASH','REPORTS','SECURITY','USERS','DTE','AI'))
on conflict (plan_id,module_id) do update set enabled=excluded.enabled;

create or replace function public.enforce_saas_company_user_limit()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_status text;
  v_max_users integer;
  v_count integer;
begin
  select s.status,p.max_users into v_status,v_max_users
  from public.saas_company_subscriptions s
  join public.saas_plans p on p.id=s.plan_id
  where s.company_id=new.company_id;

  if v_status is null then
    select count(*) into v_count from public.company_members where company_id=new.company_id;
    if v_count=0 and new.role='owner' then return new; end if;
    raise exception 'La empresa no tiene una membresía configurada.' using errcode='P0001';
  end if;

  if v_status in ('suspended','cancelled') then
    raise exception 'La membresía está suspendida o cancelada.' using errcode='P0001';
  end if;

  select count(*) into v_count from public.company_members where company_id=new.company_id;
  if v_max_users is not null and v_count>=v_max_users then
    raise exception 'Se alcanzó el máximo de % usuarios permitido por el plan.',v_max_users using errcode='P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_saas_company_user_limit() from public,anon,authenticated;

drop trigger if exists trg_enforce_saas_company_user_limit on public.company_members;
create trigger trg_enforce_saas_company_user_limit
before insert on public.company_members
for each row execute function public.enforce_saas_company_user_limit();
