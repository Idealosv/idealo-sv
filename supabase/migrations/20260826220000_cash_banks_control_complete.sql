-- IDEALO SV · Caja/Bancos completo: transferencias, ajustes, cierres y conciliaciones cerradas

alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check
check (source_type in ('MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','PURCHASE','EXPENSE','CASH_TRANSFER','CASH_ADJUSTMENT','OTHER'));

create table if not exists public.cash_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  to_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount>0),
  transfer_key uuid not null default gen_random_uuid(),
  reference text,
  notes text,
  created_by uuid default auth.uid(),
  transferred_at timestamptz not null default now(),
  unique(company_id,transfer_key),
  check (from_account_id<>to_account_id)
);
create index if not exists cash_transfers_company_idx on public.cash_transfers(company_id,transferred_at desc);
alter table public.cash_transfers enable row level security;
drop policy if exists "members manage cash transfers" on public.cash_transfers;
create policy "members manage cash transfers" on public.cash_transfers for select to authenticated using (public.is_company_member(company_id));
grant select on public.cash_transfers to authenticated;

create unique index if not exists cash_transfer_movements_uidx
on public.cash_movements(company_id,source_type,source_id,cash_account_id,movement_type)
where source_type='CASH_TRANSFER' and source_id is not null;

create or replace function public.register_cash_transfer(
  p_from uuid,p_to uuid,p_amount numeric,p_reference text default null,p_notes text default null,p_transfer_key uuid default gen_random_uuid()
) returns uuid language plpgsql security invoker set search_path='public' as $$
declare f public.cash_accounts%rowtype; t public.cash_accounts%rowtype; v_existing uuid; v_id uuid; v_balance numeric(12,2);
begin
  if p_from=p_to then raise exception 'La cuenta de origen y destino deben ser diferentes'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El monto de transferencia debe ser mayor a cero'; end if;
  select id into v_existing from public.cash_transfers where transfer_key=p_transfer_key limit 1;
  if v_existing is not null then return v_existing; end if;
  select * into f from public.cash_accounts where id=p_from and active=true for update;
  select * into t from public.cash_accounts where id=p_to and active=true for update;
  if f.id is null or t.id is null then raise exception 'Cuenta de origen o destino no disponible'; end if;
  if f.company_id<>t.company_id then raise exception 'Las cuentas deben pertenecer a la misma empresa'; end if;
  if not public.is_company_member(f.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  select current_balance into v_balance from public.cash_account_balances where cash_account_id=f.id;
  if coalesce(v_balance,0)+0.001<p_amount then raise exception 'Saldo insuficiente en la cuenta de origen'; end if;
  insert into public.cash_transfers(company_id,from_account_id,to_account_id,amount,transfer_key,reference,notes)
  values(f.company_id,f.id,t.id,p_amount,p_transfer_key,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
  insert into public.cash_movements(company_id,cash_account_id,movement_type,source_type,source_id,concept,amount,reference,notes)
  values
    (f.company_id,f.id,'TRANSFER_OUT','CASH_TRANSFER',v_id,'Transferencia a '||t.name,p_amount,p_reference,p_notes),
    (f.company_id,t.id,'TRANSFER_IN','CASH_TRANSFER',v_id,'Transferencia desde '||f.name,p_amount,p_reference,p_notes);
  return v_id;
end; $$;
revoke all on function public.register_cash_transfer(uuid,uuid,numeric,text,text,uuid) from public,anon;
grant execute on function public.register_cash_transfer(uuid,uuid,numeric,text,text,uuid) to authenticated;

create table if not exists public.cash_adjustments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  direction text not null check(direction in ('INCREASE','DECREASE')),
  amount numeric(12,2) not null check(amount>0), reason text not null check(char_length(trim(reason))>=4),
  adjustment_key uuid not null default gen_random_uuid(), created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  unique(company_id,adjustment_key)
);
alter table public.cash_adjustments enable row level security;
drop policy if exists "members manage cash adjustments" on public.cash_adjustments;
create policy "members manage cash adjustments" on public.cash_adjustments for select to authenticated using(public.is_company_member(company_id));
grant select on public.cash_adjustments to authenticated;
create unique index if not exists cash_adjustment_movement_uidx on public.cash_movements(company_id,source_type,source_id) where source_type='CASH_ADJUSTMENT' and source_id is not null;

create or replace function public.register_cash_adjustment(p_cash_account uuid,p_direction text,p_amount numeric,p_reason text,p_adjustment_key uuid default gen_random_uuid())
returns uuid language plpgsql security invoker set search_path='public' as $$
declare a public.cash_accounts%rowtype; v_id uuid; v_existing uuid; v_balance numeric(12,2); v_type text;
begin
  if p_direction not in ('INCREASE','DECREASE') then raise exception 'Dirección de ajuste inválida'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El ajuste debe ser mayor a cero'; end if;
  if char_length(trim(coalesce(p_reason,'')))<4 then raise exception 'Indicá el motivo del ajuste'; end if;
  select id into v_existing from public.cash_adjustments where adjustment_key=p_adjustment_key limit 1; if v_existing is not null then return v_existing; end if;
  select * into a from public.cash_accounts where id=p_cash_account and active=true for update;
  if not found then raise exception 'Caja o banco no disponible'; end if;
  if not public.is_company_member(a.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  select current_balance into v_balance from public.cash_account_balances where cash_account_id=a.id;
  if p_direction='DECREASE' and coalesce(v_balance,0)+0.001<p_amount then raise exception 'El ajuste dejaría saldo negativo'; end if;
  insert into public.cash_adjustments(company_id,cash_account_id,direction,amount,reason,adjustment_key)
  values(a.company_id,a.id,p_direction,p_amount,trim(p_reason),p_adjustment_key) returning id into v_id;
  v_type:=case when p_direction='INCREASE' then 'INCOME' else 'EXPENSE' end;
  insert into public.cash_movements(company_id,cash_account_id,movement_type,source_type,source_id,concept,amount,notes)
  values(a.company_id,a.id,v_type,'CASH_ADJUSTMENT',v_id,'Ajuste controlado de caja',p_amount,trim(p_reason));
  return v_id;
end; $$;
revoke all on function public.register_cash_adjustment(uuid,text,numeric,text,uuid) from public,anon;
grant execute on function public.register_cash_adjustment(uuid,text,numeric,text,uuid) to authenticated;

create table if not exists public.cash_daily_closures (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 cash_account_id uuid not null references public.cash_accounts(id) on delete restrict, closure_date date not null,
 opening_balance numeric(12,2) not null, income_total numeric(12,2) not null, expense_total numeric(12,2) not null,
 closing_balance numeric(12,2) not null, movement_count integer not null, notes text,
 closed_by uuid default auth.uid(), closed_at timestamptz not null default now(), unique(company_id,cash_account_id,closure_date)
);
alter table public.cash_daily_closures enable row level security;
drop policy if exists "members view cash daily closures" on public.cash_daily_closures;
create policy "members view cash daily closures" on public.cash_daily_closures for select to authenticated using(public.is_company_member(company_id));
grant select on public.cash_daily_closures to authenticated;

create or replace function public.close_cash_day(p_cash_account uuid,p_date date default current_date,p_notes text default null)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare a public.cash_accounts%rowtype; v_id uuid; v_open numeric(12,2); v_in numeric(12,2); v_out numeric(12,2); v_close numeric(12,2); v_count integer;
begin
 select * into a from public.cash_accounts where id=p_cash_account; if not found then raise exception 'Cuenta no encontrada'; end if;
 if not public.is_company_member(a.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
 select round((a.opening_balance+coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount when movement_type in ('EXPENSE','TRANSFER_OUT') then -amount else 0 end),0))::numeric,2)
 into v_open from public.cash_movements where cash_account_id=a.id and company_id=a.company_id and movement_date::date<p_date;
 v_open:=coalesce(v_open,a.opening_balance);
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0),count(*)
 into v_in,v_out,v_count from public.cash_movements where cash_account_id=a.id and company_id=a.company_id and movement_date::date=p_date;
 v_close:=round((v_open+v_in-v_out)::numeric,2);
 insert into public.cash_daily_closures(company_id,cash_account_id,closure_date,opening_balance,income_total,expense_total,closing_balance,movement_count,notes)
 values(a.company_id,a.id,p_date,v_open,v_in,v_out,v_close,v_count,nullif(trim(coalesce(p_notes,'')),''))
 on conflict(company_id,cash_account_id,closure_date) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.cash_daily_closures where company_id=a.company_id and cash_account_id=a.id and closure_date=p_date; end if;
 return v_id;
end; $$;
revoke all on function public.close_cash_day(uuid,date,text) from public,anon;
grant execute on function public.close_cash_day(uuid,date,text) to authenticated;

-- Conciliación cerrada e inmutable.
alter table public.cash_reconciliations drop constraint if exists cash_reconciliations_status_check;
alter table public.cash_reconciliations add constraint cash_reconciliations_status_check check(status in ('PENDING','MATCHED','DIFFERENCE','CANCELLED','CLOSED'));
alter table public.cash_reconciliations add column if not exists closed_by uuid;
alter table public.cash_reconciliations add column if not exists closed_at timestamptz;

create or replace function public.close_cash_reconciliation(p_reconciliation uuid,p_notes text default null)
returns uuid language plpgsql security invoker set search_path='public' as $$
declare r public.cash_reconciliations%rowtype;
begin
 select * into r from public.cash_reconciliations where id=p_reconciliation for update;
 if not found then raise exception 'Conciliación no encontrada'; end if;
 if not public.is_company_member(r.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
 if r.status='CLOSED' then return r.id; end if;
 if r.status='CANCELLED' then raise exception 'Una conciliación anulada no puede cerrarse'; end if;
 if abs(r.difference)>=0.01 and char_length(trim(coalesce(p_notes,r.notes,'')))<4 then raise exception 'Explicá la diferencia antes de cerrar'; end if;
 update public.cash_reconciliations set status='CLOSED',notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes),closed_by=auth.uid(),closed_at=now(),updated_at=now() where id=r.id;
 return r.id;
end; $$;
revoke all on function public.close_cash_reconciliation(uuid,text) from public,anon;
grant execute on function public.close_cash_reconciliation(uuid,text) to authenticated;

create or replace function public.guard_closed_cash_reconciliation() returns trigger language plpgsql security invoker set search_path='public' as $$
begin
 if old.status='CLOSED' then raise exception 'La conciliación cerrada es inmutable'; end if;
 return new;
end; $$;
revoke all on function public.guard_closed_cash_reconciliation() from public,anon,authenticated;
drop trigger if exists trg_guard_closed_cash_reconciliation on public.cash_reconciliations;
create trigger trg_guard_closed_cash_reconciliation before update or delete on public.cash_reconciliations for each row execute function public.guard_closed_cash_reconciliation();
