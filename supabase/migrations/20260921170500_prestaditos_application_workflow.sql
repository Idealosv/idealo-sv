-- PRESTADITO$ / IDEALO SV
-- Flujo controlado de solicitudes de inversión.
-- Conserva el monto/plazo solicitado y separa lo aprobado por la empresa.

alter table public.inv_applications
  add column if not exists application_code text,
  add column if not exists approved_amount numeric(14,2),
  add column if not exists approved_term_months integer,
  add column if not exists decision_notes text not null default '',
  add column if not exists decision_by uuid,
  add column if not exists decision_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz;

update public.inv_applications
set application_code =
  'SOL-' || to_char(created_at at time zone 'America/El_Salvador','YYYYMMDD') || '-' ||
  upper(substr(replace(id::text,'-',''),1,6))
where coalesce(trim(application_code),'')='';

create unique index if not exists inv_applications_company_code_uidx
  on public.inv_applications(company_id,application_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='inv_applications_approved_amount_positive'
      and conrelid='public.inv_applications'::regclass
  ) then
    alter table public.inv_applications
      add constraint inv_applications_approved_amount_positive
      check(approved_amount is null or approved_amount>0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='inv_applications_approved_term_positive'
      and conrelid='public.inv_applications'::regclass
  ) then
    alter table public.inv_applications
      add constraint inv_applications_approved_term_positive
      check(approved_term_months is null or approved_term_months>0);
  end if;
end $$;

create table if not exists public.inv_application_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  application_id uuid not null references public.inv_applications(id) on delete cascade,
  investor_id uuid not null references public.inv_investors(id) on delete cascade,
  status_from text,
  status_to text not null,
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists inv_application_events_company_idx
  on public.inv_application_events(company_id,created_at desc);
create index if not exists inv_application_events_application_idx
  on public.inv_application_events(application_id,created_at);

create or replace function public.inv_company_can_submit(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select public.inv_company_member(p_company_id)
    and exists(
      select 1
      from public.company_members cm
      where cm.company_id=p_company_id
        and cm.user_id=auth.uid()
        and lower(coalesce(cm.role,'')) in ('owner','admin','staff')
    )
$$;

create or replace function public.inv_company_can_review(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select public.inv_company_member(p_company_id)
    and exists(
      select 1
      from public.company_members cm
      where cm.company_id=p_company_id
        and cm.user_id=auth.uid()
        and lower(coalesce(cm.role,'')) in ('owner','admin')
    )
$$;

revoke all on function public.inv_company_can_submit(uuid) from public;
revoke all on function public.inv_company_can_review(uuid) from public;
grant execute on function public.inv_company_can_submit(uuid) to authenticated,service_role;
grant execute on function public.inv_company_can_review(uuid) to authenticated,service_role;

create or replace function public.inv_prepare_application()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  if coalesce(trim(new.application_code),'')='' then
    new.application_code :=
      'SOL-' || to_char(coalesce(new.created_at,now()) at time zone 'America/El_Salvador','YYYYMMDD') || '-' ||
      upper(substr(replace(new.id::text,'-',''),1,6));
  end if;

  if not exists(
    select 1
    from public.inv_investors i
    where i.id=new.investor_id
      and i.company_id=new.company_id
      and i.status='ACTIVE'
  ) then
    raise exception 'La solicitud debe pertenecer a un inversionista activo de la misma empresa.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inv_prepare_application on public.inv_applications;
create trigger trg_inv_prepare_application
before insert on public.inv_applications
for each row execute function public.inv_prepare_application();

create or replace function public.inv_guard_application_review()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_role text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if auth.uid() is not null then
    select lower(coalesce(cm.role,''))
      into v_role
    from public.company_members cm
    where cm.company_id=old.company_id
      and cm.user_id=auth.uid()
    limit 1;

    if coalesce(v_role,'') not in ('owner','admin') then
      raise exception 'Solo propietario o administrador puede cambiar el estado de una solicitud.';
    end if;
  end if;

  if not (
    (old.status='PENDING' and new.status='REVIEW') or
    (old.status='REVIEW' and new.status in ('APPROVED','REJECTED')) or
    (old.status='APPROVED' and new.status='SIGNATURE') or
    (old.status='SIGNATURE' and new.status='FUNDS_RECEIVED') or
    (old.status='FUNDS_RECEIVED' and new.status='ACTIVE')
  ) then
    raise exception 'Transición de solicitud no permitida: % -> %.',old.status,new.status;
  end if;

  if new.status='APPROVED' then
    new.approved_amount:=coalesce(new.approved_amount,new.requested_amount);
    new.approved_term_months:=coalesce(new.approved_term_months,new.requested_term_months);
    if new.approved_amount<=0 or new.approved_term_months<=0 then
      raise exception 'Monto y plazo aprobados deben ser mayores que cero.';
    end if;
    new.approved_at:=coalesce(new.approved_at,now());
    new.decision_at:=coalesce(new.decision_at,now());
    new.decision_by:=coalesce(new.decision_by,auth.uid());
  elsif new.status='REJECTED' then
    if coalesce(trim(new.decision_notes),'')='' then
      raise exception 'Indicá el motivo del rechazo.';
    end if;
    new.rejected_at:=coalesce(new.rejected_at,now());
    new.decision_at:=coalesce(new.decision_at,now());
    new.decision_by:=coalesce(new.decision_by,auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inv_guard_application_review on public.inv_applications;
create trigger trg_inv_guard_application_review
before update of status on public.inv_applications
for each row execute function public.inv_guard_application_review();

create or replace function public.inv_log_application_event()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  if tg_op='INSERT' then
    insert into public.inv_application_events(
      company_id,application_id,investor_id,status_from,status_to,note,payload,created_by
    )
    values(
      new.company_id,new.id,new.investor_id,null,new.status,'Solicitud registrada',
      jsonb_build_object(
        'requested_amount',new.requested_amount,
        'requested_term_months',new.requested_term_months,
        'payment_place',new.payment_place,
        'payment_method',new.payment_method
      ),
      auth.uid()
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.inv_application_events(
      company_id,application_id,investor_id,status_from,status_to,note,payload,created_by
    )
    values(
      new.company_id,new.id,new.investor_id,old.status,new.status,
      case
        when new.status in ('APPROVED','REJECTED') then coalesce(new.decision_notes,'')
        else ''
      end,
      jsonb_build_object(
        'approved_amount',new.approved_amount,
        'approved_term_months',new.approved_term_months
      ),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inv_log_application_event_insert on public.inv_applications;
create trigger trg_inv_log_application_event_insert
after insert on public.inv_applications
for each row execute function public.inv_log_application_event();

drop trigger if exists trg_inv_log_application_event_status on public.inv_applications;
create trigger trg_inv_log_application_event_status
after update of status on public.inv_applications
for each row execute function public.inv_log_application_event();

create or replace function public.inv_transition_application(
  p_application_id uuid,
  p_target_status text,
  p_note text default '',
  p_approved_amount numeric default null,
  p_approved_term_months integer default null
)
returns public.inv_applications
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_app public.inv_applications%rowtype;
  v_result public.inv_applications%rowtype;
begin
  select * into v_app
  from public.inv_applications
  where id=p_application_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;

  if not public.inv_company_can_review(v_app.company_id) then
    raise exception 'Solo propietario o administrador puede revisar solicitudes.';
  end if;

  update public.inv_applications
  set
    status=upper(trim(p_target_status)),
    decision_notes=case
      when upper(trim(p_target_status)) in ('APPROVED','REJECTED') then coalesce(trim(p_note),'')
      else decision_notes
    end,
    approved_amount=case
      when upper(trim(p_target_status))='APPROVED' then coalesce(p_approved_amount,v_app.requested_amount)
      else approved_amount
    end,
    approved_term_months=case
      when upper(trim(p_target_status))='APPROVED' then coalesce(p_approved_term_months,v_app.requested_term_months)
      else approved_term_months
    end,
    reviewed_at=now(),
    reviewed_by=auth.uid(),
    updated_at=now()
  where id=p_application_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.inv_transition_application(uuid,text,text,numeric,integer) from public;
grant execute on function public.inv_transition_application(uuid,text,text,numeric,integer) to authenticated,service_role;

alter table public.inv_application_events enable row level security;

drop policy if exists inv_application_events_select on public.inv_application_events;
create policy inv_application_events_select on public.inv_application_events
for select to authenticated
using(public.inv_company_member(company_id));

revoke insert,update,delete on public.inv_application_events from authenticated;
grant select on public.inv_application_events to authenticated;
grant all privileges on public.inv_application_events to service_role;

drop policy if exists inv_member_insert on public.inv_applications;
drop policy if exists inv_member_update on public.inv_applications;
drop policy if exists inv_member_delete on public.inv_applications;

create policy inv_application_insert on public.inv_applications
for insert to authenticated
with check(public.inv_company_can_submit(company_id));

create policy inv_application_update on public.inv_applications
for update to authenticated
using(public.inv_company_can_review(company_id))
with check(public.inv_company_can_review(company_id));

-- Las solicitudes financieras no se eliminan desde el ERP.
-- Se conservan para auditoría y trazabilidad.
