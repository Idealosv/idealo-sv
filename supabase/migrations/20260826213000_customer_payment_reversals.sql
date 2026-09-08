-- IDEALO SV · Reversión controlada de cobros
-- Mantiene el pago original inmutable y registra una contrapartida trazable en CxC y Caja.

create table if not exists public.customer_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_id uuid not null references public.customer_payments(id) on delete restrict,
  receivable_id uuid not null references public.accounts_receivable(id) on delete restrict,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (char_length(trim(reason)) >= 4),
  reversal_key uuid not null default gen_random_uuid(),
  reversed_by uuid default auth.uid(),
  reversed_at timestamptz not null default now(),
  unique(payment_id),
  unique(company_id,reversal_key)
);

create index if not exists customer_payment_reversals_receivable_idx
  on public.customer_payment_reversals(receivable_id,reversed_at desc);

alter table public.customer_payment_reversals enable row level security;
drop policy if exists "members manage customer payment reversals" on public.customer_payment_reversals;
create policy "members manage customer payment reversals"
  on public.customer_payment_reversals for select to authenticated
  using (public.is_company_member(company_id));

grant select on public.customer_payment_reversals to authenticated;

-- Agregar origen específico para la contrapartida de Caja.
alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check
  check (source_type in ('MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','PURCHASE','EXPENSE','OTHER'));

create unique index if not exists cash_movements_customer_payment_reversal_uidx
  on public.cash_movements(company_id,source_type,source_id)
  where source_type='CUSTOMER_PAYMENT_REVERSAL' and source_id is not null;

-- El saldo CxC considera solo pagos que no han sido reversados.
create or replace function public.refresh_receivable_balance(target_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_paid numeric(12,2); v_total numeric(12,2); v_due date;
begin
  select coalesce(sum(cp.amount),0)
    into v_paid
  from public.customer_payments cp
  where cp.receivable_id=target_id
    and not exists (
      select 1 from public.customer_payment_reversals r where r.payment_id=cp.id
    );

  select amount_total,due_date into v_total,v_due
  from public.accounts_receivable where id=target_id;

  update public.accounts_receivable
  set amount_paid=v_paid,
      status=case
        when v_paid>=v_total then 'PAID'
        when v_paid>0 then 'PARTIAL'
        when v_due is not null and v_due<current_date then 'OVERDUE'
        else 'OPEN'
      end,
      updated_at=now()
  where id=target_id and status<>'CANCELLED';
end;
$$;

create or replace function public.apply_customer_payment_reversal()
returns trigger
language plpgsql
security invoker
set search_path='public'
as $$
declare p public.customer_payments%rowtype; ar public.accounts_receivable%rowtype;
begin
  select * into p from public.customer_payments where id=new.payment_id;
  if not found then raise exception 'Cobro original no encontrado'; end if;
  select * into ar from public.accounts_receivable where id=p.receivable_id;
  if not found then raise exception 'Cuenta por cobrar no encontrada'; end if;

  insert into public.cash_movements(
    company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes
  ) values (
    new.company_id,new.cash_account_id,new.reversed_at,'EXPENSE','CUSTOMER_PAYMENT_REVERSAL',new.id,
    'Reversión cobro cliente · CXC-'||ar.number,new.amount,p.reference,
    'Reversión: '||new.reason
  )
  on conflict (company_id,source_type,source_id)
    where source_type='CUSTOMER_PAYMENT_REVERSAL' and source_id is not null
  do nothing;

  perform public.refresh_receivable_balance(new.receivable_id);
  return new;
end;
$$;

revoke all on function public.apply_customer_payment_reversal() from public,anon,authenticated;
drop trigger if exists trg_apply_customer_payment_reversal on public.customer_payment_reversals;
create trigger trg_apply_customer_payment_reversal
after insert on public.customer_payment_reversals
for each row execute function public.apply_customer_payment_reversal();

create or replace function public.reverse_customer_payment(
  p_payment uuid,
  p_reason text,
  p_reversal_key uuid default gen_random_uuid()
) returns uuid
language plpgsql
security invoker
set search_path='public'
as $$
declare p public.customer_payments%rowtype; v_existing uuid; v_id uuid;
begin
  if char_length(trim(coalesce(p_reason,'')))<4 then
    raise exception 'Indicá el motivo de la reversión';
  end if;

  select id into v_existing
  from public.customer_payment_reversals
  where payment_id=p_payment or reversal_key=p_reversal_key
  limit 1;
  if v_existing is not null then return v_existing; end if;

  select * into p from public.customer_payments where id=p_payment for share;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if not public.is_company_member(p.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if p.cash_account_id is null then raise exception 'El cobro no tiene caja o banco asociado'; end if;

  insert into public.customer_payment_reversals(
    company_id,payment_id,receivable_id,cash_account_id,amount,reason,reversal_key
  ) values (
    p.company_id,p.id,p.receivable_id,p.cash_account_id,p.amount,trim(p_reason),p_reversal_key
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reverse_customer_payment(uuid,text,uuid) from public,anon;
grant execute on function public.reverse_customer_payment(uuid,text,uuid) to authenticated;
