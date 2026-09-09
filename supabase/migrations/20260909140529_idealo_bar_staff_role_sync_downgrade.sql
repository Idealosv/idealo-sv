-- IDEALO BAR · sincroniza cambios del rol central hacia el rol operativo del bar.

create or replace function public.bar_sync_company_member_to_staff()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
 select nullif(trim(full_name),'') into v_name from public.profiles where id=new.user_id;
 insert into public.bar_staff_assignments(company_id,user_id,display_name,bar_role,active,created_by,updated_by)
 values(new.company_id,new.user_id,coalesce(v_name,'Usuario del bar'),case new.role when 'owner' then 'owner' when 'admin' then 'manager' else 'waiter' end,new.role<>'viewer',auth.uid(),auth.uid())
 on conflict(company_id,user_id) do update set
   display_name=case when public.bar_staff_assignments.display_name in ('','Usuario del bar') then excluded.display_name else public.bar_staff_assignments.display_name end,
   bar_role=case
     when new.role='owner' then 'owner'
     when new.role='admin' and public.bar_staff_assignments.bar_role='owner' then 'manager'
     when new.role in ('staff','viewer') and public.bar_staff_assignments.bar_role in ('owner','manager') then 'waiter'
     else public.bar_staff_assignments.bar_role end,
   active=case when new.role='viewer' then false else public.bar_staff_assignments.active end,
   updated_at=now();
 return new;
end;$$;

drop trigger if exists trg_bar_sync_company_member_to_staff on public.company_members;
create trigger trg_bar_sync_company_member_to_staff after insert or update of role on public.company_members for each row execute function public.bar_sync_company_member_to_staff();

-- Normaliza una vez los casos existentes para que un downgrade central nunca conserve privilegios altos en el bar.
update public.bar_staff_assignments s set
 bar_role=case when m.role='owner' then 'owner' when m.role='admin' and s.bar_role='owner' then 'manager' when m.role in ('staff','viewer') and s.bar_role in ('owner','manager') then 'waiter' else s.bar_role end,
 active=case when m.role='viewer' then false else s.active end,
 updated_at=now()
from public.company_members m where m.company_id=s.company_id and m.user_id=s.user_id;
