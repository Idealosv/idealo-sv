-- IDEALO BAR · devoluciones, liquidación de propinas y cierre profesional de caja

alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (source_type = any (array[
 'MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','CUSTOMER_ADVANCE','PURCHASE','PURCHASE_REVERSAL','EXPENSE','EXPENSE_REVERSAL','CASH_TRANSFER','CASH_ADJUSTMENT','INTERNAL_INCOME','OTHER','BAR_SALE','DTE_PAYMENT','SUPPLIER_PAYMENT','PAYROLL','BAR_REFUND','TIP_PAYOUT'
]::text[]));

create table if not exists public.bar_refunds(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 order_id uuid not null references public.bar_orders(id) on delete restrict,
 refund_code text not null default ('REF-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 method text not null check(method in ('cash','card','transfer','other')),
 merchandise_refund numeric(14,2) not null default 0 check(merchandise_refund>=0),
 tip_refund numeric(14,2) not null default 0 check(tip_refund>=0),
 amount numeric(14,2) not null check(amount>0),
 reason text not null,
 restock boolean not null default false,
 cash_account_id uuid references public.cash_accounts(id) on delete restrict,
 cash_register_session_id uuid references public.cash_register_sessions(id) on delete restrict,
 cash_movement_id uuid references public.cash_movements(id) on delete restrict,
 dte_document_id uuid references public.dte_documents(id) on delete set null,
 fiscal_status text not null default 'NOT_REQUIRED' check(fiscal_status in ('NOT_REQUIRED','REVIEW_REQUIRED','ACTION_REQUIRED','RESOLVED')),
 status text not null default 'COMPLETED' check(status in ('COMPLETED','VOID')),
 requested_by uuid references auth.users(id) on delete set null default auth.uid(),
 approved_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,refund_code)
);
create index if not exists bar_refunds_company_created_idx on public.bar_refunds(company_id,created_at desc);
create index if not exists bar_refunds_order_idx on public.bar_refunds(order_id,status);

create table if not exists public.bar_refund_items(
 id uuid primary key default gen_random_uuid(),
 refund_id uuid not null references public.bar_refunds(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 order_item_id uuid not null references public.bar_order_items(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity>0),
 amount numeric(14,2) not null check(amount>=0),
 restock boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists bar_refund_items_refund_idx on public.bar_refund_items(refund_id);
create index if not exists bar_refund_items_order_item_idx on public.bar_refund_items(order_item_id);

create table if not exists public.bar_tip_payouts(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete restrict,
 payout_code text not null default ('TIP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 method text not null check(method in ('cash','transfer')),
 amount numeric(14,2) not null check(amount>0),
 cash_account_id uuid not null references public.cash_accounts(id) on delete restrict,
 cash_register_session_id uuid references public.cash_register_sessions(id) on delete restrict,
 cash_movement_id uuid references public.cash_movements(id) on delete restrict,
 note text,
 paid_by uuid references auth.users(id) on delete set null default auth.uid(),
 paid_at timestamptz not null default now(),
 unique(company_id,payout_code)
);
create index if not exists bar_tip_payouts_company_paid_idx on public.bar_tip_payouts(company_id,paid_at desc);
create index if not exists bar_tip_payouts_recipient_idx on public.bar_tip_payouts(company_id,recipient_user_id,paid_at desc);

create table if not exists public.bar_tip_payout_items(
 id uuid primary key default gen_random_uuid(),
 payout_id uuid not null references public.bar_tip_payouts(id) on delete cascade,
 tip_allocation_id uuid not null references public.bar_tip_allocations(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0),
 created_at timestamptz not null default now(),
 unique(tip_allocation_id)
);

create table if not exists public.bar_cash_count_lines(
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.cash_register_sessions(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 denomination numeric(10,2) not null check(denomination>0),
 quantity integer not null check(quantity>=0),
 line_total numeric(14,2) generated always as (round(denomination*quantity,2)) stored,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 unique(session_id,denomination)
);
create index if not exists bar_cash_count_lines_company_idx on public.bar_cash_count_lines(company_id,created_at desc);

create table if not exists public.bar_day_closures(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 business_date date not null,
 snapshot jsonb not null,
 notes text,
 closed_by uuid references auth.users(id) on delete set null default auth.uid(),
 closed_at timestamptz not null default now(),
 unique(company_id,business_date)
);

alter table public.bar_refunds enable row level security;
alter table public.bar_refund_items enable row level security;
alter table public.bar_tip_payouts enable row level security;
alter table public.bar_tip_payout_items enable row level security;
alter table public.bar_cash_count_lines enable row level security;
alter table public.bar_day_closures enable row level security;

drop policy if exists bar_refunds_read on public.bar_refunds;
create policy bar_refunds_read on public.bar_refunds for select to authenticated using (
 public.bar_has_permission(company_id,'payment.take') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage')
);
drop policy if exists bar_refund_items_read on public.bar_refund_items;
create policy bar_refund_items_read on public.bar_refund_items for select to authenticated using (
 public.bar_has_permission(company_id,'payment.take') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage')
);
drop policy if exists bar_tip_payouts_read on public.bar_tip_payouts;
create policy bar_tip_payouts_read on public.bar_tip_payouts for select to authenticated using (
 public.bar_has_permission(company_id,'tip.manage') or public.bar_has_permission(company_id,'cash.view') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage')
);
drop policy if exists bar_tip_payout_items_read on public.bar_tip_payout_items;
create policy bar_tip_payout_items_read on public.bar_tip_payout_items for select to authenticated using (
 exists(select 1 from public.bar_tip_payouts p where p.id=payout_id and (public.bar_has_permission(p.company_id,'tip.manage') or public.bar_has_permission(p.company_id,'cash.view') or public.bar_has_permission(p.company_id,'admin.view') or public.bar_has_permission(p.company_id,'admin.manage')))
);
drop policy if exists bar_cash_count_lines_read on public.bar_cash_count_lines;
create policy bar_cash_count_lines_read on public.bar_cash_count_lines for select to authenticated using (
 public.bar_has_permission(company_id,'cash.view') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage')
);
drop policy if exists bar_day_closures_read on public.bar_day_closures;
create policy bar_day_closures_read on public.bar_day_closures for select to authenticated using (
 public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage')
);

create or replace function public.bar_resolve_money_account(p_company_id uuid,p_method text,p_account_id uuid default null,p_require_own_session boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_method text:=lower(trim(coalesce(p_method,'')));v_account public.cash_accounts%rowtype;v_session public.cash_register_sessions%rowtype;v_count int;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if p_account_id is not null then
  select * into v_account from public.cash_accounts where id=p_account_id and company_id=p_company_id and active=true;
  if not found then raise exception 'Cuenta de caja/banco no disponible.'; end if;
 else
  if v_method='cash' then
   select count(*) into v_count from public.cash_register_sessions s join public.cash_accounts a on a.id=s.cash_account_id where s.company_id=p_company_id and s.status='OPEN' and a.active=true and upper(a.account_type)<>'BANK';
   select s.* into v_session from public.cash_register_sessions s join public.cash_accounts a on a.id=s.cash_account_id where s.company_id=p_company_id and s.status='OPEN' and a.active=true and upper(a.account_type)<>'BANK' and s.opened_by=auth.uid() order by s.opened_at desc limit 1;
   if found then select * into v_account from public.cash_accounts where id=v_session.cash_account_id;
   elsif v_count=1 then select s.* into v_session from public.cash_register_sessions s join public.cash_accounts a on a.id=s.cash_account_id where s.company_id=p_company_id and s.status='OPEN' and a.active=true and upper(a.account_type)<>'BANK' order by s.opened_at desc limit 1; select * into v_account from public.cash_accounts where id=v_session.cash_account_id;
   else raise exception 'Selecciona la caja correcta: hay varias cajas abiertas o ninguna disponible.'; end if;
  elsif v_method in ('card','transfer') then
   select count(*) into v_count from public.cash_accounts where company_id=p_company_id and active=true and upper(account_type)='BANK';
   if v_count<>1 then raise exception 'Selecciona la cuenta bancaria que corresponde al movimiento.'; end if;
   select * into v_account from public.cash_accounts where company_id=p_company_id and active=true and upper(account_type)='BANK' order by id::text limit 1;
  else
   raise exception 'Selecciona la cuenta financiera para este método.';
  end if;
 end if;
 if v_method='cash' and upper(v_account.account_type)='BANK' then raise exception 'El efectivo debe salir de una cuenta de caja.'; end if;
 if v_method in ('card','transfer') and upper(v_account.account_type)<>'BANK' then raise exception 'Tarjeta/transferencia debe usar una cuenta bancaria.'; end if;
 if upper(v_account.account_type)<>'BANK' then
  select * into v_session from public.cash_register_sessions where company_id=p_company_id and cash_account_id=v_account.id and status='OPEN' order by opened_at desc limit 1;
  if not found then raise exception 'La caja seleccionada está cerrada.'; end if;
  if p_require_own_session and v_session.opened_by is distinct from auth.uid() and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo podés usar tu propio turno de caja.'; end if;
 end if;
 return jsonb_build_object('account_id',v_account.id,'account_type',v_account.account_type,'session_id',v_session.id);
end;$$;
revoke execute on function public.bar_resolve_money_account(uuid,text,uuid,boolean) from public,anon,authenticated;

create or replace function public.bar_refund_order(
 p_order_id uuid,p_method text,p_reason text,p_items jsonb default '[]'::jsonb,p_tip_refund numeric default 0,p_cash_account_id uuid default null,p_restock boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
 v_order public.bar_orders%rowtype;v_method text:=lower(trim(coalesce(p_method,'')));v_reason text:=trim(coalesce(p_reason,''));
 v_prev_total numeric:=0;v_prev_tip numeric:=0;v_remaining numeric:=0;v_merch numeric:=0;v_tip numeric:=round(greatest(coalesce(p_tip_refund,0),0),2);v_total numeric;
 v_refund_id uuid;v_refund_item_id uuid;v_movement_id uuid;v_cash_movement_id uuid;v_account jsonb;v_account_id uuid;v_session_id uuid;
 v_dte public.dte_documents%rowtype;v_fiscal text:='NOT_REQUIRED';r jsonb;v_item public.bar_order_items%rowtype;v_qty numeric;v_prev_qty numeric;v_factor numeric;v_line_amount numeric;c record;v_return_qty numeric;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into v_order from public.bar_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido no encontrado.'; end if;
 if not public.bar_has_permission(v_order.company_id,'admin.manage') then raise exception 'Solo Gerente o Propietario puede autorizar devoluciones.'; end if;
 if v_order.status<>'paid' then raise exception 'Solo se puede devolver una venta pagada.'; end if;
 if v_reason='' or char_length(v_reason)<4 then raise exception 'Indicá un motivo claro para la devolución.'; end if;
 if v_method not in ('cash','card','transfer','other') then raise exception 'Método de devolución inválido.'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'Detalle de devolución inválido.'; end if;
 select coalesce(sum(amount),0),coalesce(sum(tip_refund),0) into v_prev_total,v_prev_tip from public.bar_refunds where order_id=v_order.id and status='COMPLETED';
 v_remaining:=round(greatest(v_order.total-v_prev_total,0),2);
 if v_remaining<=0 then raise exception 'La venta ya fue devuelta completamente.'; end if;
 if v_tip>greatest(v_order.tip_total-v_prev_tip,0)+0.01 then raise exception 'La devolución de propina supera la propina pendiente.'; end if;
 v_factor:=case when coalesce(v_order.subtotal,0)>0 then greatest(v_order.subtotal-v_order.discount_total,0)/v_order.subtotal else 0 end;
 insert into public.bar_refunds(company_id,order_id,method,amount,merchandise_refund,tip_refund,reason,restock,status)
 values(v_order.company_id,v_order.id,v_method,0,0,v_tip,v_reason,coalesce(p_restock,false),'COMPLETED') returning id into v_refund_id;
 for r in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  select * into v_item from public.bar_order_items where id=(r->>'order_item_id')::uuid and order_id=v_order.id and company_id=v_order.company_id and status<>'cancelled' for update;
  if not found then raise exception 'Uno de los productos no pertenece a esta venta.'; end if;
  v_qty:=round(coalesce((r->>'quantity')::numeric,0),3);if v_qty<=0 then continue; end if;
  select coalesce(sum(ri.quantity),0) into v_prev_qty from public.bar_refund_items ri join public.bar_refunds rf on rf.id=ri.refund_id where ri.order_item_id=v_item.id and rf.status='COMPLETED';
  if v_qty>v_item.quantity-v_prev_qty+0.0001 then raise exception 'La cantidad a devolver de % supera lo vendido pendiente.',v_item.item_name; end if;
  v_line_amount:=round((coalesce(v_item.line_total,0)/greatest(v_item.quantity,0.000001))*v_qty*v_factor,2);
  insert into public.bar_refund_items(refund_id,company_id,order_item_id,quantity,amount,restock) values(v_refund_id,v_order.company_id,v_item.id,v_qty,v_line_amount,coalesce((r->>'restock')::boolean,p_restock,false)) returning id into v_refund_item_id;
  v_merch:=v_merch+v_line_amount;
  if coalesce((r->>'restock')::boolean,p_restock,false) then
   for c in select bc.*,im.warehouse_id,im.location_id from public.bar_inventory_consumptions bc join public.inventory_movements im on im.id=bc.inventory_movement_id where bc.order_item_id=v_item.id loop
    v_return_qty:=round(c.quantity*(v_qty/greatest(v_item.quantity,0.000001)),6);
    if v_return_qty>0 then
     insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity,unit_cost,warehouse_id,location_id,document_type,document_id,reference,notes,created_by,reversed_movement_id)
     values(v_order.company_id,c.inventory_item_id,'RETURN',v_return_qty,c.unit_cost,c.warehouse_id,c.location_id,'BAR_REFUND',v_refund_item_id,v_order.order_code,'IDEALO BAR · devolución: '||v_reason,auth.uid(),c.inventory_movement_id) returning id into v_movement_id;
    end if;
   end loop;
  end if;
 end loop;
 v_merch:=round(v_merch,2);v_total:=round(v_merch+v_tip,2);
 if v_total<=0 then delete from public.bar_refunds where id=v_refund_id;raise exception 'Seleccioná al menos un producto o una propina para devolver.';end if;
 if v_total>v_remaining+0.01 then delete from public.bar_refunds where id=v_refund_id;raise exception 'La devolución supera el saldo máximo disponible de %.',v_remaining;end if;
 v_account:=public.bar_resolve_money_account(v_order.company_id,v_method,p_cash_account_id,true);v_account_id:=(v_account->>'account_id')::uuid;v_session_id:=nullif(v_account->>'session_id','')::uuid;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
 values(v_order.company_id,v_account_id,now(),'EXPENSE','BAR_REFUND',v_refund_id,'IDEALO BAR · devolución '||v_order.order_code,v_total,v_order.order_code,v_reason,v_session_id) returning id into v_cash_movement_id;
 select * into v_dte from public.dte_documents where bar_order_id=v_order.id order by created_at desc limit 1;
 if found then if v_dte.status='PROCESSED' then v_fiscal:='ACTION_REQUIRED';elsif v_dte.status in ('DRAFT','SIGNING','SIGNED','TRANSMITTING','CONTINGENCY') then v_fiscal:='REVIEW_REQUIRED';else v_fiscal:='NOT_REQUIRED';end if;end if;
 update public.bar_refunds set amount=v_total,merchandise_refund=v_merch,cash_account_id=v_account_id,cash_register_session_id=v_session_id,cash_movement_id=v_cash_movement_id,dte_document_id=v_dte.id,fiscal_status=v_fiscal,updated_at=now() where id=v_refund_id;
 insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(v_order.company_id,v_order.id,'REFUND_COMPLETED',v_reason,jsonb_build_object('refund_id',v_refund_id,'amount',v_total,'merchandise',v_merch,'tip',v_tip,'method',v_method,'restock',p_restock,'fiscal_status',v_fiscal));
 return jsonb_build_object('refund_id',v_refund_id,'amount',v_total,'merchandise_refund',v_merch,'tip_refund',v_tip,'remaining_after',round(greatest(v_remaining-v_total,0),2),'fiscal_status',v_fiscal,'dte_status',v_dte.status);
end;$$;
revoke execute on function public.bar_refund_order(uuid,text,text,jsonb,numeric,uuid,boolean) from public,anon;
grant execute on function public.bar_refund_order(uuid,text,text,jsonb,numeric,uuid,boolean) to authenticated;

create or replace function public.bar_tip_payout_summary(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_people jsonb;v_total numeric;v_paid numeric;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'tip.manage') and not public.bar_has_permission(p_company_id,'cash.view') and not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Sin permiso para consultar propinas.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',x.recipient_user_id,'name',x.display_name,'earned',x.earned,'paid',x.paid,'pending',x.pending) order by x.pending desc,x.display_name),'[]'::jsonb) into v_people from (
  select a.recipient_user_id,coalesce(s.display_name,'Sin asignar') display_name,round(sum(a.amount),2) earned,round(sum(case when a.status='PAID_OUT' then a.amount else 0 end),2) paid,round(sum(case when a.status='EARNED' then a.amount else 0 end),2) pending
  from public.bar_tip_allocations a left join public.bar_staff_assignments s on s.company_id=a.company_id and s.user_id=a.recipient_user_id where a.company_id=p_company_id and a.status<>'VOID' group by a.recipient_user_id,s.display_name
 ) x;
 select coalesce(sum(amount),0) into v_total from public.bar_tip_allocations where company_id=p_company_id and status='EARNED';
 select coalesce(sum(amount),0) into v_paid from public.bar_tip_payouts where company_id=p_company_id;
 return jsonb_build_object('pending_total',round(v_total,2),'paid_out_total',round(v_paid,2),'people',v_people);
end;$$;
revoke execute on function public.bar_tip_payout_summary(uuid) from public,anon;
grant execute on function public.bar_tip_payout_summary(uuid) to authenticated;

create or replace function public.bar_pay_tip_balance(p_company_id uuid,p_recipient_user_id uuid,p_method text,p_cash_account_id uuid default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_method text:=lower(trim(coalesce(p_method,'')));v_total numeric:=0;v_payout_id uuid;v_move_id uuid;v_account jsonb;v_account_id uuid;v_session_id uuid;r record;v_expected numeric;v_in numeric;v_out numeric;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.manage') and not (public.bar_has_permission(p_company_id,'tip.manage') and public.bar_has_permission(p_company_id,'cash.close')) then raise exception 'No tenés autorización para liquidar propinas.'; end if;
 if v_method not in ('cash','transfer') then raise exception 'La propina se liquida por efectivo o transferencia.'; end if;
 if p_recipient_user_id is null then raise exception 'Seleccioná al colaborador.'; end if;
 select round(coalesce(sum(amount),0),2) into v_total from public.bar_tip_allocations where company_id=p_company_id and recipient_user_id=p_recipient_user_id and status='EARNED';
 if v_total<=0 then raise exception 'El colaborador no tiene propinas pendientes.'; end if;
 v_account:=public.bar_resolve_money_account(p_company_id,v_method,p_cash_account_id,true);v_account_id:=(v_account->>'account_id')::uuid;v_session_id:=nullif(v_account->>'session_id','')::uuid;
 if v_method='cash' then
  select opening_balance into v_expected from public.cash_register_sessions where id=v_session_id for update;
  select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0) into v_in,v_out from public.cash_movements where cash_register_session_id=v_session_id;
  v_expected:=round(v_expected+v_in-v_out,2);if v_expected+0.01<v_total then raise exception 'La caja no tiene efectivo esperado suficiente para liquidar %.',v_total;end if;
 end if;
 insert into public.bar_tip_payouts(company_id,recipient_user_id,method,amount,cash_account_id,cash_register_session_id,note) values(p_company_id,p_recipient_user_id,v_method,v_total,v_account_id,v_session_id,nullif(trim(coalesce(p_note,'')),'')) returning id into v_payout_id;
 for r in select * from public.bar_tip_allocations where company_id=p_company_id and recipient_user_id=p_recipient_user_id and status='EARNED' order by created_at,id for update loop
  insert into public.bar_tip_payout_items(payout_id,tip_allocation_id,amount) values(v_payout_id,r.id,r.amount);update public.bar_tip_allocations set status='PAID_OUT',paid_out_at=now() where id=r.id;
 end loop;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
 values(p_company_id,v_account_id,now(),'EXPENSE','TIP_PAYOUT',v_payout_id,'IDEALO BAR · liquidación de propinas',v_total,null,'Propinas liquidadas al colaborador '||p_recipient_user_id::text,v_session_id) returning id into v_move_id;
 update public.bar_tip_payouts set cash_movement_id=v_move_id where id=v_payout_id;
 return jsonb_build_object('payout_id',v_payout_id,'amount',v_total,'method',v_method,'recipient_user_id',p_recipient_user_id);
end;$$;
revoke execute on function public.bar_pay_tip_balance(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.bar_pay_tip_balance(uuid,uuid,text,uuid,text) to authenticated;

create or replace function public.bar_cash_close_preview(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s public.cash_register_sessions%rowtype;v_in numeric;v_out numeric;v_sales numeric;v_refunds numeric;v_tips numeric;v_manual_in numeric;v_manual_out numeric;v_pending int;v_open_orders int;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into s from public.cash_register_sessions where id=p_session;if not found then raise exception 'Turno de caja no encontrado.';end if;
 if not public.bar_has_permission(s.company_id,'cash.view') and not public.bar_has_permission(s.company_id,'cash.close') and not public.bar_has_permission(s.company_id,'admin.manage') then raise exception 'Sin permiso para revisar el cierre.'; end if;
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0),coalesce(sum(case when source_type='BAR_SALE' and movement_type='INCOME' then amount else 0 end),0),coalesce(sum(case when source_type='BAR_REFUND' and movement_type='EXPENSE' then amount else 0 end),0),coalesce(sum(case when source_type='TIP_PAYOUT' and movement_type='EXPENSE' then amount else 0 end),0),coalesce(sum(case when source_type='MANUAL' and movement_type='INCOME' then amount else 0 end),0),coalesce(sum(case when source_type='MANUAL' and movement_type='EXPENSE' then amount else 0 end),0)
 into v_in,v_out,v_sales,v_refunds,v_tips,v_manual_in,v_manual_out from public.cash_movements where cash_register_session_id=s.id;
 select count(*) into v_pending from public.bar_payments where cash_register_session_id=s.id and financial_posting_status<>'posted';select count(*) into v_open_orders from public.bar_orders where company_id=s.company_id and status not in ('paid','cancelled');
 return jsonb_build_object('session_id',s.id,'business_date',s.business_date,'status',s.status,'opening',s.opening_balance,'income_total',round(v_in,2),'expense_total',round(v_out,2),'cash_sales',round(v_sales,2),'cash_refunds',round(v_refunds,2),'tip_payouts',round(v_tips,2),'manual_income',round(v_manual_in,2),'manual_expense',round(v_manual_out,2),'expected',round(s.opening_balance+v_in-v_out,2),'pending_postings',v_pending,'open_orders',v_open_orders,'opened_at',s.opened_at,'opened_by',s.opened_by);
end;$$;
revoke execute on function public.bar_cash_close_preview(uuid) from public,anon;
grant execute on function public.bar_cash_close_preview(uuid) to authenticated;

create or replace function public.bar_close_cash_with_count(p_session uuid,p_counts jsonb default '[]'::jsonb,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.cash_register_sessions%rowtype;v_counted numeric:=0;v_in numeric:=0;v_out numeric:=0;v_expected numeric;v_diff numeric;v_pending int;v_open_sessions int;r jsonb;v_denom numeric;v_qty int;v_notes text:=nullif(trim(coalesce(p_notes,'')),'');
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into s from public.cash_register_sessions where id=p_session for update;if not found then raise exception 'Turno de caja no encontrado.';end if;
 if s.status<>'OPEN' then raise exception 'La caja ya está cerrada.'; end if;
 if not public.bar_has_permission(s.company_id,'cash.close') and not public.bar_has_permission(s.company_id,'admin.manage') then raise exception 'Tu rol no puede cerrar caja.'; end if;
 select count(*) into v_open_sessions from public.cash_register_sessions where company_id=s.company_id and status='OPEN';if v_open_sessions>1 and s.opened_by is distinct from auth.uid() and not public.bar_has_permission(s.company_id,'admin.manage') then raise exception 'Hay varias cajas abiertas. Solo podés cerrar tu propio turno.';end if;
 if jsonb_typeof(coalesce(p_counts,'[]'::jsonb))<>'array' then raise exception 'Conteo de efectivo inválido.'; end if;
 delete from public.bar_cash_count_lines where session_id=s.id;
 for r in select * from jsonb_array_elements(coalesce(p_counts,'[]'::jsonb)) loop
  v_denom:=round(coalesce((r->>'denomination')::numeric,0),2);v_qty:=coalesce((r->>'quantity')::int,0);if v_denom<=0 or v_qty<0 then raise exception 'Denominación o cantidad inválida.';end if;
  if v_qty>0 then insert into public.bar_cash_count_lines(session_id,company_id,denomination,quantity) values(s.id,s.company_id,v_denom,v_qty) on conflict(session_id,denomination) do update set quantity=excluded.quantity,created_by=auth.uid(),created_at=now();v_counted:=v_counted+v_denom*v_qty;end if;
 end loop;
 v_counted:=round(v_counted,2);
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0) into v_in,v_out from public.cash_movements where cash_register_session_id=s.id;
 v_expected:=round(s.opening_balance+v_in-v_out,2);v_diff:=round(v_counted-v_expected,2);
 select count(*) into v_pending from public.bar_payments where cash_register_session_id=s.id and financial_posting_status<>'posted';if v_pending>0 then raise exception 'No se puede cerrar: hay % cobro(s) pendientes de contabilizar.',v_pending;end if;
 if abs(v_diff)>=0.01 and v_notes is null then raise exception 'Hay una diferencia de %. Es obligatorio indicar el motivo antes de cerrar.',v_diff;end if;
 update public.cash_register_sessions set status='CLOSED',closing_counted=v_counted,closing_expected=v_expected,difference=v_diff,notes=v_notes,closed_at=now(),closed_by=auth.uid() where id=s.id;
 insert into public.cash_register_cuts(session_id,company_id,cash_account_id,expected_balance,income_total,expense_total,movement_count,created_by,notes)
 select s.id,s.company_id,s.cash_account_id,v_expected,v_in,v_out,count(*),auth.uid(),'CIERRE FINAL · contado '||to_char(v_counted,'FM999999990.00')||' · diferencia '||to_char(v_diff,'FM999999990.00') from public.cash_movements where cash_register_session_id=s.id;
 return jsonb_build_object('session_id',s.id,'expected',v_expected,'counted',v_counted,'difference',v_diff,'income_total',round(v_in,2),'expense_total',round(v_out,2),'closed',true);
end;$$;
revoke execute on function public.bar_close_cash_with_count(uuid,jsonb,text) from public,anon;
grant execute on function public.bar_close_cash_with_count(uuid,jsonb,text) to authenticated;

create or replace function public.bar_day_close_snapshot(p_company_id uuid,p_business_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_open_orders int;v_open_sessions int;v_pending int;v_sales numeric;v_tips numeric;v_refunds numeric;v_tip_payouts numeric;v_collected numeric;v_sessions jsonb;v_date date:=coalesce(p_business_date,current_date);
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Gerencia puede consultar el cierre consolidado.'; end if;
 select count(*) into v_open_orders from public.bar_orders where company_id=p_company_id and status not in ('paid','cancelled');select count(*) into v_open_sessions from public.cash_register_sessions where company_id=p_company_id and status='OPEN';select count(*) into v_pending from public.bar_payments where company_id=p_company_id and financial_posting_status<>'posted';
 select coalesce(sum(greatest(subtotal-discount_total,0)),0),coalesce(sum(tip_total),0) into v_sales,v_tips from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date=v_date;
 select coalesce(sum(merchandise_refund),0) into v_refunds from public.bar_refunds where company_id=p_company_id and status='COMPLETED' and (created_at at time zone 'America/El_Salvador')::date=v_date;select coalesce(sum(amount),0) into v_tip_payouts from public.bar_tip_payouts where company_id=p_company_id and (paid_at at time zone 'America/El_Salvador')::date=v_date;select coalesce(sum(amount),0) into v_collected from public.bar_payments where company_id=p_company_id and (created_at at time zone 'America/El_Salvador')::date=v_date;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'account_id',s.cash_account_id,'status',s.status,'opening',s.opening_balance,'expected',s.closing_expected,'counted',s.closing_counted,'difference',s.difference,'opened_by',s.opened_by,'closed_by',s.closed_by,'opened_at',s.opened_at,'closed_at',s.closed_at) order by s.opened_at),'[]'::jsonb) into v_sessions from public.cash_register_sessions s where s.company_id=p_company_id and s.business_date=v_date;
 return jsonb_build_object('business_date',v_date,'gross_sales',round(v_sales,2),'refunds',round(v_refunds,2),'net_sales',round(v_sales-v_refunds,2),'tips_earned',round(v_tips,2),'tip_payouts',round(v_tip_payouts,2),'gross_collected',round(v_collected,2),'open_orders',v_open_orders,'open_sessions',v_open_sessions,'pending_postings',v_pending,'ready',v_open_orders=0 and v_open_sessions=0 and v_pending=0,'sessions',v_sessions);
end;$$;
revoke execute on function public.bar_day_close_snapshot(uuid,date) from public,anon;
grant execute on function public.bar_day_close_snapshot(uuid,date) to authenticated;

create or replace function public.bar_finalize_day_close(p_company_id uuid,p_business_date date default current_date,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_snapshot jsonb;v_id uuid;v_date date:=coalesce(p_business_date,current_date);
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;if not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Propietario o Gerente puede cerrar el día.';end if;
 v_snapshot:=public.bar_day_close_snapshot(p_company_id,v_date);if not coalesce((v_snapshot->>'ready')::boolean,false) then raise exception 'El día todavía no puede cerrarse: revisá pedidos, cajas abiertas o cobros pendientes.';end if;
 insert into public.bar_day_closures(company_id,business_date,snapshot,notes) values(p_company_id,v_date,v_snapshot,nullif(trim(coalesce(p_notes,'')),'')) on conflict(company_id,business_date) do update set snapshot=excluded.snapshot,notes=excluded.notes,closed_by=auth.uid(),closed_at=now() returning id into v_id;
 return jsonb_build_object('day_closure_id',v_id,'snapshot',v_snapshot,'closed',true);
end;$$;
revoke execute on function public.bar_finalize_day_close(uuid,date,text) from public,anon;
grant execute on function public.bar_finalize_day_close(uuid,date,text) to authenticated;

create or replace function public.bar_advanced_profitability(p_company_id uuid,p_from date default current_date,p_to date default current_date)
returns jsonb language plpgsql stable set search_path to 'public' as $$
declare v_result jsonb;v_gross numeric;v_refunds numeric;v_tips numeric;v_tip_refunds numeric;v_orders int;
begin
 if not public.bar_can_view_management(p_company_id) then return '{}'::jsonb; end if;
 select coalesce(sum(greatest(subtotal-discount_total,0)),0),coalesce(sum(tip_total),0),count(*) into v_gross,v_tips,v_orders from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date between p_from and p_to;
 select coalesce(sum(merchandise_refund),0),coalesce(sum(tip_refund),0) into v_refunds,v_tip_refunds from public.bar_refunds where company_id=p_company_id and status='COMPLETED' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to;
 select jsonb_build_object(
  'summary',jsonb_build_object('sales',round(v_gross-v_refunds,2),'gross_sales',round(v_gross,2),'refunds',round(v_refunds,2),'tips',round(v_tips-v_tip_refunds,2),'orders',v_orders,'avg_ticket',case when v_orders>0 then round((v_gross-v_refunds)/v_orders,2) else 0 end,'discounts',coalesce((select sum(discount_total) from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date between p_from and p_to),0)),
  'by_hour',(select coalesce(jsonb_agg(jsonb_build_object('hour',h.hour_num,'sales',h.sales,'orders',h.orders) order by h.hour_num),'[]'::jsonb) from (select extract(hour from closed_at at time zone 'America/El_Salvador')::int hour_num,sum(greatest(subtotal-discount_total,0)) sales,count(*) orders from public.bar_orders where company_id=p_company_id and status='paid' and (closed_at at time zone 'America/El_Salvador')::date between p_from and p_to group by extract(hour from closed_at at time zone 'America/El_Salvador')::int) h),
  'tips_by_waiter',(select coalesce(jsonb_agg(jsonb_build_object('user_id',t.recipient_user_id,'tips',t.tips,'count',t.tip_count) order by t.tips desc),'[]'::jsonb) from (select recipient_user_id,sum(amount) tips,count(*) tip_count from public.bar_tip_allocations where company_id=p_company_id and status<>'VOID' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to group by recipient_user_id) t),
  'losses',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type in ('WASTE','DAMAGE') and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to),
  'courtesies',(select coalesce(sum(estimated_cost),0) from public.bar_inventory_events where company_id=p_company_id and event_type='COURTESY' and (created_at at time zone 'America/El_Salvador')::date between p_from and p_to)
 ) into v_result;
 return coalesce(v_result,'{}'::jsonb);
end;$$;

create or replace function public.bar_money_integrity(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_data jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;if not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then raise exception 'Solo Gerencia puede auditar dinero.';end if;
 select jsonb_build_object(
  'refunds_without_movement',(select count(*) from public.bar_refunds where company_id=p_company_id and status='COMPLETED' and cash_movement_id is null),
  'refund_amount_mismatch',(select count(*) from public.bar_refunds r where r.company_id=p_company_id and r.status='COMPLETED' and abs(r.merchandise_refund+r.tip_refund-r.amount)>0.01),
  'over_refunded_orders',(select count(*) from public.bar_orders o where o.company_id=p_company_id and coalesce((select sum(r.amount) from public.bar_refunds r where r.order_id=o.id and r.status='COMPLETED'),0)>o.total+0.01),
  'tip_payouts_without_movement',(select count(*) from public.bar_tip_payouts where company_id=p_company_id and cash_movement_id is null),
  'earned_tips_already_paid',(select count(*) from public.bar_tip_allocations a where a.company_id=p_company_id and a.status='EARNED' and exists(select 1 from public.bar_tip_payout_items pi where pi.tip_allocation_id=a.id)),
  'closed_cash_without_count',(select count(*) from public.cash_register_sessions s where s.company_id=p_company_id and s.status='CLOSED' and not exists(select 1 from public.bar_cash_count_lines l where l.session_id=s.id) and s.closed_at>=now()-interval '30 days')
 ) into v_data;return v_data;
end;$$;
revoke execute on function public.bar_money_integrity(uuid) from public,anon;
grant execute on function public.bar_money_integrity(uuid) to authenticated;
