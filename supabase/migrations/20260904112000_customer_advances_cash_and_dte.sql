-- IDEALO SV · Anticipos de clientes -> Caja/Banco -> DTE final sin duplicar ingresos

alter table public.dte_documents
  add column if not exists quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;

create index if not exists dte_documents_quote_idx on public.dte_documents(company_id, quote_id) where quote_id is not null;
create index if not exists dte_documents_work_order_idx on public.dte_documents(company_id, work_order_id) where work_order_id is not null;

create table if not exists public.customer_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  received_at timestamptz not null default now(),
  amount numeric(14,2) not null check (amount > 0),
  applied_amount numeric(14,2) not null default 0 check (applied_amount >= 0),
  payment_method text not null default 'CASH' check (payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER')),
  reference text,
  notes text,
  status text not null default 'PENDING' check (status in ('PENDING','PARTIALLY_APPLIED','APPLIED','VOID')),
  dte_document_id uuid references public.dte_documents(id) on delete set null,
  advance_key uuid not null default gen_random_uuid(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_advances_applied_lte_amount check (applied_amount <= amount)
);

alter table public.customer_advances add column if not exists advance_key uuid default gen_random_uuid();
update public.customer_advances set advance_key=gen_random_uuid() where advance_key is null;
alter table public.customer_advances alter column advance_key set not null;

create unique index if not exists customer_advances_company_key_uidx on public.customer_advances(company_id, advance_key);
create index if not exists customer_advances_company_status_idx on public.customer_advances(company_id,status,received_at desc);
create index if not exists customer_advances_client_idx on public.customer_advances(client_id,received_at desc);
create index if not exists customer_advances_quote_idx on public.customer_advances(company_id,quote_id,status) where quote_id is not null;
create index if not exists customer_advances_work_order_idx on public.customer_advances(company_id,work_order_id,status) where work_order_id is not null;

alter table public.customer_advances enable row level security;
drop policy if exists customer_advances_member_all on public.customer_advances;
create policy customer_advances_member_all on public.customer_advances
for all using (
  exists(select 1 from public.company_members m where m.company_id=customer_advances.company_id and m.user_id=auth.uid())
) with check (
  exists(select 1 from public.company_members m where m.company_id=customer_advances.company_id and m.user_id=auth.uid())
);

grant select on public.customer_advances to authenticated;
revoke insert, update, delete on public.customer_advances from authenticated;

create table if not exists public.customer_advance_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  advance_id uuid not null references public.customer_advances(id) on delete restrict,
  dte_document_id uuid not null references public.dte_documents(id) on delete restrict,
  receivable_id uuid references public.accounts_receivable(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists customer_advance_application_unique on public.customer_advance_applications(advance_id,dte_document_id);
create index if not exists customer_advance_application_receivable_idx on public.customer_advance_applications(receivable_id) where receivable_id is not null;

alter table public.customer_advance_applications enable row level security;
drop policy if exists customer_advance_applications_member_select on public.customer_advance_applications;
create policy customer_advance_applications_member_select on public.customer_advance_applications
for select using (
  exists(select 1 from public.company_members m where m.company_id=customer_advance_applications.company_id and m.user_id=auth.uid())
);
grant select on public.customer_advance_applications to authenticated;
revoke insert, update, delete on public.customer_advance_applications from authenticated;

alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (
  source_type in ('MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','CUSTOMER_ADVANCE','PURCHASE','EXPENSE','CASH_TRANSFER','CASH_ADJUSTMENT','OTHER')
);
create unique index if not exists cash_movements_customer_advance_uidx
  on public.cash_movements(company_id,source_type,source_id)
  where source_type='CUSTOMER_ADVANCE' and source_id is not null;

create or replace function public.register_customer_advance(
  p_company_id uuid,
  p_client_id uuid,
  p_quote_id uuid,
  p_work_order_id uuid,
  p_cash_account_id uuid,
  p_amount numeric,
  p_received_at timestamptz,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_advance_key uuid default gen_random_uuid()
) returns public.customer_advances
language plpgsql
security invoker
set search_path='public'
as $$
declare
  a public.customer_advances;
  c public.cash_accounts%rowtype;
  q public.quotes%rowtype;
  w public.work_orders%rowtype;
  v_method text;
begin
  if not public.is_company_member(p_company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'El anticipo debe ser mayor que cero'; end if;

  if not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id) then
    raise exception 'Cliente no válido para esta empresa';
  end if;

  select * into c from public.cash_accounts where id=p_cash_account_id and company_id=p_company_id and active=true;
  if not found then raise exception 'Caja o banco no disponible'; end if;

  if p_quote_id is not null then
    select * into q from public.quotes where id=p_quote_id and company_id=p_company_id;
    if not found or q.client_id is distinct from p_client_id then raise exception 'La cotización no pertenece al cliente seleccionado'; end if;
  end if;

  if p_work_order_id is not null then
    select * into w from public.work_orders where id=p_work_order_id and company_id=p_company_id;
    if not found then raise exception 'Orden de trabajo no válida'; end if;
    if p_quote_id is not null and w.quote_id is distinct from p_quote_id then raise exception 'La orden no pertenece a la cotización seleccionada'; end if;
  end if;

  select * into a from public.customer_advances where company_id=p_company_id and advance_key=p_advance_key limit 1;
  if found then return a; end if;

  v_method := case when p_payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER') then p_payment_method else 'OTHER' end;

  insert into public.customer_advances(
    company_id,client_id,quote_id,work_order_id,cash_account_id,amount,received_at,payment_method,reference,notes,advance_key
  ) values(
    p_company_id,p_client_id,p_quote_id,p_work_order_id,p_cash_account_id,round(p_amount,2),coalesce(p_received_at,now()),v_method,
    nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_advance_key
  ) returning * into a;

  insert into public.cash_movements(
    company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes
  ) values(
    p_company_id,p_cash_account_id,a.received_at,'INCOME','CUSTOMER_ADVANCE',a.id,
    'Anticipo de cliente pendiente de aplicar',a.amount,a.reference,
    coalesce(a.notes,'Anticipo recibido antes de la facturación final.')
  ) on conflict (company_id,source_type,source_id) where source_type='CUSTOMER_ADVANCE' and source_id is not null do nothing;

  return a;
end;
$$;
revoke all on function public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text,uuid) from public,anon;
grant execute on function public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text,uuid) to authenticated;

create or replace function public.refresh_receivable_balance(target_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_paid numeric(12,2);
  v_total numeric(12,2);
  v_due date;
begin
  select
    coalesce((select sum(amount) from public.customer_payments where receivable_id=target_id),0)
    + coalesce((select sum(amount) from public.customer_advance_applications where receivable_id=target_id),0)
  into v_paid;
  select amount_total,due_date into v_total,v_due from public.accounts_receivable where id=target_id;
  update public.accounts_receivable
    set amount_paid=least(coalesce(v_paid,0),amount_total),
        status=case when coalesce(v_paid,0)>=v_total then 'PAID' when coalesce(v_paid,0)>0 then 'PARTIAL' when v_due is not null and v_due<current_date then 'OVERDUE' else 'OPEN' end,
        updated_at=now()
  where id=target_id and status<>'CANCELLED';
end;
$$;

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
  v_receivable_id uuid;
  v_advance_applied numeric := 0;
  v_available numeric;
  v_apply numeric;
  v_remaining numeric;
  a public.customer_advances%rowtype;
begin
  -- TEST 00 jamás consume anticipos ni modifica Caja/CxC reales.
  if new.environment <> 'production' or new.status <> 'PROCESSED' or old.status = 'PROCESSED' then
    return new;
  end if;
  if v_total <= 0 then return new; end if;

  if v_condition = 2 then
    v_due := current_date + coalesce(nullif((new.dte_payload->'resumen'->'pagos'->0->>'plazo')::integer,0), 30);
    select coalesce(max(number),0)+1 into v_receivable_number from public.accounts_receivable where company_id=new.company_id;
    insert into public.accounts_receivable(company_id,client_id,number,concept,amount_total,amount_paid,due_date,status,dte_document_id)
    values(new.company_id,new.client_id,v_receivable_number,'DTE '||new.control_number,v_total,0,v_due,'OPEN',new.id)
    on conflict (dte_document_id) where dte_document_id is not null do update set amount_total=excluded.amount_total,client_id=excluded.client_id,due_date=excluded.due_date,updated_at=now()
    returning id into v_receivable_id;
  end if;

  -- Solo aplica anticipos expresamente vinculados al mismo proyecto/cotización.
  if new.client_id is not null and (new.quote_id is not null or new.work_order_id is not null) then
    for a in
      select * from public.customer_advances ca
      where ca.company_id=new.company_id
        and ca.client_id=new.client_id
        and ca.status in ('PENDING','PARTIALLY_APPLIED')
        and ca.applied_amount < ca.amount
        and (
          (new.work_order_id is not null and ca.work_order_id=new.work_order_id)
          or (new.quote_id is not null and ca.quote_id=new.quote_id)
        )
      order by ca.received_at,ca.created_at
      for update
    loop
      exit when v_advance_applied >= v_total;
      v_available := greatest(a.amount-a.applied_amount,0);
      v_apply := least(v_available,v_total-v_advance_applied);
      if v_apply <= 0 then continue; end if;

      insert into public.customer_advance_applications(company_id,advance_id,dte_document_id,receivable_id,amount)
      values(new.company_id,a.id,new.id,v_receivable_id,v_apply)
      on conflict (advance_id,dte_document_id) do nothing;

      if found then
        update public.customer_advances
          set applied_amount=applied_amount+v_apply,
              status=case when applied_amount+v_apply>=amount then 'APPLIED' else 'PARTIALLY_APPLIED' end,
              dte_document_id=new.id,
              updated_at=now()
        where id=a.id;
        v_advance_applied := v_advance_applied+v_apply;
      end if;
    end loop;
  end if;

  if v_condition = 2 then
    perform public.refresh_receivable_balance(v_receivable_id);
    return new;
  end if;

  v_remaining := greatest(v_total-v_advance_applied,0);
  if v_remaining <= 0 then return new; end if;

  v_account_type := case when v_payment_code='01' then 'CASH' else 'BANK' end;
  v_account_name := case when v_account_type='CASH' then 'Caja principal' else 'Banco principal' end;
  insert into public.cash_accounts(company_id,name,account_type,opening_balance,active)
  values(new.company_id,v_account_name,v_account_type,0,true)
  on conflict (company_id,name) do update set active=true
  returning id into v_account_id;

  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,v_account_id,now(),'INCOME','CUSTOMER_PAYMENT',new.id,
    case when v_advance_applied>0 then 'Saldo cobrado DTE '||new.control_number else 'Cobro DTE '||new.control_number end,
    v_remaining,new.dte_payload->'resumen'->'pagos'->0->>'referencia',
    case when v_advance_applied>0 then 'El anticipo ya estaba registrado en Caja; solo se registra el saldo pendiente.' else 'Ingreso generado automáticamente después de aceptación de Hacienda.' end)
  on conflict (source_type,source_id) where source_id is not null do nothing;

  return new;
end;
$$;

revoke all on function public.post_processed_dte_financials() from public,anon,authenticated;
grant execute on function public.post_processed_dte_financials() to service_role;
