alter table public.expenses
  add column if not exists cash_account_id uuid references public.cash_accounts(id) on delete restrict;

create index if not exists expenses_cash_account_idx
  on public.expenses(company_id, cash_account_id, expense_date desc)
  where cash_account_id is not null;

create or replace function public.post_business_expense_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
begin
  if new.cash_account_id is null then
    return new;
  end if;

  select id, company_id, name, active
    into v_account
  from public.cash_accounts
  where id = new.cash_account_id;

  if v_account.id is null or v_account.company_id <> new.company_id or coalesce(v_account.active,false) = false then
    raise exception 'La cuenta de caja/banco seleccionada no es válida o no está activa.';
  end if;

  insert into public.cash_movements(
    company_id,
    cash_account_id,
    movement_date,
    movement_type,
    source_type,
    source_id,
    concept,
    amount,
    reference,
    notes
  ) values (
    new.company_id,
    new.cash_account_id,
    new.expense_date::timestamp + time '12:00:00',
    'EXPENSE',
    'EXPENSE',
    new.id,
    new.concept,
    new.amount,
    new.reference,
    new.notes
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_post_business_expense_to_cash on public.expenses;
create trigger trg_post_business_expense_to_cash
after insert on public.expenses
for each row
execute function public.post_business_expense_to_cash();
