create table if not exists public.dte_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  from_status text,
  to_status text not null,
  environment text not null,
  control_number text,
  actor_user_id uuid,
  source text not null default 'DATABASE',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dte_status_history_company_created_idx
  on public.dte_status_history(company_id, created_at desc);
create index if not exists dte_status_history_document_created_idx
  on public.dte_status_history(dte_document_id, created_at desc);

alter table public.dte_status_history enable row level security;
drop policy if exists dte_status_history_read on public.dte_status_history;
create policy dte_status_history_read on public.dte_status_history
  for select to authenticated
  using (public.erp_can_read(company_id));

revoke all on table public.dte_status_history from public, anon;
revoke insert, update, delete on table public.dte_status_history from authenticated;
grant select on table public.dte_status_history to authenticated;

create or replace function public.capture_dte_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_detail jsonb;
begin
  if tg_op = 'INSERT' then
    v_actor := coalesce(auth.uid(), new.created_by);
    v_detail := jsonb_build_object(
      'operation','INSERT',
      'financial_state',new.financial_state
    );

    insert into public.dte_status_history(
      company_id,dte_document_id,from_status,to_status,environment,
      control_number,actor_user_id,source,detail
    ) values (
      new.company_id,new.id,null,new.status,new.environment,
      new.control_number,v_actor,
      case when auth.uid() is null then 'SERVICE_ROLE' else 'AUTHENTICATED' end,
      v_detail
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    v_actor := coalesce(auth.uid(), new.created_by, old.created_by);
    v_detail := jsonb_strip_nulls(jsonb_build_object(
      'operation','STATUS_CHANGE',
      'financial_state_before',old.financial_state,
      'financial_state_after',new.financial_state,
      'mh_message_code',new.mh_message_code,
      'has_receipt_seal',new.mh_receipt_seal is not null
    ));

    insert into public.dte_status_history(
      company_id,dte_document_id,from_status,to_status,environment,
      control_number,actor_user_id,source,detail
    ) values (
      new.company_id,new.id,old.status,new.status,new.environment,
      new.control_number,v_actor,
      case when auth.uid() is null then 'SERVICE_ROLE' else 'AUTHENTICATED' end,
      v_detail
    );
  end if;
  return new;
end;
$$;

revoke all on function public.capture_dte_status_history() from public, anon, authenticated;

drop trigger if exists trg_capture_dte_status_history on public.dte_documents;
create trigger trg_capture_dte_status_history
after insert or update of status on public.dte_documents
for each row execute function public.capture_dte_status_history();
