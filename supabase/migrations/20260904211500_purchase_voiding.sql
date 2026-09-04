alter table public.purchases
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reversal_id uuid references public.cash_movements(id) on delete set null;

alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check
  check (source_type = any (array[
    'MANUAL'::text,'CUSTOMER_PAYMENT'::text,'CUSTOMER_PAYMENT_REVERSAL'::text,
    'CUSTOMER_ADVANCE'::text,'PURCHASE'::text,'PURCHASE_REVERSAL'::text,
    'EXPENSE'::text,'EXPENSE_REVERSAL'::text,'CASH_TRANSFER'::text,
    'CASH_ADJUSTMENT'::text,'OTHER'::text
  ]));

create or replace function public.void_purchase(p_purchase_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_move public.cash_movements%rowtype;
  v_reversal_id uuid;
  v_paid numeric := 0;
begin
  if nullif(btrim(p_reason),'') is null then
    raise exception 'Debes indicar el motivo de la anulación.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'La compra no existe.';
  end if;

  if not public.is_company_member(v_purchase.company_id) then
    raise exception 'No tienes permiso para anular esta compra.';
  end if;

  if v_purchase.voided_at is not null then
    return jsonb_build_object('ok',true,'already_voided',true,'reversal_id',v_purchase.void_reversal_id);
  end if;

  select coalesce(amount_paid,0) into v_paid
  from public.accounts_payable
  where purchase_id = v_purchase.id
  limit 1;

  if v_purchase.payment_status = 'PARTIAL' and coalesce(v_paid,0) > 0 then
    raise exception 'La compra tiene pagos parciales aplicados. Anula primero esos pagos antes de anular la compra.';
  end if;

  select * into v_move
  from public.cash_movements
  where company_id = v_purchase.company_id
    and source_type = 'PURCHASE'
    and source_id = v_purchase.id
  order by movement_date desc
  limit 1;

  if v_move.id is not null then
    insert into public.cash_movements(
      company_id,cash_account_id,movement_date,movement_type,source_type,source_id,
      concept,amount,reference,notes
    ) values (
      v_purchase.company_id,v_move.cash_account_id,now(),'INCOME','PURCHASE_REVERSAL',v_purchase.id,
      'Anulación compra: ' || v_purchase.concept,v_move.amount,v_purchase.document_number,
      'Motivo: ' || btrim(p_reason)
    )
    on conflict (source_type, source_id) where source_id is not null
    do update set notes = excluded.notes
    returning id into v_reversal_id;
  end if;

  update public.purchases
  set payment_status='CANCELLED',
      procurement_status='CANCELLED',
      void_reason=btrim(p_reason),
      voided_at=now(),
      voided_by=auth.uid(),
      void_reversal_id=v_reversal_id,
      updated_at=now()
  where id=v_purchase.id;

  update public.accounts_payable
  set status='CANCELLED', updated_at=now()
  where purchase_id=v_purchase.id;

  return jsonb_build_object(
    'ok',true,
    'reversed_amount',coalesce(v_move.amount,0),
    'reversal_id',v_reversal_id
  );
end;
$$;

revoke all on function public.void_purchase(uuid,text) from public;
grant execute on function public.void_purchase(uuid,text) to authenticated;
