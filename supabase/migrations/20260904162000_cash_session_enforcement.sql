-- Enforce that every cash movement belongs to an open cash-register session.

alter table public.cash_movements
  add column if not exists cash_register_session_id uuid
  references public.cash_register_sessions(id) on delete restrict;

create index if not exists cash_movements_session_idx
  on public.cash_movements(cash_register_session_id, movement_date);

create or replace function public.assign_cash_register_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
  v_session_id uuid;
begin
  select upper(coalesce(account_type,''))
    into v_account_type
  from public.cash_accounts
  where id = new.cash_account_id
    and company_id = new.company_id;

  if v_account_type in ('CASH','CAJA') then
    select s.id
      into v_session_id
    from public.cash_register_sessions s
    where s.company_id = new.company_id
      and s.cash_account_id = new.cash_account_id
      and s.status = 'OPEN'
      and s.opened_at <= coalesce(new.movement_date, now())
    order by s.opened_at desc
    limit 1;

    if v_session_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'Caja cerrada. Primero debes abrir la caja antes de registrar movimientos en efectivo.';
    end if;

    new.cash_register_session_id := v_session_id;
  else
    new.cash_register_session_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_cash_register_session on public.cash_movements;
create trigger trg_assign_cash_register_session
before insert or update of company_id, cash_account_id, movement_date
on public.cash_movements
for each row execute function public.assign_cash_register_session();

-- Backfill movements that clearly occurred inside an existing session.
update public.cash_movements m
set cash_register_session_id = (
  select cs.id
  from public.cash_register_sessions cs
  where cs.company_id = m.company_id
    and cs.cash_account_id = m.cash_account_id
    and m.movement_date >= cs.opened_at
    and (cs.closed_at is null or m.movement_date <= cs.closed_at)
  order by cs.opened_at desc
  limit 1
)
where m.cash_register_session_id is null
  and exists (
    select 1
    from public.cash_accounts a
    where a.id = m.cash_account_id
      and a.company_id = m.company_id
      and upper(coalesce(a.account_type,'')) in ('CASH','CAJA')
  )
  and exists (
    select 1
    from public.cash_register_sessions cs
    where cs.company_id = m.company_id
      and cs.cash_account_id = m.cash_account_id
      and m.movement_date >= cs.opened_at
      and (cs.closed_at is null or m.movement_date <= cs.closed_at)
  );
