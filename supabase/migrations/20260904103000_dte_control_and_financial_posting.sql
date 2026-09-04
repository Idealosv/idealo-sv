-- IDEALO SV: correlativo DTE atómico + estado financiero posterior a aceptación MH.

create table if not exists public.dte_control_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  dte_type text not null check (dte_type in ('01','03')),
  environment text not null check (environment in ('test','production')),
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, dte_type, environment)
);

revoke all on public.dte_control_sequences from anon, authenticated;
grant all on public.dte_control_sequences to service_role;

create or replace function public.next_dte_control_number(
  p_company_id uuid,
  p_dte_type text,
  p_environment text default 'test'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value bigint;
  v_local_max bigint;
  v_establishment text := 'M001';
  v_pos text := 'P001';
begin
  if p_dte_type not in ('01','03') then
    raise exception 'DTE_TYPE_INVALID';
  end if;
  if p_environment not in ('test','production') then
    raise exception 'DTE_ENVIRONMENT_INVALID';
  end if;

  select coalesce(max((split_part(control_number, '-', 4))::bigint), 0)
    into v_local_max
  from public.dte_documents
  where company_id = p_company_id
    and dte_type = p_dte_type
    and environment = p_environment
    and split_part(control_number, '-', 4) ~ '^[0-9]{15}$';

  insert into public.dte_control_sequences(company_id, dte_type, environment, last_value)
  values (p_company_id, p_dte_type, p_environment, v_local_max + 1)
  on conflict (company_id, dte_type, environment)
  do update set
    last_value = greatest(public.dte_control_sequences.last_value, v_local_max) + 1,
    updated_at = now()
  returning last_value into v_value;

  return format('DTE-%s-%s%s-%s', p_dte_type, v_establishment, v_pos, lpad(v_value::text, 15, '0'));
end;
$$;

revoke all on function public.next_dte_control_number(uuid,text,text) from public, anon, authenticated;
grant execute on function public.next_dte_control_number(uuid,text,text) to service_role;

alter table public.dte_documents
  add column if not exists financial_state text,
  add column if not exists financial_posted_at timestamptz,
  add column if not exists financial_note text;

do $$ begin
  alter table public.dte_documents
    add constraint dte_documents_financial_state_check
    check (financial_state is null or financial_state in ('TEST_PERCEIVED','TEST_RECEIVABLE','PERCEIVED','RECEIVABLE'));
exception when duplicate_object then null; end $$;

create unique index if not exists accounts_receivable_dte_document_unique
  on public.accounts_receivable(dte_document_id)
  where dte_document_id is not null;

create unique index if not exists cash_movements_source_unique
  on public.cash_movements(source_type, source_id)
  where source_id is not null;

create or replace function public.mark_dte_financial_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_condition integer := coalesce((new.dte_payload->'resumen'->>'condicionOperacion')::integer, 1);
begin
  if old.status is distinct from 'PROCESSED' and new.status = 'PROCESSED' then
    if new.environment = 'test' then
      new.financial_state := case when v_condition = 2 then 'TEST_RECEIVABLE' else 'TEST_PERCEIVED' end;
      new.financial_note := case when v_condition = 2
        then 'Simulación TEST 00: aceptado por MH y tratado como cuenta por cobrar sin afectar saldos reales.'
        else 'Simulación TEST 00: aceptado por MH y tratado como percibido sin afectar Caja/Bancos reales.' end;
      new.financial_posted_at := now();
    else
      new.financial_state := case when v_condition = 2 then 'RECEIVABLE' else 'PERCEIVED' end;
      new.financial_note := case when v_condition = 2
        then 'DTE producción aceptado por MH: cuenta por cobrar generada.'
        else 'DTE producción aceptado por MH: ingreso percibido registrado en Caja/Bancos.' end;
      new.financial_posted_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_dte_financial_state on public.dte_documents;
create trigger trg_mark_dte_financial_state
before update of status on public.dte_documents
for each row execute function public.mark_dte_financial_state();

create or replace function public.post_processed_dte_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condition integer := coalesce((new.dte_payload->'resumen'->>'condicionOperacion')::integer, 1);
  v_total numeric := coalesce((new.dte_payload->'resumen'->>'totalPagar')::numeric, (new.dte_payload->'resumen'->>'montoTotalOperacion')::numeric, 0);
  v_payment_code text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'codigo', '01');
  v_account_id uuid;
  v_account_type text;
  v_account_name text;
  v_due date;
  v_receivable_number bigint;
begin
  -- TEST 00 solo marca estado financiero simulado. Nunca altera Caja/CxC reales.
  if new.environment <> 'production' or new.status <> 'PROCESSED' or old.status = 'PROCESSED' then
    return new;
  end if;

  if v_total <= 0 then return new; end if;

  if v_condition = 2 then
    v_due := current_date + coalesce(nullif((new.dte_payload->'resumen'->'pagos'->0->>'plazo')::integer,0), 30);
    select coalesce(max(number),0)+1 into v_receivable_number
      from public.accounts_receivable where company_id = new.company_id;

    insert into public.accounts_receivable(
      company_id, client_id, number, concept, amount_total, amount_paid, due_date, status, dte_document_id
    ) values (
      new.company_id, new.client_id, v_receivable_number,
      'DTE ' || new.control_number,
      v_total, 0, v_due, 'OPEN', new.id
    )
    on conflict (dte_document_id) where dte_document_id is not null do nothing;
    return new;
  end if;

  v_account_type := case when v_payment_code = '01' then 'CASH' else 'BANK' end;
  v_account_name := case when v_account_type = 'CASH' then 'Caja principal' else 'Banco principal' end;

  insert into public.cash_accounts(company_id, name, account_type, opening_balance, active)
  values (new.company_id, v_account_name, v_account_type, 0, true)
  on conflict (company_id, name) do update set active = true
  returning id into v_account_id;

  insert into public.cash_movements(
    company_id, cash_account_id, movement_date, movement_type, source_type, source_id, concept, amount, reference, notes
  ) values (
    new.company_id, v_account_id, now(), 'INCOME', 'CUSTOMER_PAYMENT', new.id,
    'Cobro DTE ' || new.control_number,
    v_total,
    new.dte_payload->'resumen'->'pagos'->0->>'referencia',
    'Ingreso generado automáticamente después de aceptación de Hacienda.'
  )
  on conflict (source_type, source_id) where source_id is not null do nothing;

  return new;
end;
$$;

revoke all on function public.post_processed_dte_financials() from public, anon, authenticated;
grant execute on function public.post_processed_dte_financials() to service_role;

drop trigger if exists trg_post_processed_dte_financials on public.dte_documents;
create trigger trg_post_processed_dte_financials
after update of status on public.dte_documents
for each row execute function public.post_processed_dte_financials();
