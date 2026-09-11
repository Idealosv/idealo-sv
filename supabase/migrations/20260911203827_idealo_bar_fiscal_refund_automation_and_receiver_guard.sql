-- IDEALO BAR · validación del receptor fiscal y preparación automática de devoluciones.

create or replace function public.bar_guard_fiscal_receiver_payload()
returns trigger language plpgsql set search_path to 'public' as $$
declare r jsonb;
begin
 if new.dte_type not in ('03','05') then return new; end if;
 r:=new.dte_payload->'receptor';
 if r is null or jsonb_typeof(r)<>'object' then raise exception 'DTE_RECEIVER_REQUIRED: CCF/Nota de Crédito requiere receptor fiscal.'; end if;
 if nullif(trim(coalesce(r->>'nit','')),'') is null then raise exception 'DTE_RECEIVER_NIT_REQUIRED'; end if;
 if nullif(trim(coalesce(r->>'nrc','')),'') is null then raise exception 'DTE_RECEIVER_NRC_REQUIRED'; end if;
 if nullif(trim(coalesce(r->>'nombre','')),'') is null then raise exception 'DTE_RECEIVER_NAME_REQUIRED'; end if;
 if nullif(trim(coalesce(r->>'codActividad','')),'') is null then raise exception 'DTE_RECEIVER_ACTIVITY_REQUIRED'; end if;
 if nullif(trim(coalesce(r#>>'{direccion,departamento}','')),'') is null
    or nullif(trim(coalesce(r#>>'{direccion,municipio}','')),'') is null
    or nullif(trim(coalesce(r#>>'{direccion,complemento}','')),'') is null then
  raise exception 'DTE_RECEIVER_ADDRESS_REQUIRED';
 end if;
 return new;
end;$$;

drop trigger if exists bar_guard_fiscal_receiver_payload_trg on public.dte_documents;
create trigger bar_guard_fiscal_receiver_payload_trg
before insert or update of dte_payload,dte_type on public.dte_documents
for each row execute function public.bar_guard_fiscal_receiver_payload();

-- Cada devolución nueva intenta dejar preparada su consecuencia fiscal en la misma operación.
-- Si la preparación fiscal falla, el reembolso financiero permanece y queda marcado para revisión.
create or replace function public.bar_auto_prepare_refund_fiscal_action()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_error text;
begin
 if new.status='COMPLETED' and new.amount>0 and coalesce(old.amount,0)=0 then
  begin
   perform public.bar_prepare_refund_fiscal_action(new.id);
  exception when others then
   v_error:=sqlerrm;
   update public.bar_refunds
   set fiscal_status='REVIEW_REQUIRED',updated_at=now()
   where id=new.id;

   insert into public.bar_refund_fiscal_actions(
    company_id,refund_id,order_id,original_dte_id,action_type,status,reason,details,created_by,updated_at
   ) values(
    new.company_id,new.id,new.order_id,new.dte_document_id,'PREPARATION_ERROR','PENDING',new.reason,
    jsonb_build_object('message','La devolución fue registrada, pero la preparación fiscal requiere revisión.','error',left(v_error,500)),
    auth.uid(),now()
   )
   on conflict(refund_id) do update
   set action_type='PREPARATION_ERROR',status='PENDING',details=excluded.details,updated_at=now();
  end;
 end if;
 return new;
end;$$;

drop trigger if exists bar_auto_prepare_refund_fiscal_action_trg on public.bar_refunds;
create trigger bar_auto_prepare_refund_fiscal_action_trg
after update of amount on public.bar_refunds
for each row execute function public.bar_auto_prepare_refund_fiscal_action();

revoke execute on function public.bar_auto_prepare_refund_fiscal_action() from public,anon,authenticated;
