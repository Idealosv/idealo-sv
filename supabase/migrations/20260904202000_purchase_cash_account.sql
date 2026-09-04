alter table public.purchases
  add column if not exists cash_account_id uuid references public.cash_accounts(id) on delete restrict;

create index if not exists purchases_cash_account_idx
  on public.purchases(company_id, cash_account_id, purchase_date desc)
  where cash_account_id is not null;

create or replace function public.post_paid_purchase_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
begin
  if new.payment_status <> 'PAID' or new.cash_account_id is null then
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
    new.purchase_date::timestamp + time '12:00:00',
    'EXPENSE',
    'PURCHASE',
    new.id,
    new.concept,
    new.total,
    new.document_number,
    new.notes
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_post_paid_purchase_to_cash on public.purchases;
create trigger trg_post_paid_purchase_to_cash
after insert on public.purchases
for each row
execute function public.post_paid_purchase_to_cash();
