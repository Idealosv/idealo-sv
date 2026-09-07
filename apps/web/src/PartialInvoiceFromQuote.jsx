import { useEffect, useMemo, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const ELIGIBLE = ['APPROVED','PARTIALLY_CONVERTED','CONVERTED']
const BILLED_DTE = ['PROCESSED']
const ACTIVE_DTE = ['DRAFT','SIGNING','SIGNED','TRANSMITTING','CONTINGENCY']
const round = (value) => Number(Number(value || 0).toFixed(2))

function dteTotal(row){
  const resumen=row?.dte_payload?.resumen||{}
  return round(resumen.totalPagar ?? resumen.montoTotalOperacion ?? 0)
}
function paymentCode(value){
  const text=String(value||'').toUpperCase()
  if(text.includes('TRANSFER'))return'05'
  if(text.includes('CHEQUE'))return'04'
  if(text.includes('TARJETA'))return'03'
  if(text.includes('EFECTIVO'))return'01'
  return'99'
}
function fiscalLine(line,factor){
  const unit=String(line.unit||'').toLowerCase(),quantity=Math.max(Number(line.quantity||1),0.000001)
  const grossPartial=round(Number(line.line_total||0)*factor),taxable=line.taxable!==false
  const basePartial=taxable?round(grossPartial/1.13):grossPartial
  return {tipoItem:unit.includes('serv')?'2':'1',codigo:line.sku||'',descripcion:line.description||'Proyecto',cantidad:String(quantity),uniMedida:unit.includes('serv')?'36':unit.includes('unidad')?'59':'99',precioUni:round(basePartial/quantity).toFixed(2),montoDescu:'0.00',tipoVenta:taxable?'gravada':'exenta'}
}
function fiscalPreview(items){
  let base=0,exenta=0
  items.forEach(item=>{
    const amount=round(Math.max(0,Number(item.cantidad||0)*Number(item.precioUni||0)-Number(item.montoDescu||0)))
    if(item.tipoVenta==='gravada')base=round(base+amount)
    else exenta=round(exenta+amount)
  })
  const iva=round(base*0.13)
  return {base,iva,exenta,total:round(base+iva+exenta)}
}
function buildFiscalItems(lines,factor,expectedTotal){
  const initial=lines.map(line=>fiscalLine(line,factor))
  const target=round(expectedTotal)
  if(!initial.length||target<=0)return initial
  const first=fiscalPreview(initial)
  if(Math.abs(first.total-target)<0.005)return initial

  const preferred=initial.findIndex(item=>item.tipoVenta==='gravada'&&Math.abs(Number(item.cantidad||0)-1)<0.000001)
  const fallback=initial.findIndex(item=>item.tipoVenta==='gravada')
  const index=preferred>=0?preferred:fallback
  if(index<0)return initial

  let best=initial,bestDistance=Math.abs(first.total-target)
  const original=Number(initial[index].precioUni||0)
  for(let cents=-20;cents<=20;cents+=1){
    if(cents===0)continue
    const nextPrice=round(original+(cents/100))
    if(nextPrice<0)continue
    const candidate=initial.map((item,i)=>i===index?{...item,precioUni:nextPrice.toFixed(2)}:item)
    const distance=Math.abs(fiscalPreview(candidate).total-target)
    if(distance+0.000001<bestDistance){best=candidate;bestDistance=distance}
    if(distance<0.005)break
  }
  return best
}
async function apiRequest(path,session,body){
  if(!session?.access_token)throw new Error('La sesión venció. Cierra y vuelve a abrir el módulo de Facturación.')
  const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),20000)
  try{
    const response=await fetch(`${API_URL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),signal:controller.signal})
    const payload=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(payload.message||`La API respondió HTTP ${response.status}.`)
    return payload
  }catch(error){
    if(error.name==='AbortError')throw new Error('La API tardó demasiado en responder. Intenta nuevamente.')
    if(error.message==='Failed to fetch')throw new Error('No se pudo conectar con la API de IDEALO SV.')
    throw error
  }finally{window.clearTimeout(timer)}
}
function openDocuments(){
  window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target:'billing',tab:'documentos'}}))
}

export default function PartialInvoiceFromQuote({session,supabase,company,initialWorkOrderId='',initialQuoteId=''}){
  const [quotes,setQuotes]=useState([]),[quoteId,setQuoteId]=useState(''),[percentage,setPercentage]=useState('saldo'),[mode,setMode]=useState('percentage'),[manualAmount,setManualAmount]=useState('')
  const [billing,setBilling]=useState({billed:0,remaining:0,documents:0,advance:0,advanceAvailable:0}),[lines,setLines]=useState([]),[workOrder,setWorkOrder]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[drafts,setDrafts]=useState([])
  const submitLock=useRef(false)

  useEffect(()=>{supabase.from('quotes').select('id,number,prefix,status,total,tax_mode,client_id,payment_method,project_name').eq('company_id',company.id).in('status',ELIGIBLE).is('soft_deleted_at',null).order('number',{ascending:false}).then(({data})=>setQuotes(data||[]))},[company.id,supabase])
  const quote=quotes.find(row=>row.id===quoteId)||null,projectTotal=round(quote?.total||0)
  const requested=useMemo(()=>{if(!quote)return 0;if(mode==='amount')return round(Math.min(Math.max(0,Number(manualAmount||0)),billing.remaining||projectTotal));if(percentage==='saldo')return round(billing.remaining||projectTotal);return round(Math.min(projectTotal*(Math.max(0,Number(percentage||0))/100),billing.remaining||projectTotal))},[quote,mode,manualAmount,percentage,projectTotal,billing.remaining])
  const factor=projectTotal>0?requested/projectTotal:0
  const fiscalItems=useMemo(()=>buildFiscalItems(lines,factor,requested),[lines,factor,requested])
  const preview=useMemo(()=>fiscalPreview(fiscalItems),[fiscalItems])
  const pendingAfter=round(Math.max(0,(billing.remaining||projectTotal)-requested)),advanceToApply=round(Math.min(billing.advanceAvailable,requested)),receivableAfter=round(Math.max(0,requested-advanceToApply))
  const matchingDraft=useMemo(()=>drafts.find(row=>Math.abs(dteTotal(row)-requested)<0.005)||null,[drafts,requested])

  const chooseQuote=async(id)=>{
    setQuoteId(id);setMessage('');setLines([]);setWorkOrder(null);setDrafts([]);setMode('percentage');setPercentage('saldo');setManualAmount('')
    if(!id){setBilling({billed:0,remaining:0,documents:0,advance:0,advanceAvailable:0});return}
    const selected=quotes.find(row=>row.id===id)
    const [{data:itemRows,error:itemError},{data:dtes,error:dteError},{data:orders},{data:advances,error:advanceError}]=await Promise.all([
      supabase.from('quote_items').select('description,quantity,unit,unit_price,discount,line_total,sku,taxable,tax_rate,tax_amount').eq('quote_id',id).order('sort_order'),
      supabase.from('dte_documents').select('id,status,dte_type,environment,control_number,created_at,dte_payload,source_quote_id,quote_id').eq('company_id',company.id).or(`source_quote_id.eq.${id},quote_id.eq.${id}`).order('created_at',{ascending:false}),
      supabase.from('work_orders').select('id,number,status').eq('company_id',company.id).eq('quote_id',id).order('number',{ascending:false}).limit(1),
      supabase.from('customer_advances').select('id,amount,applied_amount,status,quote_id,work_order_id').eq('company_id',company.id).eq('quote_id',id).in('status',['OPEN','PARTIAL','APPLIED']),
    ])
    if(itemError||dteError||advanceError){setMessage(itemError?.message||dteError?.message||advanceError?.message);return}
    const billedDocs=(dtes||[]).filter(row=>BILLED_DTE.includes(String(row.status||'').toUpperCase())),billed=round(billedDocs.reduce((sum,row)=>sum+dteTotal(row),0)),advance=round((advances||[]).reduce((sum,row)=>sum+Number(row.amount||0),0)),advanceAvailable=round((advances||[]).reduce((sum,row)=>sum+Math.max(0,Number(row.amount||0)-Number(row.applied_amount||0)),0))
    setLines(itemRows||[]);setWorkOrder(orders?.[0]||null);setDrafts((dtes||[]).filter(row=>String(row.dte_type)==='03'&&String(row.environment||'test')==='test'&&ACTIVE_DTE.includes(String(row.status||'').toUpperCase())));setBilling({billed,remaining:round(Math.max(0,Number(selected?.total||0)-billed)),documents:billedDocs.length,advance,advanceAvailable})
  }
  useEffect(()=>{if(!quotes.length)return;const resolve=async()=>{let target=initialQuoteId||'';if(!target&&initialWorkOrderId){const {data,error}=await supabase.from('work_orders').select('quote_id').eq('company_id',company.id).eq('id',initialWorkOrderId).maybeSingle();if(error){setMessage(error.message);return}target=data?.quote_id||''}if(target&&target!==quoteId&&quotes.some(row=>row.id===target))await chooseQuote(target)};resolve()},[initialQuoteId,initialWorkOrderId,quotes.length,company.id,supabase,quoteId])

  const issuePartial=async()=>{
    if(submitLock.current)return
    if(!quote){setMessage('Selecciona una cotización.');return}
    if(!lines.length){setMessage('La cotización no tiene partidas para facturar.');return}
    if(requested<=0){setMessage('El monto del Crédito Fiscal debe ser mayor que cero.');return}
    if(matchingDraft){setMessage(`Ya existe el borrador ${matchingDraft.control_number} por $${requested.toFixed(2)}. No se creó un duplicado.`);openDocuments();return}
    if(requested>billing.remaining+0.01){setMessage('El monto supera el saldo pendiente de facturar.');return}
    if(Math.abs(preview.total-requested)>0.005){setMessage(`El desglose fiscal ($${preview.total.toFixed(2)}) no coincide con el total ($${requested.toFixed(2)}).`);return}
    submitLock.current=true;setBusy(true);setMessage('Creando el Crédito Fiscal…')
    try{
      const percentLabel=projectTotal>0?round((requested/projectTotal)*100):0,ref=[`Cotización ${(quote.prefix||'COT')}-${quote.number}`,workOrder?`OT-${workOrder.number}`:null,requested===billing.remaining?'Facturación del saldo del proyecto':`Facturación parcial ${percentLabel}%`].filter(Boolean).join(' / ')
      const payload=await apiRequest('/api/dte/invoices',session,{companyId:company.id,clientId:quote.client_id,dteType:'03',items:fiscalItems,condicionOperacion:advanceToApply<requested?2:1,totalLetras:`${requested.toFixed(2)} DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`,observaciones:`${ref} · Total proyecto $${projectTotal.toFixed(2)} · CCF $${requested.toFixed(2)} · Pago previo/anticipo $${advanceToApply.toFixed(2)} · Saldo por cobrar al aceptar $${receivableAfter.toFixed(2)}`,payment:{codigo:paymentCode(quote.payment_method),montoPago:requested,referencia:ref,periodo:advanceToApply<requested?30:null,plazo:advanceToApply<requested?'01':null},sourceQuoteId:quote.id,sourceWorkOrderId:workOrder?.id||null,billingKind:requested===billing.remaining?'FINAL':'PARTIAL',billingPercentage:percentLabel,projectTotal})
      const actual=dteTotal(payload)
      if(Math.abs(actual-requested)>0.005)throw new Error(`El borrador se generó por $${actual.toFixed(2)} en vez de $${requested.toFixed(2)}. No continúes con firma/transmisión y repórtalo.`)
      setMessage(`Crédito Fiscal ${payload.control_number} creado correctamente por $${requested.toFixed(2)}.`)
      window.setTimeout(openDocuments,250)
    }catch(error){setMessage(error.message)}finally{submitLock.current=false;setBusy(false)}
  }
  const choosePercentage=value=>{setMode('percentage');setPercentage(value);setManualAmount('')}

  return <section className="panel" style={{marginBottom:16}}>
    <div className="billing-section-intro"><div><strong>Facturar proyecto con pagos previos</strong><small>El Crédito Fiscal se emite por el valor del trabajo. Los pagos ya recibidos se aplican después sin duplicar Caja.</small></div></div>
    <div className="form-grid three">
      <label className="field form-span-3"><span>Proyecto</span><select value={quoteId} onChange={e=>chooseQuote(e.target.value)}><option value="">Seleccionar cotización</option>{quotes.map(row=><option key={row.id} value={row.id}>{`${row.prefix||'COT'}-${row.number} · ${row.project_name||'Proyecto'} · $${Number(row.total||0).toFixed(2)}`}</option>)}</select></label>
      {quote&&<>
        {initialWorkOrderId&&workOrder&&<div className="billing-context-banner form-span-3"><strong>Continuación automática:</strong> OT-{String(workOrder.number).padStart(5,'0')} → Facturación.</div>}
        <div className="billing-context-banner form-span-3" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12}}><span>Total del trabajo<br/><strong>${projectTotal.toFixed(2)}</strong></span><span>Pagado previamente<br/><strong>${billing.advanceAvailable.toFixed(2)}</strong></span><span>Ya facturado MH<br/><strong>${billing.billed.toFixed(2)}</strong></span><span>Saldo del proyecto<br/><strong>${Math.max(0,projectTotal-billing.advanceAvailable).toFixed(2)}</strong></span></div>
        <div className="form-span-3" style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className={mode==='percentage'&&percentage==='saldo'?'':'secondary-button'} onClick={()=>choosePercentage('saldo')}>CCF por todo lo pendiente de facturar</button>{[['25','25% del proyecto'],['50','50% del proyecto'],['75','75% del proyecto']].map(([value,label])=><button key={value} type="button" className={mode==='percentage'&&percentage===value?'':'secondary-button'} onClick={()=>choosePercentage(value)}>{label}</button>)}<button type="button" className={mode==='amount'?'':'secondary-button'} onClick={()=>setMode('amount')}>Otro monto</button></div>
        {mode==='amount'&&<label className="field form-span-3"><span>Monto total del CCF</span><input type="number" min="0.01" step="0.01" max={billing.remaining} value={manualAmount} onChange={e=>setManualAmount(e.target.value)} placeholder={`Máximo $${billing.remaining.toFixed(2)}`}/></label>}
        <div className="billing-context-banner form-span-3" style={{fontSize:'1rem',lineHeight:1.65}}><strong>ANTES DE EMITIR</strong><br/>Crédito Fiscal a emitir: <strong>${requested.toFixed(2)}</strong><br/>Pago previo que se aplicará: <strong>${advanceToApply.toFixed(2)}</strong><br/>Saldo que quedará por cobrar: <strong>${receivableAfter.toFixed(2)}</strong><br/><small>El pago previo ya entró a Caja/Banco y no se volverá a registrar al aceptar el DTE.</small></div>
        <div className="billing-context-banner form-span-3"><strong>DESGLOSE FISCAL:</strong> Base sin IVA ${preview.base.toFixed(2)} · IVA 13% ${preview.iva.toFixed(2)}{preview.exenta>0?` · Exento $${preview.exenta.toFixed(2)}`:''} · Total DTE ${preview.total.toFixed(2)}</div>
        {Math.abs(preview.total-requested)>0.005&&<div className="feedback error form-span-3">El cálculo fiscal no coincide. No se puede emitir todavía.</div>}
        {matchingDraft&&<div className="feedback info form-span-3" role="status"><strong>Ya existe un borrador por este monto:</strong> {matchingDraft.control_number}. Para evitar duplicados, no se creará otro.</div>}
        {message&&<div className={message.includes('correctamente')?'feedback success form-span-3':'feedback info form-span-3'} role="status">{message}</div>}
        <div className="form-span-3" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{matchingDraft?<button type="button" onClick={openDocuments}>Ir a Documentos</button>:<button type="button" onClick={issuePartial} disabled={busy||requested<=0||billing.remaining<=0||Math.abs(preview.total-requested)>0.005}>{busy?'Creando Crédito Fiscal…':`Crear Crédito Fiscal por $${requested.toFixed(2)}`}</button>}</div>
      </>}
    </div>
    <small className="billing-auto-note">Ejemplo: trabajo $80.00, pago previo $40.00 → CCF $80.00 → anticipo aplicado $40.00 → cuenta por cobrar $40.00. El ingreso original de $40.00 no se duplica.</small>
  </section>
}
