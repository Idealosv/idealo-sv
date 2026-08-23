import { useEffect, useMemo, useState } from 'react'
import './facturacion.css'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const PAYMENT_METHODS = [['01','Efectivo'],['02','Tarjeta de débito'],['03','Tarjeta de crédito'],['04','Cheque'],['05','Transferencia bancaria'],['08','Dinero electrónico'],['99','Otro']]
const UNIT_OPTIONS = [['59','Unidad'],['36','Servicio'],['99','Otra']]
const ITEM_TYPES = [['1','Bien'],['2','Servicio'],['3','Bien y servicio'],['4','Otro']]
const emptyItem = () => ({ tipoItem:'2', codigo:'', descripcion:'', cantidad:'1', uniMedida:'36', precioUni:'0.00', montoDescu:'0', tipoVenta:'gravada' })

const UNITS = ['', 'UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE']
const TENS = ['', '', '', 'TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
const HUNDREDS = ['', 'CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
function underThousand(n){if(n===0)return'';if(n===100)return'CIEN';const h=Math.floor(n/100),rest=n%100;const hundred=HUNDREDS[h];let tail='';if(rest<30)tail=UNITS[rest];else{const t=Math.floor(rest/10),u=rest%10;tail=`${TENS[t]}${u?` Y ${UNITS[u]}`:''}`}return[hundred,tail].filter(Boolean).join(' ')}
function moneyToWords(value){const safe=Math.max(0,Number(value||0)),whole=Math.floor(safe),cents=Math.round((safe-whole)*100);let words='';if(whole===0)words='CERO';else if(whole<1000)words=underThousand(whole);else if(whole<1000000){const thousands=Math.floor(whole/1000),rest=whole%1000;words=`${thousands===1?'MIL':`${underThousand(thousands)} MIL`}${rest?` ${underThousand(rest)}`:''}`}else words=String(whole);return`${words} ${String(cents).padStart(2,'0')}/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`}

async function apiRequest(path,options){const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),20000);try{const response=await fetch(`${apiUrl}${path}`,{...options,signal:controller.signal});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||`La API respondió HTTP ${response.status}.`);return payload}catch(error){if(error.name==='AbortError')throw new Error('La API tardó demasiado en responder.');if(error.message==='Failed to fetch')throw new Error('No se pudo conectar con la API de IDEALO SV.');throw error}finally{window.clearTimeout(timer)}}

const ccfRequired = [['tax_id','NIT'],['nrc','NRC'],['name','nombre'],['activity_code','código de actividad'],['business_activity','actividad económica'],['department_code','departamento'],['municipality_code','municipio'],['district_code','distrito'],['address','dirección'],['phone','teléfono'],['email','correo']]
const missingCcfData = (client) => client ? ccfRequired.filter(([key])=>!String(client[key]||'').trim()).map(([,label])=>label) : ['cliente']

export default function FacturacionDte({session,supabase,company}){
  const [clients,setClients]=useState([])
  const [clientId,setClientId]=useState('')
  const [dteType,setDteType]=useState('01')
  const [items,setItems]=useState([emptyItem()])
  const [condicionOperacion,setCondicionOperacion]=useState('1')
  const [paymentCode,setPaymentCode]=useState('01')
  const [paymentReference,setPaymentReference]=useState('')
  const [paymentPeriod,setPaymentPeriod]=useState('')
  const [paymentTerm,setPaymentTerm]=useState('')
  const [observaciones,setObservaciones]=useState('')
  const [fiscalOptions,setFiscalOptions]=useState(false)
  const [ivaRete,setIvaRete]=useState('0')
  const [ivaPerci,setIvaPerci]=useState('0')
  const [reteRenta,setReteRenta]=useState('0')
  const [saldoFavor,setSaldoFavor]=useState('0')
  const [totalNoGravado,setTotalNoGravado]=useState('0')
  const [numPagoElectronico,setNumPagoElectronico]=useState('')
  const [related,setRelated]=useState({tipoDocumento:'',tipoGeneracion:'2',numeroDocumento:'',fechaEmision:''})
  const [thirdParty,setThirdParty]=useState({nit:'',nombre:'',codDomiciliado:'1'})
  const [appendix,setAppendix]=useState({campo:'',etiqueta:'',valor:''})
  const [message,setMessage]=useState('')
  const [messageType,setMessageType]=useState('info')
  const [busy,setBusy]=useState(false)

  useEffect(()=>{supabase.from('clients').select('*').eq('company_id',company.id).order('name').then(({data,error})=>{if(error){setMessage(error.message);setMessageType('error')}setClients(data||[])})},[company.id,supabase])
  const selectedClient=clients.find(client=>client.id===clientId)||null
  const ccfMissing=useMemo(()=>missingCcfData(selectedClient),[selectedClient])

  const totals=useMemo(()=>{
    const result={gravada:0,exenta:0,noSujeta:0,descuentos:0,iva:0}
    items.forEach(item=>{const gross=Number(item.cantidad||0)*Number(item.precioUni||0),discount=Math.max(0,Number(item.montoDescu||0)),net=Math.max(0,gross-discount);result.descuentos+=discount;if(item.tipoVenta==='exenta')result.exenta+=net;else if(item.tipoVenta==='no_sujeta')result.noSujeta+=net;else result.gravada+=net})
    result.iva=dteType==='03'?result.gravada*.13:result.gravada-result.gravada/1.13
    result.operacion=dteType==='03'?result.gravada+result.exenta+result.noSujeta+result.iva+Number(totalNoGravado||0):result.gravada+result.exenta+result.noSujeta+Number(totalNoGravado||0)
    result.pagar=Math.max(0,result.operacion+Number(ivaPerci||0)-Number(ivaRete||0)-Number(reteRenta||0)-Number(saldoFavor||0))
    return result
  },[items,dteType,ivaRete,ivaPerci,reteRenta,saldoFavor,totalNoGravado])
  const totalLetras=useMemo(()=>moneyToWords(totals.pagar),[totals.pagar])

  const chooseClient=(value)=>{setClientId(value);const client=clients.find(c=>c.id===value);if(client?.preferred_dte_type==='03'||client?.preferred_dte_type==='01')setDteType(client.preferred_dte_type)}
  const updateItem=(index,key,value)=>setItems(current=>current.map((item,i)=>i===index?{...item,[key]:value}:item))
  const validate=()=>{const errors=[];items.forEach((item,index)=>{if(!item.descripcion.trim())errors.push(`Partida ${index+1}: falta descripción`);if(!(Number(item.cantidad)>0))errors.push(`Partida ${index+1}: cantidad inválida`);if(!(Number(item.precioUni)>0))errors.push(`Partida ${index+1}: precio inválido`);if(Number(item.montoDescu||0)>Number(item.cantidad||0)*Number(item.precioUni||0))errors.push(`Partida ${index+1}: descuento excesivo`)});if(dteType==='03'&&ccfMissing.length)errors.push(`Crédito Fiscal: completa en Clientes ${ccfMissing.join(', ')}`);if(!(totals.pagar>0))errors.push('el total a pagar debe ser mayor que cero');if(condicionOperacion==='2'&&(!paymentPeriod||!paymentTerm))errors.push('para crédito indica plazo y período');return errors}

  const createInvoice=async(event)=>{event.preventDefault();const errors=validate();if(errors.length){setMessage(`No se puede guardar: ${errors.join(' · ')}.`);setMessageType('error');return}setBusy(true);setMessage('');try{const payload=await apiRequest('/api/dte/invoices',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({companyId:company.id,clientId:clientId||null,dteType,items,condicionOperacion:Number(condicionOperacion),totalLetras,observaciones:observaciones||null,payment:{codigo:paymentCode,montoPago:totals.pagar,referencia:paymentReference||null,periodo:paymentPeriod||null,plazo:paymentTerm||null},numPagoElectronico:numPagoElectronico||null,ivaRete:Number(ivaRete||0),ivaPerci:Number(ivaPerci||0),reteRenta:Number(reteRenta||0),saldoFavor:Number(saldoFavor||0),totalNoGravado:Number(totalNoGravado||0),documentoRelacionado:related.numeroDocumento?[{...related,tipoDocumento:related.tipoDocumento||dteType,tipoGeneracion:Number(related.tipoGeneracion)}]:null,ventaTercero:thirdParty.nit?thirdParty:null,apendice:appendix.campo&&appendix.valor?[appendix]:null})});setMessage(`${dteType==='03'?'Crédito Fiscal':'Factura'} ${payload.control_number} guardado correctamente.`);setMessageType('success');setItems([emptyItem()]);setObservaciones('');setPaymentReference('');setFiscalOptions(false)}catch(error){setMessage(error.message);setMessageType('error')}finally{setBusy(false)}}

  return <section className="facturacion-dte billing-simple-flow">
    {message&&<p className={`feedback ${messageType==='error'?'error':'success'}`} role="status">{message}</p>}
    <div className="billing-document-picker" role="group" aria-label="Tipo de documento">
      <button type="button" className={dteType==='01'?'active':''} onClick={()=>setDteType('01')}><strong>Factura</strong><small>DTE-01 · Consumidor Final</small></button>
      <button type="button" className={dteType==='03'?'active':''} onClick={()=>setDteType('03')}><strong>Crédito Fiscal</strong><small>DTE-03 · Contribuyente</small></button>
    </div>

    <form className="panel invoice-form billing-simple-form billing-classic-form" onSubmit={createInvoice} noValidate>
      <div className="billing-classic-columns">
        <div className="billing-classic-main">
          <fieldset className="form-section"><legend>1. Cliente</legend>
            <label className="field"><span>Cliente / receptor</span><select value={clientId} onChange={e=>chooseClient(e.target.value)}><option value="">{dteType==='03'?'Seleccionar cliente contribuyente':'Consumidor final'}</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {selectedClient&&<div className="billing-client-record">
              <div className="billing-client-record-head"><div><strong>{selectedClient.name}</strong><small>{selectedClient.trade_name||'Datos tomados automáticamente del módulo Clientes'}</small></div><span>{selectedClient.preferred_dte_type==='03'?'Prefiere Crédito Fiscal':'Cliente registrado'}</span></div>
              <div className="billing-client-record-grid">
                <Info label="NIT" value={selectedClient.tax_id||selectedClient.document_number}/><Info label="NRC" value={selectedClient.nrc}/><Info label="Documento" value={`${selectedClient.document_type||'—'} · ${selectedClient.document_number||'—'}`}/><Info label="Actividad" value={`${selectedClient.activity_code||'—'} · ${selectedClient.business_activity||'—'}`}/><Info label="Dirección" value={[selectedClient.address,selectedClient.district,selectedClient.municipality,selectedClient.department].filter(Boolean).join(', ')}/><Info label="Contacto" value={[selectedClient.phone,selectedClient.email].filter(Boolean).join(' · ')}/>
              </div>
              {dteType==='03'&&ccfMissing.length>0&&<p className="billing-client-warning">Para emitir Crédito Fiscal falta completar en Clientes: {ccfMissing.join(', ')}.</p>}
            </div>}
          </fieldset>

          <fieldset className="form-section"><legend>2. Productos o servicios</legend>
            {items.map((item,index)=><article className="invoice-item billing-line-item" key={index}>
              <div className="invoice-item-title"><strong>Línea {index+1}</strong><strong>${(Math.max(0,Number(item.cantidad||0)*Number(item.precioUni||0)-Number(item.montoDescu||0))*(dteType==='03'&&item.tipoVenta==='gravada'?1.13:1)).toFixed(2)}</strong>{items.length>1&&<button type="button" className="secondary-button" onClick={()=>setItems(x=>x.filter((_,i)=>i!==index))}>Eliminar</button>}</div>
              <div className="form-grid four">
                <label className="field form-span-2"><span>Descripción *</span><input value={item.descripcion} onChange={e=>updateItem(index,'descripcion',e.target.value)} placeholder="Producto o servicio"/></label>
                <label className="field"><span>Cantidad *</span><input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={e=>updateItem(index,'cantidad',e.target.value)}/></label>
                <label className="field"><span>{dteType==='03'?'Precio sin IVA *':'Precio *'}</span><input type="number" min="0.01" step="0.01" value={item.precioUni} onChange={e=>updateItem(index,'precioUni',e.target.value)}/></label>
                <label className="field"><span>Tipo</span><select value={item.tipoItem} onChange={e=>updateItem(index,'tipoItem',e.target.value)}>{ITEM_TYPES.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
                <label className="field"><span>Unidad</span><select value={item.uniMedida} onChange={e=>updateItem(index,'uniMedida',e.target.value)}>{UNIT_OPTIONS.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
                <label className="field"><span>Descuento</span><input type="number" min="0" step="0.01" value={item.montoDescu} onChange={e=>updateItem(index,'montoDescu',e.target.value)}/></label>
                <label className="field"><span>Clasificación</span><select value={item.tipoVenta} onChange={e=>updateItem(index,'tipoVenta',e.target.value)}><option value="gravada">Gravada</option><option value="exenta">Exenta</option><option value="no_sujeta">No sujeta</option></select></label>
                <label className="field form-span-2"><span>Código interno</span><input value={item.codigo} onChange={e=>updateItem(index,'codigo',e.target.value)} placeholder="Opcional"/></label>
              </div>
            </article>)}
            <button type="button" className="secondary-button billing-add-line" onClick={()=>setItems(x=>[...x,emptyItem()])}>+ Agregar producto o servicio</button>
          </fieldset>

          <fieldset className="form-section"><legend>3. Pago y observaciones</legend>
            <div className="form-grid three">
              <label className="field"><span>Condición *</span><select value={condicionOperacion} onChange={e=>setCondicionOperacion(e.target.value)}><option value="1">Contado</option><option value="2">Crédito</option><option value="3">Otro</option></select></label>
              <label className="field"><span>Forma de pago *</span><select value={paymentCode} onChange={e=>setPaymentCode(e.target.value)}>{PAYMENT_METHODS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
              <label className="field"><span>Referencia</span><input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder="Voucher o transferencia"/></label>
              {condicionOperacion==='2'&&<><label className="field"><span>Unidad del plazo</span><select value={paymentTerm} onChange={e=>setPaymentTerm(e.target.value)}><option value="">Seleccionar</option><option value="01">Días</option><option value="02">Meses</option><option value="03">Años</option></select></label><label className="field"><span>Plazo</span><input type="number" min="1" value={paymentPeriod} onChange={e=>setPaymentPeriod(e.target.value)}/></label></>}
              <label className="field form-span-3"><span>Observaciones</span><textarea rows="2" value={observaciones} onChange={e=>setObservaciones(e.target.value)} placeholder="Opcional"/></label>
            </div>
          </fieldset>

          <details className="billing-technical-details"><summary>Datos técnicos DTE y opciones fiscales</summary><div className="billing-fiscal-options">
            <div className="form-grid three"><label className="field"><span>IVA retenido</span><input type="number" min="0" step="0.01" value={ivaRete} onChange={e=>setIvaRete(e.target.value)}/></label>{dteType==='03'&&<><label className="field"><span>IVA percibido</span><input type="number" min="0" step="0.01" value={ivaPerci} onChange={e=>setIvaPerci(e.target.value)}/></label><label className="field"><span>Renta retenida</span><input type="number" min="0" step="0.01" value={reteRenta} onChange={e=>setReteRenta(e.target.value)}/></label></>}<label className="field"><span>Saldo a favor</span><input type="number" min="0" step="0.01" value={saldoFavor} onChange={e=>setSaldoFavor(e.target.value)}/></label><label className="field"><span>No gravado adicional</span><input type="number" min="0" step="0.01" value={totalNoGravado} onChange={e=>setTotalNoGravado(e.target.value)}/></label><label className="field"><span>N.º pago electrónico</span><input value={numPagoElectronico} onChange={e=>setNumPagoElectronico(e.target.value)}/></label></div>
            <details><summary>Documento relacionado</summary><div className="form-grid four"><label className="field"><span>Tipo DTE</span><input value={related.tipoDocumento} onChange={e=>setRelated({...related,tipoDocumento:e.target.value})}/></label><label className="field"><span>Generación</span><select value={related.tipoGeneracion} onChange={e=>setRelated({...related,tipoGeneracion:e.target.value})}><option value="1">Físico</option><option value="2">Electrónico</option></select></label><label className="field"><span>Número / código</span><input value={related.numeroDocumento} onChange={e=>setRelated({...related,numeroDocumento:e.target.value})}/></label><label className="field"><span>Fecha</span><input type="date" value={related.fechaEmision} onChange={e=>setRelated({...related,fechaEmision:e.target.value})}/></label></div></details>
            <details><summary>Venta a cuenta de tercero</summary><div className="form-grid three"><label className="field"><span>NIT tercero</span><input value={thirdParty.nit} onChange={e=>setThirdParty({...thirdParty,nit:e.target.value})}/></label><label className="field form-span-2"><span>Nombre tercero</span><input value={thirdParty.nombre} onChange={e=>setThirdParty({...thirdParty,nombre:e.target.value})}/></label></div></details>
            <details><summary>Apéndice</summary><div className="form-grid three"><label className="field"><span>Campo</span><input value={appendix.campo} onChange={e=>setAppendix({...appendix,campo:e.target.value})}/></label><label className="field"><span>Etiqueta</span><input value={appendix.etiqueta} onChange={e=>setAppendix({...appendix,etiqueta:e.target.value})}/></label><label className="field"><span>Valor</span><input value={appendix.valor} onChange={e=>setAppendix({...appendix,valor:e.target.value})}/></label></div></details>
          </div></details>
        </div>

        <aside className="billing-classic-summary">
          <div><span>Documento</span><strong>{dteType==='03'?'Comprobante de Crédito Fiscal':'Factura Consumidor Final'}</strong><small>DTE-{dteType} · {dteType==='03'?'Versión 3':'Versión 2'}</small></div>
          <div className="billing-summary-lines"><p><span>Gravadas</span><strong>${totals.gravada.toFixed(2)}</strong></p><p><span>Exentas</span><strong>${totals.exenta.toFixed(2)}</strong></p><p><span>No sujetas</span><strong>${totals.noSujeta.toFixed(2)}</strong></p><p><span>Descuentos</span><strong>− ${totals.descuentos.toFixed(2)}</strong></p><p><span>{dteType==='03'?'IVA 13%':'IVA incluido'}</span><strong>${totals.iva.toFixed(2)}</strong></p>{Number(ivaRete)>0&&<p><span>IVA retenido</span><strong>− ${Number(ivaRete).toFixed(2)}</strong></p>}{dteType==='03'&&Number(ivaPerci)>0&&<p><span>IVA percibido</span><strong>+ ${Number(ivaPerci).toFixed(2)}</strong></p>}</div>
          <div className="billing-summary-total"><span>Total</span><strong>${totals.pagar.toFixed(2)}</strong><small>{totalLetras}</small></div>
          <div className="billing-summary-client"><span>Cliente</span><strong>{selectedClient?.name||'Consumidor final'}</strong>{selectedClient&&<small>{dteType==='03'?`NIT ${selectedClient.tax_id||'—'} · NRC ${selectedClient.nrc||'—'}`:selectedClient.document_number||selectedClient.tax_id||''}</small>}</div>
          <button type="submit" disabled={busy||dteType==='03'&&ccfMissing.length>0}>{busy?'Guardando…':dteType==='03'?'Guardar Crédito Fiscal':'Guardar factura'}</button>
        </aside>
      </div>
    </form>
  </section>
}

function Info({label,value}){return <div className="invoice-info"><span>{label}</span><strong>{value||'—'}</strong></div>}
