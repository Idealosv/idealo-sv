create table if not exists public.customer_advances (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete restrict,
 quote_id uuid references public.quotes(id) on delete set null,
 work_order_id uuid references public.work_orders(id) on delete set null,
 cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
 received_at timestamptz not null default now(), amount numeric(14,2) not null check(amount>0), applied_amount numeric(14,2) not null default 0 check(applied_amount>=0),
 payment_method text not null default 'CASH', reference text, notes text,
 status text not null default 'PENDING' check(status in ('PENDING','PARTIALLY_APPLIED','APPLIED','VOID')),
 dte_document_id uuid references public.dte_documents(id) on delete set null,
 created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint customer_advances_applied_lte_amount check(applied_amount<=amount)
);
create index if not exists customer_advances_company_status_idx on public.customer_advances(company_id,status,received_at desc);
create index if not exists customer_advances_client_idx on public.customer_advances(client_id,received_at desc);
alter table public.customer_advances enable row level security;
drop policy if exists customer_advances_member_all on public.customer_advances;
create policy customer_advances_member_all on public.customer_advances for all using (exists(select 1 from public.company_members m where m.company_id=customer_advances.company_id and m.user_id=auth.uid())) with check (exists(select 1 from public.company_members m where m.company_id=customer_advances.company_id and m.user_id=auth.uid()));
create or replace function public.register_customer_advance(p_company_id uuid,p_client_id uuid,p_quote_id uuid,p_work_order_id uuid,p_cash_account_id uuid,p_amount numeric,p_received_at timestamptz,p_payment_method text,p_reference text,p_notes text) returns public.customer_advances language plpgsql security invoker as $$ declare a public.customer_advances; begin insert into public.customer_advances(company_id,client_id,quote_id,work_order_id,cash_account_id,amount,received_at,payment_method,reference,notes) values(p_company_id,p_client_id,p_quote_id,p_work_order_id,p_cash_account_id,round(p_amount,2),coalesce(p_received_at,now()),coalesce(nullif(p_payment_method,''),'CASH'),p_reference,p_notes) returning * into a; insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes) values(p_company_id,p_cash_account_id,a.received_at,'INCOME','CUSTOMER_ADVANCE',a.id,'Anticipo de cliente pendiente de aplicar',a.amount,p_reference,coalesce(p_notes,'Anticipo recibido antes de la facturación final.')); return a; end $$;
grant select,insert,update on public.customer_advances to authenticated;
grant execute on function public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text) to authenticated;
