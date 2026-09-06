create or replace function public.register_internal_income(p_company_id uuid,p_cash_account_id uuid,p_amount numeric,p_concept text,p_received_at timestamptz default now(),p_payment_method text default 'CASH',p_client_id uuid default null,p_reference text default null,p_notes text default null,p_quote_id uuid default null,p_work_order_id uuid default null)
returns public.internal_income_records language plpgsql security definer set search_path=public as $$
declare
 r public.internal_income_records; a public.cash_accounts%rowtype; q public.quotes%rowtype; w public.work_orders%rowtype;
 v_method text; v_session uuid; v_session_opened timestamptz; v_total numeric; v_paid numeric; v_received_at timestamptz;
begin
 if not public.erp_can_admin(p_company_id) then raise exception 'Solo propietario o administrador puede registrar ingresos internos'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'El monto debe ser mayor que cero'; end if;
 if nullif(trim(coalesce(p_concept,'')),'') is null then raise exception 'Escribe el concepto del ingreso'; end if;
 select * into a from public.cash_accounts where id=p_cash_account_id and company_id=p_company_id and active=true for update;
 if not found then raise exception 'Caja o banco no disponible'; end if;
 if p_client_id is not null and not exists(select 1 from public.clients where id=p_client_id and company_id=p_company_id) then raise exception 'Cliente no válido para esta empresa'; end if;
 if p_quote_id is not null then
   select * into q from public.quotes where id=p_quote_id and company_id=p_company_id;
   if not found then raise exception 'Cotización no válida'; end if;
   if p_client_id is not null and q.client_id is distinct from p_client_id then raise exception 'La cotización no pertenece al cliente seleccionado'; end if;
 end if;
 if p_work_order_id is not null then
   select * into w from public.work_orders where id=p_work_order_id and company_id=p_company_id;
   if not found then raise exception 'OT no válida'; end if;
   if p_quote_id is not null and w.quote_id is distinct from p_quote_id then raise exception 'La OT no pertenece a la cotización seleccionada'; end if;
   if p_client_id is not null and w.client_id is distinct from p_client_id then raise exception 'La OT no pertenece al cliente seleccionado'; end if;
 end if;
 v_received_at:=coalesce(p_received_at,now());
 if upper(coalesce(a.account_type,'')) in ('CASH','CAJA','PETTY_CASH') then
   select id,opened_at into v_session,v_session_opened from public.cash_register_sessions
   where company_id=p_company_id and cash_account_id=a.id and status='OPEN'
   order by opened_at desc limit 1;
   if v_session is null then raise exception 'Caja cerrada. Abre la caja antes de registrar el ingreso'; end if;
   if (v_received_at at time zone 'America/El_Salvador')::date=(now() at time zone 'America/El_Salvador')::date then
     v_received_at:=now();
   elsif v_received_at < v_session_opened then
     raise exception 'La fecha del ingreso es anterior a la apertura de la caja';
   end if;
 end if;
 if p_work_order_id is not null then v_total:=coalesce(w.total,0); elsif p_quote_id is not null then v_total:=coalesce(q.total,0); else v_total:=null; end if;
 if v_total is not null and v_total>0 then
   select coalesce(sum(amount),0) into v_paid from public.internal_income_records
   where company_id=p_company_id and ((p_work_order_id is not null and work_order_id=p_work_order_id) or (p_work_order_id is null and p_quote_id is not null and quote_id=p_quote_id and work_order_id is null));
   if v_paid+round(p_amount,2)>v_total+0.009 then raise exception 'El pago supera el saldo pendiente del trabajo'; end if;
 end if;
 v_method:=case when upper(coalesce(p_payment_method,'')) in ('CASH','TRANSFER','CARD','CHECK','OTHER') then upper(p_payment_method) else 'OTHER' end;
 insert into public.internal_income_records(company_id,client_id,cash_account_id,received_at,concept,amount,payment_method,reference,notes,fiscal_status,created_by,quote_id,work_order_id)
 values(p_company_id,p_client_id,p_cash_account_id,v_received_at,trim(p_concept),round(p_amount,2),v_method,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),'NO_DTE_ISSUED',auth.uid(),p_quote_id,p_work_order_id)
 returning * into r;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id)
 values(p_company_id,p_cash_account_id,r.received_at,'INCOME','INTERNAL_INCOME',r.id,'Ingreso interno · '||r.concept,r.amount,r.reference,coalesce(r.notes,'Registrado internamente sin DTE emitido.'),v_session);
 return r;
end $$;
