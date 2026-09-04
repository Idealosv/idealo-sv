-- IDEALO SV · Anticipos de clientes: Caja ahora, aplicación a factura después.

alter table public.dte_documents
  add column if not exists source_quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists source_work_order_id uuid references public.work_orders(id) on delete set null;

create index if not exists dte_documents_source_quote_idx on public.dte_documents(company_id, source_quote_id) where source_quote_id is not null;
create index if not exists dte_documents_source_work_order_idx on public.dte_documents(company_id, source_work_order_id) where source_work_order_id is not null;

create table if not exists public.customer_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  quote_id uuid references public.quotes(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  applied_amount numeric(12,2) not null default 0 check (applied_amount >= 0),
  payment_method text not null default 'CASH' check (payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER')),
  reference text,
  notes text,
  received_at timestamptz not null default now(),
  status text not null default 'OPEN' check (status in ('OPEN','PARTIAL','APPLIED','CANCELLED')),
  advance_key uuid not null default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_advances_applied_lte_amount check (applied_amount <= amount)
);
create unique index if not exists customer_advances_company_key_uidx on public.customer_advances(company_id, advance_key);
create index if not exists customer_advances_open_idx on public.customer_advances(company_id, client_id, status, received_at desc);
create index if not exists customer_advances_quote_idx on public.customer_advances(company_id, quote_id) where quote_id is not null;
create index if not exists customer_advances_work_order_idx on public.customer_advances(company_id, work_order_id) where work_order_id is not null;

create table if not exists public.customer_advance_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  advance_id uuid not null references public.customer_advances(id) on delete restrict,
  dte_document_id uuid not null references public.dte_documents(id) on delete restrict,
  receivable_id uuid references public.accounts_receivable(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  applied_at timestamptz not null default now(),
  unique (advance_id, dte_document_id)
);

alter table public.customer_payments add column if not exists source_advance_id uuid references public.customer_advances(id) on delete restrict;
create unique index if not exists customer_payments_source_advance_dte_uidx on public.customer_payments(source_advance_id, receivable_id) where source_advance_id is not null;

alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (source_type in ('MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','CUSTOMER_ADVANCE','PURCHASE','EXPENSE','CASH_TRANSFER','CASH_ADJUSTMENT','OTHER'));

alter table public.customer_advances enable row level security;
alter table public.customer_advance_applications enable row level security;
drop policy if exists customer_advances_member_all on public.customer_advances;
create policy customer_advances_member_all on public.customer_advances for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
drop policy if exists customer_advance_applications_member_all on public.customer_advance_applications;
create policy customer_advance_applications_member_all on public.customer_advance_applications for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
grant select,insert,update on public.customer_advances to authenticated;
grant select on public.customer_advance_applications to authenticated;

create or replace function public.register_customer_advance(
  p_company uuid,
  p_client uuid,
  p_cash_account uuid,
  p_amount numeric,
  p_payment_method text default 'CASH',
  p_quote uuid default null,
  p_work_order uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_received_at timestamptz default now(),
  p_advance_key uuid default gen_random_uuid()
) returns uuid
language plpgsql security invoker set search_path='public' as $$
declare v_id uuid; v_existing uuid;
begin
  if not public.is_company_member(p_company) then raise exception 'Sin acceso a esta empresa'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El anticipo debe ser mayor a cero'; end if;
  if not exists(select 1 from public.clients where id=p_client and company_id=p_company) then raise exception 'Cliente no válido'; end if;
  if not exists(select 1 from public.cash_accounts where id=p_cash_account and company_id=p_company and active=true) then raise exception 'Caja o banco no disponible'; end if;
  if p_quote is not null and not exists(select 1 from public.quotes where id=p_quote and company_id=p_company and client_id=p_client) then raise exception 'Cotización no válida para este cliente'; end if;
  if p_work_order is not null and not exists(select 1 from public.work_orders where id=p_work_order and company_id=p_company and (p_quote is null or quote_id=p_quote)) then raise exception 'Orden de trabajo no válida'; end if;
  select id into v_existing from public.customer_advances where company_id=p_company and advance_key=p_advance_key limit 1;
  if v_existing is not null then return v_existing; end if;
  insert into public.customer_advances(company_id,client_id,quote_id,work_order_id,cash_account_id,amount,payment_method,reference,notes,received_at,advance_key)
  values(p_company,p_client,p_quote,p_work_order,p_cash_account,p_amount,case when upper(coalesce(p_payment_method,'')) in ('CASH','TRANSFER','CARD','CHECK','OTHER') then upper(p_payment_method) else 'OTHER' end,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_received_at,now()),p_advance_key)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.register_customer_advance(uuid,uuid,uuid,numeric,text,uuid,uuid,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.register_customer_advance(uuid,uuid,uuid,numeric,text,uuid,uuid,text,text,timestamptz,uuid) to authenticated;

create or replace function public.post_customer_advance_cash() returns trigger
language plpgsql security definer set search_path='public' as $$
begin
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,new.cash_account_id,new.received_at,'INCOME','CUSTOMER_ADVANCE',new.id,'Anticipo de cliente',new.amount,new.reference,coalesce(new.notes,'Pendiente de aplicar a factura final.'))
  on conflict (source_type,source_id) where source_id is not null do nothing;
  return new;
end; $$;
drop trigger if exists trg_post_customer_advance_cash on public.customer_advances;
create trigger trg_post_customer_advance_cash after insert on public.customer_advances for each row execute function public.post_customer_advance_cash();

create or replace function public.apply_customer_payment_cash() returns trigger language plpgsql security invoker set search_path='public' as $$
declare r public.accounts_receivable%rowtype;
begin
  if new.source_advance_id is not null then return new; end if;
  select * into r from public.accounts_receivable where id=new.receivable_id and company_id=new.company_id;
  if not found then raise exception 'Cuenta por cobrar inválida'; end if;
  if new.cash_account_id is null then raise exception 'Seleccioná la caja o banco donde ingresó el cobro'; end if;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,new.cash_account_id,new.paid_at,'INCOME','CUSTOMER_PAYMENT',new.id,'Cobro cliente · CXC-'||r.number,new.amount,new.reference,new.notes)
  on conflict (company_id,source_type,source_id) where source_type='CUSTOMER_PAYMENT' and source_id is not null do nothing;
  return new;
end; $$;

create or replace function public.post_processed_dte_financials()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_condition integer := coalesce((new.dte_payload->'resumen'->>'condicionOperacion')::integer,1);
  v_total numeric := coalesce((new.dte_payload->'resumen'->>'totalPagar')::numeric,(new.dte_payload->'resumen'->>'montoTotalOperacion')::numeric,0);
  v_payment_code text := coalesce(new.dte_payload->'resumen'->'pagos'->0->>'codigo','01');
  v_account_id uuid; v_account_type text; v_account_name text; v_due date; v_receivable_number bigint; v_receivable_id uuid;
  v_advance record; v_available numeric; v_apply numeric; v_applied numeric := 0; v_remaining numeric;
begin
  if new.environment <> 'production' or new.status <> 'PROCESSED' or old.status='PROCESSED' then return new; end if;
  if v_total<=0 then return new; end if;

  if v_condition=2 then
    v_due:=current_date+coalesce(nullif((new.dte_payload->'resumen'->'pagos'->0->>'plazo')::integer,0),30);
    select coalesce(max(number),0)+1 into v_receivable_number from public.accounts_receivable where company_id=new.company_id;
    insert into public.accounts_receivable(company_id,client_id,number,concept,amount_total,amount_paid,due_date,status,dte_document_id)
    values(new.company_id,new.client_id,v_receivable_number,'DTE '||new.control_number,v_total,0,v_due,'OPEN',new.id)
    on conflict (dte_document_id) where dte_document_id is not null do update set client_id=excluded.client_id, amount_total=excluded.amount_total, due_date=excluded.due_date, updated_at=now()
    returning id into v_receivable_id;
  end if;

  for v_advance in
    select * from public.customer_advances a
    where a.company_id=new.company_id and a.client_id=new.client_id and a.status in ('OPEN','PARTIAL')
      and ((new.source_work_order_id is not null and a.work_order_id=new.source_work_order_id)
        or (new.source_work_order_id is null and new.source_quote_id is not null and a.quote_id=new.source_quote_id))
    order by a.received_at, a.created_at
    for update
  loop
    exit when v_applied>=v_total;
    v_available:=greatest(v_advance.amount-v_advance.applied_amount,0);
    v_apply:=least(v_available,v_total-v_applied);
    if v_apply<=0 then continue; end if;
    insert into public.customer_advance_applications(company_id,advance_id,dte_document_id,receivable_id,amount)
    values(new.company_id,v_advance.id,new.id,v_receivable_id,v_apply)
    on conflict (advance_id,dte_document_id) do nothing;
    if found then
      update public.customer_advances set applied_amount=applied_amount+v_apply,status=case when applied_amount+v_apply>=amount then 'APPLIED' else 'PARTIAL' end,updated_at=now() where id=v_advance.id;
      v_applied:=v_applied+v_apply;
      if v_receivable_id is not null then
        insert into public.customer_payments(company_id,receivable_id,client_id,cash_account_id,amount,payment_method,reference,notes,payment_key,source_advance_id,paid_at)
        values(new.company_id,v_receivable_id,new.client_id,v_advance.cash_account_id,v_apply,v_advance.payment_method,coalesce(v_advance.reference,'Anticipo aplicado'),'Aplicación de anticipo recibido antes de la factura.',gen_random_uuid(),v_advance.id,v_advance.received_at)
        on conflict (source_advance_id,receivable_id) where source_advance_id is not null do nothing;
      end if;
    end if;
  end loop;

  if v_condition=2 then return new; end if;

  v_remaining:=greatest(v_total-v_applied,0);
  if v_remaining<=0 then return new; end if;
  v_account_type:=case when v_payment_code='01' then 'CASH' else 'BANK' end;
  v_account_name:=case when v_account_type='CASH' then 'Caja principal' else 'Banco principal' end;
  insert into public.cash_accounts(company_id,name,account_type,opening_balance,active)
  values(new.company_id,v_account_name,v_account_type,0,true)
  on conflict (company_id,name) do update set active=true returning id into v_account_id;
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(new.company_id,v_account_id,now(),'INCOME','CUSTOMER_PAYMENT',new.id,'Cobro DTE '||new.control_number,v_remaining,new.dte_payload->'resumen'->'pagos'->0->>'referencia',case when v_applied>0 then format('Saldo cobrado al facturar. Anticipos previamente recibidos aplicados: $%s.',v_applied) else 'Ingreso generado automáticamente después de aceptación de Hacienda.' end)
  on conflict (source_type,source_id) where source_id is not null do nothing;
  return new;
end; $$;
