create or replace function public.refresh_client_commercial_tasks(p_company_id uuid)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare affected integer := 0;
begin
  if not public.is_company_member(p_company_id) then raise exception 'not authorized'; end if;

  insert into public.client_commercial_tasks(company_id,client_id,task_type,priority,title,description,due_at,source_key)
  select i.company_id,i.client_id,'COLLECTION','CRITICAL','Cobrar saldo vencido','Saldo vencido: $' || round(i.overdue_balance,2)::text, now(), 'OVERDUE'
  from public.client_commercial_intelligence i
  where i.company_id=p_company_id and i.client_id is not null and i.overdue_balance>0
  on conflict(company_id,client_id,source_key) do update set priority='CRITICAL',title=excluded.title,description=excluded.description,due_at=excluded.due_at,status=case when client_commercial_tasks.status='DONE' then 'DONE' else 'OPEN' end,updated_at=now();
  get diagnostics affected = row_count;

  insert into public.client_commercial_tasks(company_id,client_id,task_type,priority,title,description,due_at,source_key)
  select i.company_id,i.client_id,'REACTIVATION','HIGH','Reactivar cliente',coalesce(i.recommendation,'Cliente con baja actividad comercial.'), now(), 'INACTIVE'
  from public.client_commercial_intelligence i
  where i.company_id=p_company_id and i.client_id is not null and i.commercial_segment='INACTIVO'
  on conflict(company_id,client_id,source_key) do update set priority='HIGH',description=excluded.description,due_at=excluded.due_at,status=case when client_commercial_tasks.status='DONE' then 'DONE' else 'OPEN' end,updated_at=now();

  insert into public.client_commercial_tasks(company_id,client_id,task_type,priority,title,description,due_at,source_key)
  select ci.company_id,ci.client_id,'FOLLOW_UP','HIGH','Seguimiento comercial vencido',coalesce(ci.subject,ci.details,'Seguimiento pendiente'), ci.next_follow_up_at,'FOLLOWUP:'||ci.id::text
  from public.client_interactions ci
  where ci.company_id=p_company_id and ci.client_id is not null and ci.next_follow_up_at is not null and ci.next_follow_up_at<=now()
  on conflict(company_id,client_id,source_key) do update set due_at=excluded.due_at,description=excluded.description,updated_at=now();

  insert into public.client_commercial_tasks(company_id,client_id,task_type,priority,title,description,due_at,source_key)
  select q.company_id,q.client_id,'QUOTE','MEDIUM','Dar seguimiento a cotización','Cotización COT-'||q.number||' por $'||round(q.total,2)::text,coalesce(q.valid_until::timestamptz, q.created_at + interval '3 days'), 'QUOTE:'||q.id::text
  from public.quotes q
  where q.company_id=p_company_id and q.client_id is not null and q.status in ('SENT','APPROVED') and q.created_at < now()-interval '2 days'
  on conflict(company_id,client_id,source_key) do update set description=excluded.description,due_at=excluded.due_at,updated_at=now();

  return affected;
end
$function$;
