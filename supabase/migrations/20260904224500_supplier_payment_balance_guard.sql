create or replace function public.register_supplier_payment(p_payable uuid, p_cash_account uuid, p_amount numeric, p_payment_method text default 'CASH'::text, p_reference text default null::text, p_notes text default null::text, p_payment_key uuid default gen_random_uuid()) returns uuid language plpgsql set search_path to 'public' as $$
declare ap public.accounts_payable%rowtype; ca public.cash_accounts%rowtype; v_balance numeric(12,2); v_account_balance numeric(12,2); v_existing uuid; v_payment uuid; v_type text;
begin
  if p_payment_key is null then raise exception 'Falta clave idempotente del pago'; end if;
  select id into v_existing from public.supplier_payments where company_id=(select company_id from public.accounts_payable where id=p_payable) and payment_key=p_payment_key;
  if v_existing is not null then return v_existing; end if;
  select * into ap from public.accounts_payable where id=p_payable for update;
  if not found then raise exception 'Cuenta por pagar no encontrada'; end if;
  if not public.is_company_member(ap.company_id) then raise exception 'Sin acceso a esta empresa'; end if;
  if ap.status in ('PAID','CANCELLED') then raise exception 'La cuenta por pagar no admite nuevos pagos'; end if;
  select * into ca from public.cash_accounts where id=p_cash_account and company_id=ap.company_id and active=true for update;
  if not found then raise exception 'Caja o banco no disponible'; end if;
  v_balance:=greatest(ap.amount_total-ap.amount_paid,0);
  if coalesce(p_amount,0)<=0 or p_amount>v_balance+0.001 then raise exception 'Monto inválido. Saldo pendiente: %',v_balance; end if;
  select coalesce(current_balance,0) into v_account_balance from public.cash_account_balances where cash_account_id=ca.id;
  if coalesce(v_account_balance,0)+0.001<p_amount then raise exception 'Saldo insuficiente en %. Disponible: %',ca.name,coalesce(v_account_balance,0); end if;
  v_type:=upper(coalesce(ca.account_type,''));
  if v_type in ('CASH','CAJA') and not exists(select 1 from public.cash_register_sessions s where s.company_id=ap.company_id and s.cash_account_id=ca.id and s.status='OPEN') then raise exception 'Caja cerrada. Primero debes abrir la caja antes de registrar este pago en efectivo.'; end if;
  insert into public.supplier_payments(company_id,payable_id,supplier_id,cash_account_id,amount,payment_method,reference,notes,payment_key)
  values(ap.company_id,ap.id,ap.supplier_id,ca.id,p_amount,case when p_payment_method in ('CASH','TRANSFER','CARD','CHECK','OTHER') then p_payment_method else 'OTHER' end,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_payment_key) returning id into v_payment;
  return v_payment;
end; $$;
