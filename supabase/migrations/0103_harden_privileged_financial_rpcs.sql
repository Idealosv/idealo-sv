do $$
declare r record;
begin
 for r in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
  execute format('revoke execute on function %I.%I(%s) from public',r.nspname,r.proname,r.args);
 end loop;
end $$;

create or replace function public.reverse_dte_cash_collection(p_dte uuid,p_reason text,p_reversal_key uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare d public.dte_documents%rowtype; m public.cash_movements%rowtype; v_existing uuid; v_id uuid;
begin
 if char_length(trim(coalesce(p_reason,'')))<4 then raise exception 'Indicá el motivo de la reversión'; end if;
 select * into d from public.dte_documents where id=p_dte for share;
 if not found then raise exception 'DTE no encontrado'; end if;
 if not public.erp_can_admin(d.company_id) then raise exception 'Solo propietario o administrador puede revertir el cobro de un DTE'; end if;
 if d.environment<>'production' or d.status<>'PROCESSED' then raise exception 'Solo se puede revertir el cobro de un DTE de producción aceptado'; end if;
 select * into m from public.cash_movements where company_id=d.company_id and source_type='CUSTOMER_PAYMENT' and source_id=d.id limit 1;
 if not found then raise exception 'Este DTE no tiene cobro directo en Caja/Banco para revertir'; end if;
 select id into v_existing from public.cash_movements where company_id=d.company_id and source_type='CUSTOMER_PAYMENT_REVERSAL' and source_id=d.id limit 1;
 if v_existing is not null then return v_existing; end if;
 insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
 values(d.company_id,m.cash_account_id,now(),'EXPENSE','CUSTOMER_PAYMENT_REVERSAL',d.id,'Reversión cobro DTE '||d.control_number,m.amount,m.reference,'Reversión DTE: '||trim(p_reason)) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.reverse_dte_cash_collection(uuid,text,uuid) from public,anon;
grant execute on function public.reverse_dte_cash_collection(uuid,text,uuid) to authenticated;

create or replace function public.void_purchase(p_purchase_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_purchase public.purchases%rowtype;v_move public.cash_movements%rowtype;v_reversal_id uuid;v_paid numeric:=0;
begin
 if nullif(btrim(p_reason),'') is null then raise exception 'Debes indicar el motivo de la anulación.'; end if;
 select * into v_purchase from public.purchases where id=p_purchase_id for update;
 if v_purchase.id is null then raise exception 'La compra no existe.'; end if;
 if not public.erp_can_admin(v_purchase.company_id) then raise exception 'Solo propietario o administrador puede anular esta compra.'; end if;
 if v_purchase.voided_at is not null then return jsonb_build_object('ok',true,'already_voided',true,'reversal_id',v_purchase.void_reversal_id); end if;
 select coalesce(amount_paid,0) into v_paid from public.accounts_payable where purchase_id=v_purchase.id limit 1;
 if v_purchase.payment_status='PARTIAL' and coalesce(v_paid,0)>0 then raise exception 'La compra tiene pagos parciales aplicados. Anula primero esos pagos antes de anular la compra.'; end if;
 select * into v_move from public.cash_movements where company_id=v_purchase.company_id and source_type='PURCHASE' and source_id=v_purchase.id order by movement_date desc limit 1;
 if v_move.id is not null then
  insert into public.cash_movements(company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes)
  values(v_purchase.company_id,v_move.cash_account_id,now(),'INCOME','PURCHASE_REVERSAL',v_purchase.id,'Anulación compra: '||v_purchase.concept,v_move.amount,v_purchase.document_number,'Motivo: '||btrim(p_reason))
  on conflict (source_type,source_id) where source_id is not null do update set notes=excluded.notes returning id into v_reversal_id;
 end if;
 update public.purchases set payment_status='CANCELLED',procurement_status='CANCELLED',void_reason=btrim(p_reason),voided_at=now(),voided_by=auth.uid(),void_reversal_id=v_reversal_id,updated_at=now() where id=v_purchase.id;
 update public.accounts_payable set status='CANCELLED',updated_at=now() where purchase_id=v_purchase.id;
 return jsonb_build_object('ok',true,'reversed_amount',coalesce(v_move.amount,0),'reversal_id',v_reversal_id);
end $$;
revoke all on function public.void_purchase(uuid,text) from public,anon;
grant execute on function public.void_purchase(uuid,text) to authenticated;
