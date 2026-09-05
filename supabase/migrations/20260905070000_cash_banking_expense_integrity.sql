-- Caja, bancos, anticipos, conciliaciones y gastos: permisos e integridad financiera.

-- RLS financiero: owner/admin escriben; owner/admin/viewer leen.
drop policy if exists cash_register_sessions_member_all on public.cash_register_sessions;
drop policy if exists cash_register_sessions_read on public.cash_register_sessions;
drop policy if exists cash_register_sessions_write on public.cash_register_sessions;
create policy cash_register_sessions_read on public.cash_register_sessions for select using (public.erp_can_read_finance(company_id));
create policy cash_register_sessions_write on public.cash_register_sessions for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

drop policy if exists cash_register_cuts_member_all on public.cash_register_cuts;
drop policy if exists cash_register_cuts_read on public.cash_register_cuts;
drop policy if exists cash_register_cuts_write on public.cash_register_cuts;
create policy cash_register_cuts_read on public.cash_register_cuts for select using (public.erp_can_read_finance(company_id));
create policy cash_register_cuts_write on public.cash_register_cuts for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

drop policy if exists "members manage cash reconciliations" on public.cash_reconciliations;
drop policy if exists cash_reconciliations_read on public.cash_reconciliations;
drop policy if exists cash_reconciliations_write on public.cash_reconciliations;
create policy cash_reconciliations_read on public.cash_reconciliations for select using (public.erp_can_read_finance(company_id));
create policy cash_reconciliations_write on public.cash_reconciliations for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

drop policy if exists "members view cash daily closures" on public.cash_daily_closures;
drop policy if exists cash_daily_closures_read on public.cash_daily_closures;
drop policy if exists cash_daily_closures_write on public.cash_daily_closures;
create policy cash_daily_closures_read on public.cash_daily_closures for select using (public.erp_can_read_finance(company_id));
create policy cash_daily_closures_write on public.cash_daily_closures for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

drop policy if exists "members manage cash transfers" on public.cash_transfers;
drop policy if exists cash_transfers_read on public.cash_transfers;
drop policy if exists cash_transfers_write on public.cash_transfers;
create policy cash_transfers_read on public.cash_transfers for select using (public.erp_can_read_finance(company_id));
create policy cash_transfers_write on public.cash_transfers for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

drop policy if exists "members manage cash adjustments" on public.cash_adjustments;
drop policy if exists cash_adjustments_read on public.cash_adjustments;
drop policy if exists cash_adjustments_write on public.cash_adjustments;
create policy cash_adjustments_read on public.cash_adjustments for select using (public.erp_can_read_finance(company_id));
create policy cash_adjustments_write on public.cash_adjustments for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

drop policy if exists customer_advances_member_all on public.customer_advances;
drop policy if exists customer_advances_read on public.customer_advances;
drop policy if exists customer_advances_write on public.customer_advances;
create policy customer_advances_read on public.customer_advances for select using (public.erp_can_read_finance(company_id));
create policy customer_advances_write on public.customer_advances for all using (public.erp_can_admin(company_id)) with check (public.erp_can_admin(company_id));

create or replace function public.register_cash_transfer(p_from uuid,p_to uuid,p_amount numeric,p_reference text default null,p_notes text default null,p_transfer_key uuid default gen_random_uuid()) returns uuid language plpgsql set search_path=public as $$
declare f public.cash_accounts%rowtype; t public.cash_accounts%rowtype; v_existing uuid; v_id uuid; v_balance numeric(12,2);
begin
 if p_from=p_to then raise exception 'La cuenta de origen y destino deben ser diferentes'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'El monto de transferencia debe ser mayor a cero'; end if;
 select * into f from public.cash_accounts where id=p_from and active=true for update;
 select * into t from public.cash_accounts where id=p_to and active=true for update;
 if f.id is null or t.id is null then raise exception 'Cuenta de origen o destino no disponible'; end if;
 if f.company_id<>t.company_id then raise exception 'Las cuentas deben pertenecer a la misma empresa'; end if;
 if not public.erp_can_admin(f.company_id) then raise exception 'Solo propietario o administrador puede transferir fondos'; end if;
 select id into v_existing from public.cash_transfers where company_id=f.company_id and transfer_key=p_transfer_key limit 1;
 if v_existing is not null then return v_existing; end if;
 select current_balance into v_balance from public.cash_account_balances where cash_account_id=f.id;
 if coalesce(v_balance,0)+0.001<p_amount then raise exception 'Saldo insuficiente en la cuenta de origen'; end if;
 insert into public.cash_transfers(company_id,from_account_id,to_account_id,amount,transfer_key,reference,notes) values(f.company_id,f.id,t.id,round(p_amount,2),p_transfer_key,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_id;
 insert into public.cash_movements(company_id,cash_account_id,movement_type,source_type,source_id,concept,amount,reference,notes) values
 (f.company_id,f.id,'TRANSFER_OUT','CASH_TRANSFER',v_id,'Transferencia a '||t.name,round(p_amount,2),p_reference,p_notes),
 (f.company_id,t.id,'TRANSFER_IN','CASH_TRANSFER',v_id,'Transferencia desde '||f.name,round(p_amount,2),p_reference,p_notes);
 return v_id;
end $$;

create or replace function public.register_cash_adjustment(p_cash_account uuid,p_direction text,p_amount numeric,p_reason text,p_adjustment_key uuid default gen_random_uuid()) returns uuid language plpgsql set search_path=public as $$
declare a public.cash_accounts%rowtype; v_id uuid; v_existing uuid; v_balance numeric(12,2); v_type text;
begin
 if p_direction not in ('INCREASE','DECREASE') then raise exception 'Dirección de ajuste inválida'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'El ajuste debe ser mayor a cero'; end if;
 if char_length(trim(coalesce(p_reason,'')))<4 then raise exception 'Indicá el motivo del ajuste'; end if;
 select * into a from public.cash_accounts where id=p_cash_account and active=true for update;
 if not found then raise exception 'Caja o banco no disponible'; end if;
 if not public.erp_can_admin(a.company_id) then raise exception 'Solo propietario o administrador puede ajustar saldos'; end if;
 select id into v_existing from public.cash_adjustments where company_id=a.company_id and adjustment_key=p_adjustment_key limit 1;
 if v_existing is not null then return v_existing; end if;
 select current_balance into v_balance from public.cash_account_balances where cash_account_id=a.id;
 if p_direction='DECREASE' and coalesce(v_balance,0)+0.001<p_amount then raise exception 'El ajuste dejaría saldo negativo'; end if;
 insert into public.cash_adjustments(company_id,cash_account_id,direction,amount,reason,adjustment_key) values(a.company_id,a.id,p_direction,round(p_amount,2),trim(p_reason),p_adjustment_key) returning id into v_id;
 v_type:=case when p_direction='INCREASE' then 'INCOME' else 'EXPENSE' end;
 insert into public.cash_movements(company_id,cash_account_id,movement_type,source_type,source_id,concept,amount,notes) values(a.company_id,a.id,v_type,'CASH_ADJUSTMENT',v_id,'Ajuste controlado de caja',round(p_amount,2),trim(p_reason));
 return v_id;
end $$;

create or replace function public.reconcile_cash_account(p_cash_account uuid,p_statement_balance numeric,p_date date default current_date,p_reference text default null,p_notes text default null) returns uuid language plpgsql set search_path=public as $$
declare a public.cash_accounts%rowtype; v_system numeric(12,2); v_id uuid; v_status text;
begin
 select * into a from public.cash_accounts where id=p_cash_account and active=true;
 if not found then raise exception 'Cuenta de caja o banco no encontrada'; end if;
 if not public.erp_can_admin(a.company_id) then raise exception 'Solo propietario o administrador puede conciliar'; end if;
 if p_statement_balance is null or p_statement_balance<0 then raise exception 'Saldo contado/bancario inválido'; end if;
 select round((a.opening_balance+coalesce(sum(case when m.movement_type in ('INCOME','TRANSFER_IN') then m.amount when m.movement_type in ('EXPENSE','TRANSFER_OUT') then -m.amount when m.movement_type='ADJUSTMENT' then m.amount else 0 end),0))::numeric,2) into v_system from public.cash_movements m where m.cash_account_id=a.id and m.company_id=a.company_id and m.movement_date::date<=p_date;
 v_system:=coalesce(v_system,a.opening_balance);
 v_status:=case when abs(p_statement_balance-v_system)<0.01 then 'MATCHED' else 'DIFFERENCE' end;
 insert into public.cash_reconciliations(company_id,cash_account_id,reconciliation_date,system_balance,statement_balance,status,reference,notes) values(a.company_id,a.id,p_date,v_system,round(p_statement_balance,2),v_status,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),'')) on conflict(company_id,cash_account_id,reconciliation_date) do update set system_balance=excluded.system_balance,statement_balance=excluded.statement_balance,status=excluded.status,reference=excluded.reference,notes=excluded.notes,updated_at=now() returning id into v_id;
 return v_id;
end $$;

create or replace function public.close_cash_reconciliation(p_reconciliation uuid,p_notes text default null) returns uuid language plpgsql set search_path=public as $$
declare r public.cash_reconciliations%rowtype;
begin
 select * into r from public.cash_reconciliations where id=p_reconciliation for update;
 if not found then raise exception 'Conciliación no encontrada'; end if;
 if not public.erp_can_admin(r.company_id) then raise exception 'Solo propietario o administrador puede cerrar conciliaciones'; end if;
 if r.status='CLOSED' then return r.id; end if;
 if r.status='CANCELLED' then raise exception 'Una conciliación anulada no puede cerrarse'; end if;
 if abs(r.difference)>=0.01 and char_length(trim(coalesce(p_notes,r.notes,'')))<4 then raise exception 'Explicá la diferencia antes de cerrar'; end if;
 update public.cash_reconciliations set status='CLOSED',notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes),closed_by=auth.uid(),closed_at=now(),updated_at=now() where id=r.id;
 return r.id;
end $$;

create or replace function public.close_cash_day(p_cash_account uuid,p_date date default current_date,p_notes text default null) returns uuid language plpgsql set search_path=public as $$
declare a public.cash_accounts%rowtype; v_id uuid; v_open numeric(12,2); v_in numeric(12,2); v_out numeric(12,2); v_close numeric(12,2); v_count integer;
begin
 select * into a from public.cash_accounts where id=p_cash_account and active=true;
 if not found then raise exception 'Cuenta no encontrada'; end if;
 if not public.erp_can_admin(a.company_id) then raise exception 'Solo propietario o administrador puede realizar cierres diarios'; end if;
 select round((a.opening_balance+coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount when movement_type in ('EXPENSE','TRANSFER_OUT') then -amount else 0 end),0))::numeric,2) into v_open from public.cash_movements where cash_account_id=a.id and company_id=a.company_id and movement_date::date<p_date;
 v_open:=coalesce(v_open,a.opening_balance);
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0),count(*) into v_in,v_out,v_count from public.cash_movements where cash_account_id=a.id and company_id=a.company_id and movement_date::date=p_date;
 v_close:=round((v_open+v_in-v_out)::numeric,2);
 insert into public.cash_daily_closures(company_id,cash_account_id,closure_date,opening_balance,income_total,expense_total,closing_balance,movement_count,notes) values(a.company_id,a.id,p_date,v_open,v_in,v_out,v_close,v_count,nullif(trim(coalesce(p_notes,'')),'')) on conflict(company_id,cash_account_id,closure_date) do update set opening_balance=excluded.opening_balance,income_total=excluded.income_total,expense_total=excluded.expense_total,closing_balance=excluded.closing_balance,movement_count=excluded.movement_count,notes=coalesce(excluded.notes,public.cash_daily_closures.notes) returning id into v_id;
 return v_id;
end $$;

-- Un solo RPC de anticipos, atómico e idempotente.
drop function if exists public.register_customer_advance(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz,text,text,text);
drop function if exists public.register_customer_advance(uuid,uuid,uuid,numeric,text,uuid,uuid,text,text,timestamptz,uuid);
create or replace function public.register_customer_advance(p_company_id uuid,p_client_id uuid,p_quote_id uuid,p_work_order_id uuid,p_cash_account_id uuid,p_amount numeric,p_received_at timestamptz,p_payment_method text,p_reference text,p_notes text,p_advance_key uuid default gen_random_uuid()) returns public.customer_advances language plpgsql set search_path=public as $$
declare a public.customer_advances; c public.cash_accounts%rowtype; q public.quotes%rowtype; w public.work_orders%rowtype; v_method text; v_session uuid;
begin
 if not public.erp_can_admin(p_company_id) then raise exception 'Solo propietario o administrador puede registrar anticipos'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'El anticipo debe ser mayor que cero'; end if;
 if not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id) then raise exception 'Cliente no válido para esta empresa'; end if;
 select * into c from public.cash_accounts where id=p_cash_account_id and company_id=p_company_id and active=true for update; if not found then raise exception 'Caja o banco no disponible'; end if;
 if upper(c.account_type) in ('CASH','CAJA','PETTY_CASH') then select id into v_session from public.cash_register_sessions where company_id=p_company_id and cash_account_id=c.id and status='OPEN' order by opened_at desc limit 1; if v_session is null then raise exception 'Caja cerrada. Abrí la caja antes de recibir efectivo'; end if; end if;
 if p_quote_id is not null then select * into q from public.quotes where id=p_quote_id and company_id=p_company_id; if not found or q.client_id is distinct from p_client_id then raise exception 'La cotización no pertenece al cliente seleccionado'; end if; end if;
 if p_work_order_id is not null then select * into w from public.work_orders where id=p_work_order_id and company_id=p_company_id; if not found then raise exception 'Orden de trabajo no válida'; end if; if p_quote_id is not null and w.quote_id is distinct from p_quote_id then raise exception 'La orden no pertenece a la cotización seleccionada'; end if; end if;
 select * into a from public.customer_advances where company_id=p_company_id and advance_key=p_advance_key limit 1; if found then return a; end if;
 v_method:=case when upper(coalesce(p_payment_method,'')) in ('CASH','TRANSFER','CARD','CHECK','OTHER') then upper(p_payment_method) else 'OTHER' end;
 insert into public.customer_advances(company_id,client_id,quote_id,work_order_id,cash_account_id,amount,received_at,payment_method,reference,notes,advance_key) values(p_company_id,p_client_id,p_quote_id,p_work_order_id,p_cash_account_id,round(p_amount,2),coalesce(p_received_at,now()),v_method,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_advance_key) returning * into a;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id) values(p_company_id,p_cash_account_id,a.received_at,'INCOME','CUSTOMER_ADVANCE',a.id,'Anticipo de cliente pendiente de aplicar',a.amount,a.reference,coalesce(a.notes,'Anticipo recibido antes de la facturación final.'),v_session) on conflict (company_id,source_type,source_id) where source_type='CUSTOMER_ADVANCE' and source_id is not null do nothing;
 return a;
end $$;

-- Un gasto no puede dejar Caja/Banco negativo y el efectivo requiere caja abierta.
create or replace function public.post_business_expense_to_cash() returns trigger language plpgsql security definer set search_path=public as $$
declare v_account public.cash_accounts%rowtype; v_balance numeric; v_session uuid;
begin
 if new.cash_account_id is null then raise exception 'Selecciona de qué Caja o Banco sale el gasto'; end if;
 select * into v_account from public.cash_accounts where id=new.cash_account_id and company_id=new.company_id and active=true for update;
 if not found then raise exception 'La cuenta de caja/banco seleccionada no es válida o no está activa'; end if;
 select current_balance into v_balance from public.cash_account_balances where cash_account_id=v_account.id;
 if coalesce(v_balance,0)+0.001<new.amount then raise exception 'Saldo insuficiente en %. Disponible: %',v_account.name,coalesce(v_balance,0); end if;
 if upper(v_account.account_type) in ('CASH','CAJA','PETTY_CASH') then select id into v_session from public.cash_register_sessions where company_id=new.company_id and cash_account_id=v_account.id and status='OPEN' order by opened_at desc limit 1; if v_session is null then raise exception 'Caja cerrada. Abrí la caja antes de registrar este gasto en efectivo'; end if; end if;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id) values(new.company_id,new.cash_account_id,new.expense_date::timestamp+time '12:00:00','EXPENSE','EXPENSE',new.id,new.concept,new.amount,new.reference,new.notes,v_session) on conflict do nothing;
 return new;
end $$;
revoke all on function public.post_business_expense_to_cash() from public,anon,authenticated;
revoke all on function public.reverse_voided_business_expense() from public,anon,authenticated;

-- Integridad de apertura/corte/cierre incluso si el cliente intenta escritura directa.
create or replace function public.enforce_cash_register_session_integrity() returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare a public.cash_accounts%rowtype; v_balance numeric; v_in numeric; v_out numeric; v_expected numeric;
begin
 if tg_op='INSERT' then
   select * into a from public.cash_accounts where id=new.cash_account_id and company_id=new.company_id and active=true and upper(account_type)<>'BANK' for update;
   if not found then raise exception 'Caja no disponible'; end if;
   if not public.erp_can_admin(new.company_id) then raise exception 'Solo propietario o administrador puede abrir caja'; end if;
   if new.status<>'OPEN' then raise exception 'Un turno nuevo debe iniciar abierto'; end if;
   select current_balance into v_balance from public.cash_account_balances where cash_account_id=a.id;
   if new.opening_balance<0 then raise exception 'Efectivo inicial inválido'; end if;
   if abs(round(new.opening_balance,2)-round(coalesce(v_balance,0),2))>=0.01 then raise exception 'El efectivo inicial debe coincidir con el saldo actual de la caja (%)',round(coalesce(v_balance,0),2); end if;
   new.opening_balance:=round(new.opening_balance,2); new.opened_by:=auth.uid(); return new;
 end if;
 if old.status='CLOSED' then if new is distinct from old then raise exception 'Un turno cerrado no puede modificarse'; end if; return new; end if;
 if not public.erp_can_admin(old.company_id) then raise exception 'Solo propietario o administrador puede modificar caja'; end if;
 if new.company_id is distinct from old.company_id or new.cash_account_id is distinct from old.cash_account_id or new.opening_balance is distinct from old.opening_balance or new.business_date is distinct from old.business_date then raise exception 'No se puede alterar empresa, caja, fecha o apertura de un turno iniciado'; end if;
 if new.status='CLOSED' and old.status='OPEN' then
   if new.closing_counted is null or new.closing_counted<0 then raise exception 'Efectivo contado inválido'; end if;
   select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0) into v_in,v_out from public.cash_movements where company_id=old.company_id and cash_register_session_id=old.id;
   v_expected:=round(old.opening_balance+v_in-v_out,2); new.closing_expected:=v_expected; new.closing_counted:=round(new.closing_counted,2); new.difference:=round(new.closing_counted-v_expected,2); new.closed_at:=coalesce(new.closed_at,now()); new.closed_by:=auth.uid();
 elsif new.status<>old.status then raise exception 'Cambio de estado de caja no permitido'; end if;
 return new;
end $$;
revoke all on function public.enforce_cash_register_session_integrity() from public,anon,authenticated;
drop trigger if exists trg_enforce_cash_register_session_integrity on public.cash_register_sessions;
create trigger trg_enforce_cash_register_session_integrity before insert or update on public.cash_register_sessions for each row execute function public.enforce_cash_register_session_integrity();

create or replace function public.enforce_cash_register_cut_integrity() returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare s public.cash_register_sessions%rowtype; v_in numeric; v_out numeric; v_count integer;
begin
 select * into s from public.cash_register_sessions where id=new.session_id for update;
 if not found then raise exception 'Turno de caja no encontrado'; end if;
 if s.status<>'OPEN' then raise exception 'No se puede hacer un corte de una caja cerrada'; end if;
 if not public.erp_can_admin(s.company_id) then raise exception 'Solo propietario o administrador puede hacer cortes'; end if;
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0),count(*) into v_in,v_out,v_count from public.cash_movements where company_id=s.company_id and cash_register_session_id=s.id;
 new.company_id:=s.company_id; new.cash_account_id:=s.cash_account_id; new.income_total:=v_in; new.expense_total:=v_out; new.movement_count:=v_count; new.expected_balance:=round(s.opening_balance+v_in-v_out,2); new.created_by:=auth.uid(); return new;
end $$;
revoke all on function public.enforce_cash_register_cut_integrity() from public,anon,authenticated;
drop trigger if exists trg_enforce_cash_register_cut_integrity on public.cash_register_cuts;
create trigger trg_enforce_cash_register_cut_integrity before insert on public.cash_register_cuts for each row execute function public.enforce_cash_register_cut_integrity();

-- Nuevas funciones de caja quedan expuestas solo a usuarios autenticados.
do $$ declare r record; begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('register_cash_transfer','register_cash_adjustment','reconcile_cash_account','close_cash_reconciliation','close_cash_day','register_customer_advance') loop
   execute format('revoke all on function %s from public, anon',r.sig);
   execute format('grant execute on function %s to authenticated',r.sig);
 end loop;
end $$;
