-- IDEALO BAR · flujo fiscal de devoluciones y ajustes DTE.

create table if not exists public.bar_refund_fiscal_actions(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 refund_id uuid not null unique references public.bar_refunds(id) on delete cascade,
 order_id uuid not null references public.bar_orders(id) on delete restrict,
 original_dte_id uuid references public.dte_documents(id) on delete restrict,
 adjustment_dte_id uuid references public.dte_documents(id) on delete restrict,
 action_type text not null,
 status text not null default 'PENDING',
 reason text,
 details jsonb not null default '{}'::jsonb,
 resolved_at timestamptz,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists bar_refund_fiscal_actions_company_status_idx on public.bar_refund_fiscal_actions(company_id,status,created_at desc);
create index if not exists bar_refund_fiscal_actions_order_idx on public.bar_refund_fiscal_actions(order_id);
create index if not exists bar_refund_fiscal_actions_original_dte_idx on public.bar_refund_fiscal_actions(original_dte_id);
create index if not exists bar_refund_fiscal_actions_adjustment_dte_idx on public.bar_refund_fiscal_actions(adjustment_dte_id);
alter table public.bar_refund_fiscal_actions enable row level security;
drop policy if exists bar_refund_fiscal_actions_read on public.bar_refund_fiscal_actions;
create policy bar_refund_fiscal_actions_read on public.bar_refund_fiscal_actions for select to authenticated using(
 public.bar_has_permission(company_id,'payment.take') or public.bar_has_permission(company_id,'admin.view') or public.bar_has_permission(company_id,'admin.manage')
);

-- Si una devolución existe antes de emitir el DTE, el borrador fiscal se recalcula por el saldo realmente vendido.
create or replace function public.bar_refresh_sale_dte_for_refunds(p_document_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
 d public.dte_documents%rowtype;
 o public.bar_orders%rowtype;
 v_items jsonb;
 v_payload jsonb;
 v_fiscal_total numeric:=0;
 v_discount numeric:=0;
 v_tax_base numeric:=0;
 v_iva numeric:=0;
 v_refunded numeric:=0;
begin
 select * into d from public.dte_documents where id=p_document_id for update;
 if not found then raise exception 'DTE no encontrado.'; end if;
 if d.status<>'DRAFT' or d.bar_order_id is null or d.dte_type not in ('01','03') then return d.id; end if;
 select * into o from public.bar_orders where id=d.bar_order_id;
 if not found then return d.id; end if;
 select round(coalesce(sum(merchandise_refund),0),2) into v_refunded
 from public.bar_refunds where order_id=o.id and status='COMPLETED';
 if v_refunded<=0 then return d.id; end if;

 if d.dte_type='01' then
  select coalesce(jsonb_agg(jsonb_build_object(
    'numItem',x.rn,'tipoItem',2,'numeroDocumento',null,'codigo',x.product_id::text,'codTributo',null,
    'descripcion',x.item_name,'cantidad',x.remaining_qty,'uniMedida',59,'precioUni',round(x.unit_price,2),
    'montoDescu',x.remaining_discount,'ventaNoSuj',0,'ventaExenta',0,'ventaGravada',x.remaining_net,
    'tributos',null,'psv',0,'noGravado',0,'ivaItem',round(x.remaining_net-(x.remaining_net/1.13),2)
   ) order by x.rn),'[]'::jsonb),
   round(coalesce(sum(x.remaining_net),0),2),round(coalesce(sum(x.remaining_discount),0),2)
  into v_items,v_fiscal_total,v_discount
  from(
   select row_number() over(order by i.created_at,i.id) rn,i.product_id,i.item_name,i.unit_price,
    round(greatest(i.quantity-coalesce(r.ref_qty,0),0),3) remaining_qty,
    round(greatest((coalesce(i.line_total,0)-case when coalesce(o.subtotal,0)>0 then o.discount_total*(coalesce(i.line_total,0)/o.subtotal) else 0 end)-coalesce(r.ref_amount,0),0),2) remaining_net,
    round(greatest((coalesce(i.line_total,0)*(greatest(i.quantity-coalesce(r.ref_qty,0),0)/greatest(i.quantity,0.000001)))-greatest((coalesce(i.line_total,0)-case when coalesce(o.subtotal,0)>0 then o.discount_total*(coalesce(i.line_total,0)/o.subtotal) else 0 end)-coalesce(r.ref_amount,0),0),0),2) remaining_discount
   from public.bar_order_items i
   left join lateral(
    select coalesce(sum(ri.quantity),0) ref_qty,coalesce(sum(ri.amount),0) ref_amount
    from public.bar_refund_items ri join public.bar_refunds rf on rf.id=ri.refund_id
    where ri.order_item_id=i.id and rf.status='COMPLETED'
   ) r on true
   where i.order_id=o.id and i.status<>'cancelled' and i.quantity-coalesce(r.ref_qty,0)>0.0001
  )x;
  if v_fiscal_total<=0 then raise exception 'La venta quedó completamente devuelta; no existe monto fiscal pendiente para emitir DTE.'; end if;
  v_iva:=round(v_fiscal_total-(v_fiscal_total/1.13),2);
  v_payload:=jsonb_set(d.dte_payload,'{cuerpoDocumento}',v_items,true);
  v_payload:=jsonb_set(v_payload,'{resumen}',coalesce(v_payload->'resumen','{}'::jsonb)||jsonb_build_object(
    'totalNoSuj',0,'totalExenta',0,'totalGravada',v_fiscal_total,'subTotalVentas',v_fiscal_total,
    'descuNoSuj',0,'descuExenta',0,'descuGravada',v_discount,'totalDescu',v_discount,
    'subTotal',v_fiscal_total,'ivaRete',0,'montoTotalOperacion',v_fiscal_total,'totalNoGravado',0,
    'totalPagar',v_fiscal_total,'totalLetras',public.bar_money_words(v_fiscal_total),'totalIva',v_iva,'saldoFavor',0,
    'condicionOperacion',1,'pagos',jsonb_build_array(jsonb_build_object('codigo','01','montoPago',v_fiscal_total,'referencia',o.order_code,'plazo',null,'periodo',null))
   ),true);
 else
  select coalesce(jsonb_agg(jsonb_build_object(
    'numItem',x.rn,'tipoItem',2,'numeroDocumento',null,'codigo',x.product_id::text,'codTributo',null,
    'descripcion',x.item_name,'cantidad',x.remaining_qty,'uniMedida',59,'precioUni',round(x.unit_price/1.13,2),
    'montoDescu',round(x.remaining_discount/1.13,2),'ventaNoSuj',0,'ventaExenta',0,'ventaGravada',x.tax_base,
    'tributos',jsonb_build_array('20'),'psv',0,'noGravado',0
   ) order by x.rn),'[]'::jsonb),
   round(coalesce(sum(x.remaining_net),0),2),round(coalesce(sum(x.remaining_discount),0),2),
   round(coalesce(sum(x.tax_base),0),2),round(coalesce(sum(x.item_iva),0),2)
  into v_items,v_fiscal_total,v_discount,v_tax_base,v_iva
  from(
   select y.*,round(y.remaining_net/1.13,2) tax_base,round(y.remaining_net-round(y.remaining_net/1.13,2),2) item_iva
   from(
    select row_number() over(order by i.created_at,i.id) rn,i.product_id,i.item_name,i.unit_price,
     round(greatest(i.quantity-coalesce(r.ref_qty,0),0),3) remaining_qty,
     round(greatest((coalesce(i.line_total,0)-case when coalesce(o.subtotal,0)>0 then o.discount_total*(coalesce(i.line_total,0)/o.subtotal) else 0 end)-coalesce(r.ref_amount,0),0),2) remaining_net,
     round(greatest((coalesce(i.line_total,0)*(greatest(i.quantity-coalesce(r.ref_qty,0),0)/greatest(i.quantity,0.000001)))-greatest((coalesce(i.line_total,0)-case when coalesce(o.subtotal,0)>0 then o.discount_total*(coalesce(i.line_total,0)/o.subtotal) else 0 end)-coalesce(r.ref_amount,0),0),0),2) remaining_discount
    from public.bar_order_items i
    left join lateral(
     select coalesce(sum(ri.quantity),0) ref_qty,coalesce(sum(ri.amount),0) ref_amount
     from public.bar_refund_items ri join public.bar_refunds rf on rf.id=ri.refund_id
     where ri.order_item_id=i.id and rf.status='COMPLETED'
    ) r on true
    where i.order_id=o.id and i.status<>'cancelled' and i.quantity-coalesce(r.ref_qty,0)>0.0001
   )y
  )x;
  if v_fiscal_total<=0 then raise exception 'La venta quedó completamente devuelta; no existe monto fiscal pendiente para emitir DTE.'; end if;
  v_payload:=jsonb_set(d.dte_payload,'{cuerpoDocumento}',v_items,true);
  v_payload:=jsonb_set(v_payload,'{resumen}',coalesce(v_payload->'resumen','{}'::jsonb)||jsonb_build_object(
    'totalNoSuj',0,'totalExenta',0,'totalGravada',v_tax_base,'subTotalVentas',v_tax_base,
    'descuNoSuj',0,'descuExenta',0,'descuGravada',round(v_discount/1.13,2),'totalDescu',round(v_discount/1.13,2),
    'tributos',jsonb_build_array(jsonb_build_object('codigo','20','descripcion','Impuesto al Valor Agregado 13%','valor',v_iva)),
    'subTotal',v_tax_base,'ivaRete1',0,'ivaPerci1',0,'reteRenta',0,'montoTotalOperacion',v_fiscal_total,
    'totalNoGravado',0,'totalPagar',v_fiscal_total,'totalLetras',public.bar_money_words(v_fiscal_total),'saldoFavor',0,
    'condicionOperacion',1,'pagos',jsonb_build_array(jsonb_build_object('codigo','01','montoPago',v_fiscal_total,'referencia',o.order_code,'plazo',null,'periodo',null))
   ),true);
 end if;

 update public.dte_documents
 set dte_payload=v_payload,
     financial_note=concat('Venta cobrada IDEALO BAR ajustada por devoluciones previas. Monto fiscal vigente ',v_fiscal_total,'. Reembolsado ',v_refunded,'. Propina fuera del DTE.'),
     updated_at=now()
 where id=d.id and status='DRAFT';
 return d.id;
end;$$;
revoke execute on function public.bar_refresh_sale_dte_for_refunds(uuid) from public,anon,authenticated;

create or replace function public.bar_dte_adjust_on_insert()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
 if new.status='DRAFT' and new.bar_order_id is not null and new.dte_type in ('01','03')
    and exists(select 1 from public.bar_refunds r where r.order_id=new.bar_order_id and r.status='COMPLETED' and r.merchandise_refund>0) then
  perform public.bar_refresh_sale_dte_for_refunds(new.id);
 end if;
 return new;
end;$$;
drop trigger if exists bar_dte_adjust_refunds_after_insert on public.dte_documents;
create trigger bar_dte_adjust_refunds_after_insert after insert on public.dte_documents
for each row execute function public.bar_dte_adjust_on_insert();
revoke execute on function public.bar_dte_adjust_on_insert() from public,anon,authenticated;

-- Factura 01 de reemplazo para devolución parcial posterior a una Factura 01 ya procesada.
create or replace function public.bar_create_refund_replacement_invoice(p_original_dte_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
 d public.dte_documents%rowtype;
 v_id uuid;
 v_gen uuid:=gen_random_uuid();
 v_control text;
 v_payload jsonb;
 v_now timestamp:=now() at time zone 'America/El_Salvador';
begin
 select * into d from public.dte_documents where id=p_original_dte_id for update;
 if not found or d.dte_type<>'01' or d.bar_order_id is null then raise exception 'Factura original inválida para reemplazo.'; end if;
 if d.status<>'PROCESSED' then raise exception 'El reemplazo solo se prepara para una factura 01 ya procesada.'; end if;
 if not public.bar_has_permission(d.company_id,'admin.manage') then raise exception 'Solo Gerente o Propietario puede preparar el reemplazo fiscal.'; end if;
 select id into v_id from public.dte_documents
 where reissued_from_id=d.id and dte_type='01' and status not in ('REJECTED','INVALIDATED')
 order by created_at desc limit 1;
 if v_id is not null then return v_id; end if;
 v_control:=public.next_dte_control_number(d.company_id,'01',d.environment);
 v_payload:=d.dte_payload;
 v_payload:=jsonb_set(v_payload,'{identificacion,numeroControl}',to_jsonb(v_control),true);
 v_payload:=jsonb_set(v_payload,'{identificacion,codigoGeneracion}',to_jsonb(upper(v_gen::text)),true);
 v_payload:=jsonb_set(v_payload,'{identificacion,fecEmi}',to_jsonb(to_char(v_now,'YYYY-MM-DD')),true);
 v_payload:=jsonb_set(v_payload,'{identificacion,horEmi}',to_jsonb(to_char(v_now,'HH24:MI:SS')),true);
 insert into public.dte_documents(
  company_id,client_id,dte_type,generation_code,control_number,environment,status,dte_payload,created_by,
  bar_order_id,bar_cash_prepaid,financial_state,financial_note,reissued_from_id
 ) values(
  d.company_id,d.client_id,'01',v_gen,v_control,d.environment,'DRAFT',v_payload,auth.uid(),d.bar_order_id,true,
  'PERCEIVED','Factura de reemplazo por devolución parcial IDEALO BAR. El cobro/reembolso ya está contabilizado; no duplicar ingreso.',d.id
 ) returning id into v_id;
 return v_id;
end;$$;
revoke execute on function public.bar_create_refund_replacement_invoice(uuid) from public,anon;
grant execute on function public.bar_create_refund_replacement_invoice(uuid) to authenticated;

-- Nota de Crédito 05 para un CCF 03 procesado. La propina queda fuera por no formar parte del DTE original.
create or replace function public.bar_create_refund_credit_note(p_refund_id uuid,p_original_dte_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
 r public.bar_refunds%rowtype;
 d public.dte_documents%rowtype;
 o public.bar_orders%rowtype;
 c public.companies%rowtype;
 v_gen uuid:=gen_random_uuid();
 v_control text;
 v_payload jsonb;
 v_items jsonb;
 v_total numeric;
 v_base numeric;
 v_iva numeric;
 v_discount numeric:=0;
 v_id uuid;
 v_now timestamp:=now() at time zone 'America/El_Salvador';
 v_amb text;
begin
 select * into r from public.bar_refunds where id=p_refund_id and status='COMPLETED';
 if not found then raise exception 'Devolución no encontrada.'; end if;
 select * into d from public.dte_documents where id=p_original_dte_id for update;
 if not found or d.dte_type<>'03' or d.status<>'PROCESSED' then raise exception 'La Nota de Crédito requiere un CCF 03 procesado.'; end if;
 if d.company_id<>r.company_id or d.bar_order_id<>r.order_id then raise exception 'El DTE original no corresponde a la devolución.'; end if;
 if not public.bar_has_permission(r.company_id,'admin.manage') then raise exception 'Solo Gerente o Propietario puede preparar la Nota de Crédito.'; end if;
 if r.merchandise_refund<=0 then raise exception 'No existe monto de mercadería para documentar fiscalmente.'; end if;
 select * into o from public.bar_orders where id=r.order_id;
 select * into c from public.companies where id=r.company_id;
 select adjustment_dte_id into v_id from public.bar_refund_fiscal_actions where refund_id=r.id and adjustment_dte_id is not null;
 if v_id is not null then return v_id; end if;
 v_control:=public.next_dte_control_number(r.company_id,'05',d.environment);
 v_amb:=case when d.environment='production' then '01' else '00' end;

 select coalesce(jsonb_agg(jsonb_build_object(
  'numItem',x.rn,'tipoItem',2,'numeroDocumento',null,'codigo',x.product_id::text,'codTributo',null,
  'descripcion',x.item_name,'cantidad',x.quantity,'uniMedida',59,'precioUni',round(x.unit_price/1.13,2),
  'montoDescu',x.discount_base,'ventaNoSuj',0,'ventaExenta',0,'ventaGravada',x.tax_base,'tributos',jsonb_build_array('20')
 ) order by x.rn),'[]'::jsonb),round(coalesce(sum(x.tax_base),0),2),round(coalesce(sum(x.item_iva),0),2),round(coalesce(sum(x.discount_base),0),2)
 into v_items,v_base,v_iva,v_discount
 from(
  select row_number() over(order by ri.created_at,ri.id) rn,i.product_id,i.item_name,i.unit_price,ri.quantity,
   round(ri.amount/1.13,2) tax_base,
   round(ri.amount-round(ri.amount/1.13,2),2) item_iva,
   round(greatest(((coalesce(i.line_total,0)/greatest(i.quantity,0.000001))*ri.quantity-ri.amount)/1.13,0),2) discount_base
  from public.bar_refund_items ri join public.bar_order_items i on i.id=ri.order_item_id
  where ri.refund_id=r.id
 )x;
 v_total:=round(v_base+v_iva,2);
 if v_total<=0 then raise exception 'La Nota de Crédito quedó sin monto.'; end if;

 v_payload:=jsonb_build_object(
  'identificacion',jsonb_build_object(
   'version',3,'ambiente',v_amb,'tipoDte','05','numeroControl',v_control,'codigoGeneracion',upper(v_gen::text),
   'tipoModelo',1,'tipoOperacion',1,'tipoContingencia',null,'motivoContin',null,
   'fecEmi',to_char(v_now,'YYYY-MM-DD'),'horEmi',to_char(v_now,'HH24:MI:SS'),'tipoMoneda','USD'
  ),
  'documentoRelacionado',jsonb_build_array(jsonb_build_object(
   'tipoDocumento','03','tipoGeneracion',2,'numeroDocumento',upper(d.generation_code::text),
   'fechaEmision',d.dte_payload#>>'{identificacion,fecEmi}'
  )),
  'emisor',d.dte_payload->'emisor',
  'receptor',d.dte_payload->'receptor',
  'ventaTercero',null,
  'cuerpoDocumento',v_items,
  'resumen',jsonb_build_object(
   'totalNoSuj',0,'totalExenta',0,'totalGravada',v_base,'subTotalVentas',v_base,
   'descuNoSuj',0,'descuExenta',0,'descuGravada',v_discount,'totalDescu',v_discount,
   'tributos',jsonb_build_array(jsonb_build_object('codigo','20','descripcion','Impuesto al Valor Agregado 13%','valor',v_iva)),
   'subTotal',v_base,'ivaPerci1',0,'ivaRete1',0,'reteRenta',0,'montoTotalOperacion',v_total,
   'totalLetras',public.bar_money_words(v_total),'condicionOperacion',1
  ),
  'extension',null,
  'apendice',jsonb_build_array(jsonb_build_object('campo','IDEALO BAR','etiqueta','Devolución','valor',left(r.reason,150)))
 );
 insert into public.dte_documents(
  company_id,client_id,dte_type,generation_code,control_number,environment,status,dte_payload,created_by,
  bar_order_id,bar_cash_prepaid,financial_state,financial_note
 ) values(
  r.company_id,d.client_id,'05',v_gen,v_control,d.environment,'DRAFT',v_payload,auth.uid(),r.order_id,true,
  'PERCEIVED',concat('Nota de Crédito por devolución ',r.refund_code,' ya reembolsada en caja. No registrar un segundo egreso.')
 ) returning id into v_id;
 return v_id;
end;$$;
revoke execute on function public.bar_create_refund_credit_note(uuid,uuid) from public,anon;
grant execute on function public.bar_create_refund_credit_note(uuid,uuid) to authenticated;

create or replace function public.bar_prepare_refund_fiscal_action(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
 r public.bar_refunds%rowtype;
 d public.dte_documents%rowtype;
 v_action public.bar_refund_fiscal_actions%rowtype;
 v_adjust uuid;
 v_original_total numeric;
 v_type text;
 v_status text;
 v_details jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into r from public.bar_refunds where id=p_refund_id and status='COMPLETED' for update;
 if not found then raise exception 'Devolución no encontrada.'; end if;
 if not public.bar_has_permission(r.company_id,'admin.manage') then raise exception 'Solo Gerente o Propietario puede preparar la acción fiscal.'; end if;
 select * into v_action from public.bar_refund_fiscal_actions where refund_id=r.id for update;
 if found and v_action.status='RESOLVED' then return to_jsonb(v_action); end if;

 if r.merchandise_refund<=0 then
  v_type:='NO_FISCAL_IMPACT';v_status:='RESOLVED';
  v_details=jsonb_build_object('message','La devolución corresponde únicamente a propina; la propina no formó parte del DTE de venta.');
  update public.bar_refunds set fiscal_status='RESOLVED',updated_at=now() where id=r.id;
 else
  if r.dte_document_id is not null then select * into d from public.dte_documents where id=r.dte_document_id; end if;
  if not found then
   select * into d from public.dte_documents
   where bar_order_id=r.order_id and dte_type in ('01','03') and reissued_from_id is null
   order by case when status='PROCESSED' then 0 else 1 end,created_at desc limit 1;
  end if;

  if not found then
   v_type:='SALE_DTE_WILL_BE_NET';v_status:='RESOLVED';
   v_details=jsonb_build_object('message','La venta todavía no tiene DTE. Cuando se genere, el borrador excluirá automáticamente lo ya devuelto.');
   update public.bar_refunds set fiscal_status='RESOLVED',updated_at=now() where id=r.id;
  elsif d.status='DRAFT' then
   perform public.bar_refresh_sale_dte_for_refunds(d.id);
   v_type:='SALE_DTE_ADJUSTED';v_status:='RESOLVED';v_adjust:=d.id;
   v_details=jsonb_build_object('message','El borrador de la venta fue recalculado antes de firma/transmisión.');
   update public.bar_refunds set fiscal_status='RESOLVED',updated_at=now(),dte_document_id=d.id where id=r.id;
  elsif d.status in ('SIGNING','SIGNED','TRANSMITTING','CONTINGENCY') then
   v_type:='WAIT_DTE_FINAL_STATUS';v_status:='PENDING';
   v_details=jsonb_build_object('message','El DTE ya salió de DRAFT. Espera el resultado de Hacienda antes de crear el ajuste fiscal.','document_status',d.status);
   update public.bar_refunds set fiscal_status='REVIEW_REQUIRED',updated_at=now(),dte_document_id=d.id where id=r.id;
  elsif d.status='PROCESSED' and d.dte_type='03' then
   v_adjust:=public.bar_create_refund_credit_note(r.id,d.id);
   v_type:='CREDIT_NOTE_05';v_status:='DRAFT_READY';
   v_details=jsonb_build_object('message','Nota de Crédito 05 preparada y relacionada al CCF 03 procesado. Debe firmarse y transmitirse por el motor DTE.');
   update public.bar_refunds set fiscal_status='ACTION_REQUIRED',updated_at=now(),dte_document_id=d.id where id=r.id;
  elsif d.status='PROCESSED' and d.dte_type='01' then
   v_original_total:=coalesce(nullif(d.dte_payload#>>'{resumen,totalPagar}','')::numeric,nullif(d.dte_payload#>>'{resumen,montoTotalOperacion}','')::numeric,0);
   if r.merchandise_refund>=v_original_total-0.01 then
    v_type:='INVALIDATE_INVOICE_01';v_status:='READY_FOR_INVALIDATION';
    v_details=jsonb_build_object(
     'message','Factura 01 procesada con devolución fiscal total. Debe enviarse el evento de invalidación a Hacienda; IDEALO BAR no cambia el estado a INVALIDATED hasta recibir respuesta MH.',
     'suggested_tipo_anulacion',2,'confirmation',concat('INVALIDAR ',d.control_number)
    );
   else
    v_adjust:=public.bar_create_refund_replacement_invoice(d.id);
    v_type:='REPLACEMENT_THEN_INVALIDATE';v_status:='DRAFT_READY';
    v_details=jsonb_build_object(
     'message','Devolución parcial sobre Factura 01: se preparó una Factura 01 de reemplazo por el saldo vigente. Primero debe procesarse el reemplazo y luego invalidarse la factura original mediante el evento MH.',
     'original_total',v_original_total,'refund_amount',r.merchandise_refund,'remaining',greatest(v_original_total-r.merchandise_refund,0)
    );
   end if;
   update public.bar_refunds set fiscal_status='ACTION_REQUIRED',updated_at=now(),dte_document_id=d.id where id=r.id;
  elsif d.status in ('REJECTED','INVALIDATED') then
   v_type:='REGENERATE_SALE_DTE';v_status:='PENDING';
   v_details=jsonb_build_object('message','El DTE anterior no está vigente. Genera nuevamente el DTE de la venta; el nuevo borrador saldrá neto de devoluciones.','document_status',d.status);
   update public.bar_refunds set fiscal_status='REVIEW_REQUIRED',updated_at=now(),dte_document_id=d.id where id=r.id;
  else
   v_type:='REVIEW_REQUIRED';v_status:='PENDING';
   v_details=jsonb_build_object('message','Revisión fiscal requerida.','document_status',d.status,'dte_type',d.dte_type);
   update public.bar_refunds set fiscal_status='REVIEW_REQUIRED',updated_at=now(),dte_document_id=d.id where id=r.id;
  end if;
 end if;

 insert into public.bar_refund_fiscal_actions(
  company_id,refund_id,order_id,original_dte_id,adjustment_dte_id,action_type,status,reason,details,resolved_at,created_by,updated_at
 ) values(
  r.company_id,r.id,r.order_id,d.id,v_adjust,v_type,v_status,r.reason,v_details,
  case when v_status='RESOLVED' then now() else null end,auth.uid(),now()
 )
 on conflict(refund_id) do update
 set original_dte_id=excluded.original_dte_id,
     adjustment_dte_id=coalesce(excluded.adjustment_dte_id,public.bar_refund_fiscal_actions.adjustment_dte_id),
     action_type=excluded.action_type,status=excluded.status,reason=excluded.reason,details=excluded.details,
     resolved_at=excluded.resolved_at,updated_at=now()
 returning * into v_action;
 return to_jsonb(v_action);
end;$$;
revoke execute on function public.bar_prepare_refund_fiscal_action(uuid) from public,anon;
grant execute on function public.bar_prepare_refund_fiscal_action(uuid) to authenticated;

create or replace function public.bar_sync_refund_fiscal_action_from_dte()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
 if new.status is not distinct from old.status then return new; end if;
 if new.status='PROCESSED' then
  update public.bar_refund_fiscal_actions a
  set status=case when a.action_type='CREDIT_NOTE_05' then 'RESOLVED' when a.action_type='REPLACEMENT_THEN_INVALIDATE' then 'REPLACEMENT_PROCESSED' else a.status end,
      resolved_at=case when a.action_type='CREDIT_NOTE_05' then now() else a.resolved_at end,
      updated_at=now(),details=a.details||jsonb_build_object('adjustment_status','PROCESSED','adjustment_control',new.control_number)
  where a.adjustment_dte_id=new.id;
  update public.bar_refunds r set fiscal_status='RESOLVED',updated_at=now()
  where r.id in(select refund_id from public.bar_refund_fiscal_actions where adjustment_dte_id=new.id and action_type='CREDIT_NOTE_05');
 elsif new.status='REJECTED' then
  update public.bar_refund_fiscal_actions
  set status='ADJUSTMENT_REJECTED',updated_at=now(),details=details||jsonb_build_object('adjustment_status','REJECTED')
  where adjustment_dte_id=new.id and status<>'RESOLVED';
 end if;
 if new.status='INVALIDATED' then
  update public.bar_refund_fiscal_actions
  set status='RESOLVED',resolved_at=now(),updated_at=now(),details=details||jsonb_build_object('original_status','INVALIDATED')
  where original_dte_id=new.id and action_type in('INVALIDATE_INVOICE_01','REPLACEMENT_THEN_INVALIDATE');
  update public.bar_refunds r set fiscal_status='RESOLVED',updated_at=now()
  where r.id in(select refund_id from public.bar_refund_fiscal_actions where original_dte_id=new.id and action_type in('INVALIDATE_INVOICE_01','REPLACEMENT_THEN_INVALIDATE'));
 end if;
 return new;
end;$$;
drop trigger if exists bar_sync_refund_fiscal_action_dte_status on public.dte_documents;
create trigger bar_sync_refund_fiscal_action_dte_status
after update of status on public.dte_documents
for each row execute function public.bar_sync_refund_fiscal_action_from_dte();
revoke execute on function public.bar_sync_refund_fiscal_action_from_dte() from public,anon,authenticated;

create or replace function public.bar_refund_fiscal_integrity(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 if not public.bar_has_permission(p_company_id,'admin.view') and not public.bar_has_permission(p_company_id,'admin.manage') then
  raise exception 'Solo Gerencia puede auditar el flujo fiscal.';
 end if;
 select jsonb_build_object(
  'refunds_action_required_without_action',(select count(*) from public.bar_refunds r where r.company_id=p_company_id and r.status='COMPLETED' and r.fiscal_status in('ACTION_REQUIRED','REVIEW_REQUIRED') and not exists(select 1 from public.bar_refund_fiscal_actions a where a.refund_id=r.id)),
  'credit_notes_pending',(select count(*) from public.bar_refund_fiscal_actions where company_id=p_company_id and action_type='CREDIT_NOTE_05' and status<>'RESOLVED'),
  'invoice_invalidations_pending',(select count(*) from public.bar_refund_fiscal_actions where company_id=p_company_id and action_type in('INVALIDATE_INVOICE_01','REPLACEMENT_THEN_INVALIDATE') and status<>'RESOLVED'),
  'rejected_adjustments',(select count(*) from public.bar_refund_fiscal_actions where company_id=p_company_id and status='ADJUSTMENT_REJECTED'),
  'processed_credit_note_unresolved',(select count(*) from public.bar_refund_fiscal_actions a join public.dte_documents d on d.id=a.adjustment_dte_id where a.company_id=p_company_id and a.action_type='CREDIT_NOTE_05' and d.status='PROCESSED' and a.status<>'RESOLVED')
 ) into v;
 return v;
end;$$;
revoke execute on function public.bar_refund_fiscal_integrity(uuid) from public,anon;
grant execute on function public.bar_refund_fiscal_integrity(uuid) to authenticated;
