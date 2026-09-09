-- IDEALO BAR · DTE automático desde venta pagada. Genera borrador fiscal enlazado; firmado/transmisión siguen en el motor DTE central.
create or replace function public.bar_money_words(p_amount numeric)
returns text language sql immutable set search_path=public as $$ select to_char(round(coalesce(p_amount,0),2),'FM9999999990.00')||' DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA' $$;

create or replace function public.bar_generate_dte_draft(p_order_id uuid,p_client_id uuid default null,p_dte_type text default null,p_environment text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
 v_order public.bar_orders%rowtype; v_company public.companies%rowtype; v_client public.clients%rowtype; v_settings public.bar_settings%rowtype;
 v_type text; v_env text; v_amb text; v_control text; v_seq bigint; v_est text; v_pos text; v_generation uuid:=gen_random_uuid(); v_payload jsonb; v_items jsonb; v_fiscal_total numeric; v_net numeric; v_iva numeric; v_doc uuid; v_request uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into v_order from public.bar_orders where id=p_order_id; if not found then raise exception 'Pedido no encontrado.'; end if;
 if v_order.status<>'paid' then raise exception 'Solo se puede generar DTE de una venta pagada.'; end if;
 if not public.bar_has_permission(v_order.company_id,'payment.take') and not public.erp_can_admin(v_order.company_id) then raise exception 'Sin permiso para preparar el DTE de esta venta.'; end if;
 if exists(select 1 from public.dte_documents where bar_order_id=v_order.id and status not in ('REJECTED','INVALIDATED')) then select id into v_doc from public.dte_documents where bar_order_id=v_order.id and status not in ('REJECTED','INVALIDATED') order by created_at desc limit 1; return v_doc; end if;
 select * into v_company from public.companies where id=v_order.company_id; select * into v_settings from public.bar_settings where company_id=v_order.company_id;
 v_type:=coalesce(nullif(p_dte_type,''),v_settings.default_dte_type,'01'); v_env:=coalesce(nullif(p_environment,''),v_settings.default_dte_environment,'test');
 if v_type not in ('01','03') then raise exception 'Tipo DTE no soportado.'; end if; if v_env not in ('test','production') then raise exception 'Ambiente DTE inválido.'; end if;
 if p_client_id is not null then select * into v_client from public.clients where id=p_client_id and company_id=v_order.company_id and status='active'; if not found then raise exception 'Cliente no válido.'; end if; end if;
 if v_type='03' and p_client_id is null then raise exception 'El CCF requiere cliente.'; end if;
 if nullif(v_company.nit,'') is null or nullif(v_company.nrc,'') is null or nullif(v_company.activity_code,'') is null or nullif(v_company.department_code,'') is null or nullif(v_company.municipality_code,'') is null or nullif(v_company.address,'') is null then raise exception 'Completa el perfil fiscal de la empresa antes de generar DTE.'; end if;
 if v_env='production' then
   if coalesce(v_company.demo_mode,false) then raise exception 'No se puede preparar DTE de producción en empresa demo.'; end if;
   if not exists(select 1 from public.dte_runtime_settings r where r.company_id=v_order.company_id and r.environment='production' and r.production_enabled=true and r.production_approved=true) then raise exception 'La producción DTE no está aprobada para esta empresa.'; end if;
   v_est:=coalesce(nullif(v_company.establishment_code,''),'M001'); v_pos:=coalesce(nullif(v_company.point_of_sale_code,''),'P001'); v_amb:='01';
 else v_est:='M001'; v_pos:='P001'; v_amb:='00'; end if;
 perform pg_advisory_xact_lock(hashtext(v_order.company_id::text||':'||v_type||':'||v_env));
 insert into public.dte_control_sequences(company_id,dte_type,environment,last_value) values(v_order.company_id,v_type,v_env,1)
 on conflict(company_id,dte_type,environment) do update set last_value=public.dte_control_sequences.last_value+1,updated_at=now() returning last_value into v_seq;
 v_control:=format('DTE-%s-%s%s-%s',v_type,v_est,v_pos,lpad(v_seq::text,15,'0'));
 -- La propina se registra por separado y no se incorpora al monto fiscal de la venta.
 v_fiscal_total:=round(greatest(coalesce(v_order.subtotal,0)-coalesce(v_order.discount_total,0),0),2);
 if v_fiscal_total<=0 then raise exception 'La venta no tiene monto fiscal facturable.'; end if;
 if v_type='01' then
   select coalesce(jsonb_agg(jsonb_build_object('numItem',x.rn,'tipoItem',2,'numeroDocumento',null,'codigo',x.product_id::text,'codTributo',null,'descripcion',x.item_name,'cantidad',x.quantity,'uniMedida',59,'precioUni',round(x.unit_price,2),'montoDescu',x.manual_discount,'ventaNoSuj',0,'ventaExenta',0,'ventaGravada',round(greatest(x.line_total-x.manual_discount,0),2),'tributos',null,'psv',0,'noGravado',0,'ivaItem',round(greatest(x.line_total-x.manual_discount,0)-(greatest(x.line_total-x.manual_discount,0)/1.13),2)) order by x.rn),'[]'::jsonb) into v_items
   from (select row_number() over(order by created_at,id) rn,i.*,round(case when v_order.subtotal>0 then v_order.discount_total*(coalesce(i.line_total,0)/v_order.subtotal) else 0 end,2) manual_discount from public.bar_order_items i where order_id=v_order.id and status<>'cancelled') x;
   v_payload:=jsonb_build_object(
    'identificacion',jsonb_build_object('version',2,'ambiente',v_amb,'tipoDte','01','numeroControl',v_control,'codigoGeneracion',upper(v_generation::text),'tipoModelo',1,'tipoOperacion',1,'tipoContingencia',null,'motivoContin',null,'fecEmi',to_char((now() at time zone 'America/El_Salvador')::date,'YYYY-MM-DD'),'horEmi',to_char(now() at time zone 'America/El_Salvador','HH24:MI:SS'),'tipoMoneda','USD'),
    'documentoRelacionado',null,
    'emisor',jsonb_build_object('nit',v_company.nit,'nrc',v_company.nrc,'nombre',v_company.name,'codActividad',v_company.activity_code,'descActividad',v_company.business_activity,'nombreComercial',v_company.trade_name,'direccion',jsonb_build_object('departamento',v_company.department_code,'municipio',v_company.municipality_code,'distrito',v_company.district_code,'complemento',v_company.address),'telefono',v_company.phone,'correo',v_company.email,'codEstable',v_est,'codPuntoVenta',v_pos),
    'receptor',case when p_client_id is null then null else jsonb_build_object('tipoDocumento',v_client.document_type,'numDocumento',coalesce(v_client.document_number,v_client.dui,v_client.nit),'nrc',v_client.nrc,'nombre',v_client.name,'codActividad',v_client.activity_code,'descActividad',v_client.business_activity,'direccion',case when v_client.address is null then null else jsonb_build_object('departamento',v_client.department_code,'municipio',v_client.municipality_code,'distrito',v_client.district_code,'complemento',v_client.address) end,'telefono',v_client.phone,'correo',v_client.email) end,
    'otrosDocumentos',null,'ventaTercero',null,'cuerpoDocumento',v_items,
    'resumen',jsonb_build_object('totalNoSuj',0,'totalExenta',0,'totalGravada',v_fiscal_total,'subTotalVentas',v_fiscal_total,'descuNoSuj',0,'descuExenta',0,'descuGravada',round(v_order.discount_total,2),'porcentajeDescuento',case when v_order.subtotal>0 then round(v_order.discount_total*100/v_order.subtotal,2) else 0 end,'totalDescu',round(v_order.discount_total,2),'tributos',null,'subTotal',v_fiscal_total,'ivaRete',0,'montoTotalOperacion',v_fiscal_total,'totalNoGravado',0,'totalPagar',v_fiscal_total,'totalLetras',public.bar_money_words(v_fiscal_total),'totalIva',round(v_fiscal_total-(v_fiscal_total/1.13),2),'saldoFavor',0,'condicionOperacion',1,'pagos',jsonb_build_array(jsonb_build_object('codigo','01','montoPago',v_fiscal_total,'referencia',v_order.order_code,'plazo',null,'periodo',null)),'numPagoElectronico',null,'observaciones',concat('Venta IDEALO BAR · ',v_order.order_code,case when coalesce(v_order.tip_total,0)>0 then ' · Propina separada $'||round(v_order.tip_total,2)::text else '' end)),
    'apendice',null);
 else
   v_net:=round(v_fiscal_total/1.13,2); v_iva:=round(v_fiscal_total-v_net,2);
   select coalesce(jsonb_agg(jsonb_build_object('numItem',x.rn,'tipoItem',2,'numeroDocumento',null,'codigo',x.product_id::text,'codTributo',null,'descripcion',x.item_name,'cantidad',x.quantity,'uniMedida',59,'precioUni',round(x.unit_price/1.13,2),'montoDescu',round(x.manual_discount/1.13,2),'ventaNoSuj',0,'ventaExenta',0,'ventaGravada',round(greatest(x.line_total-x.manual_discount,0)/1.13,2),'tributos',jsonb_build_array('20'),'psv',0,'noGravado',0) order by x.rn),'[]'::jsonb) into v_items
   from (select row_number() over(order by created_at,id) rn,i.*,round(case when v_order.subtotal>0 then v_order.discount_total*(coalesce(i.line_total,0)/v_order.subtotal) else 0 end,2) manual_discount from public.bar_order_items i where order_id=v_order.id and status<>'cancelled') x;
   v_payload:=jsonb_build_object(
    'identificacion',jsonb_build_object('version',3,'ambiente',v_amb,'tipoDte','03','numeroControl',v_control,'codigoGeneracion',upper(v_generation::text),'tipoModelo',1,'tipoOperacion',1,'tipoContingencia',null,'motivoContin',null,'fecEmi',to_char((now() at time zone 'America/El_Salvador')::date,'YYYY-MM-DD'),'horEmi',to_char(now() at time zone 'America/El_Salvador','HH24:MI:SS'),'tipoMoneda','USD'),
    'emisor',jsonb_build_object('nit',v_company.nit,'nrc',v_company.nrc,'nombre',v_company.name,'codActividad',v_company.activity_code,'descActividad',v_company.business_activity,'nombreComercial',v_company.trade_name,'direccion',jsonb_build_object('departamento',v_company.department_code,'municipio',v_company.municipality_code,'complemento',v_company.address),'telefono',v_company.phone,'correo',v_company.email,'codEstable',v_est,'codPuntoVenta',v_pos,'tipoEstablecimiento',v_company.establishment_type),
    'receptor',jsonb_build_object('nit',coalesce(v_client.nit,v_client.tax_id,v_client.document_number),'nrc',v_client.nrc,'nombre',v_client.name,'codActividad',v_client.activity_code,'descActividad',v_client.business_activity,'nombreComercial',v_client.trade_name,'direccion',jsonb_build_object('departamento',v_client.department_code,'municipio',v_client.municipality_code,'complemento',v_client.address),'telefono',v_client.phone,'correo',v_client.email),
    'cuerpoDocumento',v_items,'documentoRelacionado',null,'otrosDocumentos',null,'ventaTercero',null,'extension',null,
    'resumen',jsonb_build_object('totalNoSuj',0,'totalExenta',0,'totalGravada',v_net,'subTotalVentas',v_net,'descuNoSuj',0,'descuExenta',0,'descuGravada',round(v_order.discount_total/1.13,2),'porcentajeDescuento',case when v_order.subtotal>0 then round(v_order.discount_total*100/v_order.subtotal,2) else 0 end,'totalDescu',round(v_order.discount_total/1.13,2),'tributos',jsonb_build_array(jsonb_build_object('codigo','20','descripcion','Impuesto al Valor Agregado 13%','valor',v_iva)),'subTotal',v_net,'ivaRete1',0,'ivaPerci1',0,'reteRenta',0,'montoTotalOperacion',v_fiscal_total,'totalNoGravado',0,'totalPagar',v_fiscal_total,'totalLetras',public.bar_money_words(v_fiscal_total),'saldoFavor',0,'condicionOperacion',1,'pagos',jsonb_build_array(jsonb_build_object('codigo','01','montoPago',v_fiscal_total,'referencia',v_order.order_code,'plazo',null,'periodo',null)),'numPagoElectronico',null),
    'apendice',null);
 end if;
 insert into public.dte_documents(company_id,client_id,dte_type,generation_code,control_number,environment,status,dte_payload,created_by,bar_order_id,bar_cash_prepaid,financial_state,financial_note)
 values(v_order.company_id,p_client_id,v_type,v_generation,v_control,v_env,'DRAFT',v_payload,auth.uid(),v_order.id,true,'PERCEIVED',concat('Venta ya cobrada en IDEALO BAR. Monto fiscal ',v_fiscal_total,'. Propina separada ',round(coalesce(v_order.tip_total,0),2),'. No duplicar ingreso al procesar DTE.')) returning id into v_doc;
 insert into public.bar_dte_requests(company_id,order_id,client_id,dte_type,environment,status,dte_document_id,requested_by,notes) values(v_order.company_id,v_order.id,p_client_id,v_type,v_env,'DRAFT_LINKED',v_doc,auth.uid(),'Borrador generado automáticamente desde venta pagada.') on conflict(order_id,dte_type,environment) do update set client_id=excluded.client_id,status='DRAFT_LINKED',dte_document_id=excluded.dte_document_id,updated_at=now(),notes=excluded.notes returning id into v_request;
 return v_doc;
end;$$;

create or replace function public.bar_auto_dte_after_paid()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_settings public.bar_settings%rowtype;
begin
 if new.status='paid' and old.status is distinct from 'paid' then
  select * into v_settings from public.bar_settings where company_id=new.company_id;
  if coalesce(v_settings.auto_dte_on_paid,true) then
   begin perform public.bar_generate_dte_draft(new.id,null,coalesce(v_settings.default_dte_type,'01'),coalesce(v_settings.default_dte_environment,'test'));
   exception when others then insert into public.bar_order_events(company_id,order_id,event_type,reason,details) values(new.company_id,new.id,'AUTO_DTE_PENDING',sqlerrm,jsonb_build_object('dte_type',coalesce(v_settings.default_dte_type,'01'),'environment',coalesce(v_settings.default_dte_environment,'test'))); end;
  end if;
 end if; return new;
end;$$;
drop trigger if exists bar_orders_auto_dte_after_paid on public.bar_orders;
create trigger bar_orders_auto_dte_after_paid after update of status on public.bar_orders for each row execute function public.bar_auto_dte_after_paid();
revoke execute on function public.bar_auto_dte_after_paid() from public,anon,authenticated;
revoke execute on function public.bar_generate_dte_draft(uuid,uuid,text,text) from public,anon;
grant execute on function public.bar_generate_dte_draft(uuid,uuid,text,text) to authenticated;