import { useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const ELIGIBLE = ['APPROVED','PARTIALLY_CONVERTED','CONVERTED']
const BILLED_DTE = ['PROCESSED']
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
function fiscalPreview(lines,factor){
  const items=lines.map(line=>fiscalLine(line,factor));let base=0,iva=0,exenta=0
  items.forEach(item=>{const amount=round(Math.max(0,Number(item.cantidad||0)*Number(item.precioUni||0)-Number(item.montoDescu||0)));if(item.tipoVenta==='gravada'){base=round(base+amount);iva=round(iva+round(amount*0.13))}else exenta=round(exenta+amount)})
  return {base,iva,exenta,total:round(base+iva+exenta)}
}
async function apiRequest(path,session,body){
  const response=await fetch(`${API_URL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)})
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||`La API respondió HTTP ${response.status}.`);return payload
}

export default function PartialInvoiceFromQuote({session,supabase,company,initialWorkOrderId='',initialQuoteId=''}){
  const [quotes,setQuotes]=useState([]),[quoteId,setQuoteId]=useState(''),[percentage,setPercentage]=useState('saldo'),[mode,setMode]=useState('percentage'),[manualAmount,setManualAmount]=useState('')
  const [billing,setBilling]=useState({billed:0,remaining:0,documents:0,advance:0,advanceAvailable:0}),[lines,setLines]=useState([]),[workOrder,setWorkOrder]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  useEffect(()=>{supabase.from('quotes').select('id,number,prefix,status,total,tax_mode,client_id,payment_method,project_name').eq('company_id',company.id).in('status',ELIGIBLE).is('soft_deleted_at',null).order('number',{ascending:false}).then(({data})=>setQuotes(data||[]))},[company.id,supabase])
  const quote=quotes.find(row=>row.id===quoteId)||null,projectTotal=round(quote?.total||0)
  const requested=useMemo(()=>{if(!quote)return 0;if(mode==='amount')return round(Math.min(Math.max(0,Number(manualAmount||0)),billing.remaining||projectTotal));if(percentage==='saldo')return round(billing.remaining||projectTotal);return round(Math.min(projectTotal*(Math.max(0,Number(percentage||0))/100),billing.remaining||projectTotal))},[quote,mode,manualAmount,percentage,projectTotal,billing.remaining])
  const factor=projectTotal>0?requested/projectTotal:0,pendingAfter=round(Math.max(0,(billing.remaining||projectTotal)-requested)),preview=useMemo(()=>fiscalPreview(lines,factor),[lines,factor]),advanceToApply=round(Math.min(billing.advanceAvailable,requested)),receivableAfter=round(Math.max(0,requested-advanceToApply))

  const chooseQuote=async(id)=>{
    setQuoteId(id);setMessage('');setLines([]);setWorkOrder(null);setMode('percentage');setPercentage('saldo');setManualAmount('')
    if(!id){setBilling({billed:0,remaining:0,documents:0,advance:0,advanceAvailable:0});return}
    const selected=quotes.find(row=>row.id===id)
    const [{data:itemRows,error:itemError},{data:dtes,error:dteError},{data:orders},{data:advances,error:advanceError}]=await Promise.all([
      supabase.from('quote_items').select('description,quantity,unit,unit_price,discount,line_total,sku,taxable,tax_rate,tax_amount').eq('quote_id',id).order('sort_order'),
      supabase.from('dte_documents').select('id,status,dte_payload,source_quote_id,quote_id').eq('company_id',company.id).or(`source_quote_id.eq.${id},quote_id.eq.${id}`),
      supabase.from('work_orders').select('id,number,status').eq('company_id',company.id).eq('quote_id',id).order('number',{ascending:false}).limit(1),
      supabase.from('customer_advances').select('id,amount,applied_amount,status,quote_id,work_order_id').eq('company_id',company.id).eq('quote_id',id).in('status',['OPEN','PARTIAL','APPLIED']),
    ])
    if(itemError||dteError||advanceError){setMessage(itemError?.message||dteError?.message||advanceError?.message);return}
    const billedDocs=(dtes||[]).filter(row=>BILLED_DTE.includes(String(row.status||'').toUpperCase())),billed=round(billedDocs.reduce((sum,row)=>sum+dteTotal(row),0)),advance=round((advances||[]).reduce((sum,row)=>sum+Number(row.amount||0),0)),advanceAvailable=round((advances||[]).reduce((sum,row)=>sum+Math.max(0,Number(row.amount||0)-Number(row.applied_amount||0)),0))
    setLines(itemRows||[]);setWorkOrder(orders?.[0]||null);setBilling({billed,remaining:round(Math.max(0,Number(selected?.total||0)-billed)),documents:billedDocs.length,advance,advanceAvailable})
  }
  useEffect(()=>{if(!quotes.length)return;const resolve=async()=>{let target=initialQuoteId||'';if(!target&&initialWorkOrderId){const {data,error}=await supabase.from('work_orders').select('quote_id').eq('company_id',company.id).eq('id',initialWorkOrderId).maybeSingle();if(error){setMessage(error.message);return}target=data?.quote_id||''}if(target&&target!==quoteId&&quotes.some(row=>row.id===target))await chooseQuote(target)};resolve()},[initialQuoteId,initialWorkOrderId,quotes.length,company.id,supabase,quoteId])

  const issuePartial=async()=>{
    if(!quote||!lines.length||requested<=0)return;if(requested>billing.remaining+0.01){setMessage('El monto supera el saldo pendiente de facturar.');return}if(Math.abs(preview.total-requested)>0.03){setMessage(`El desglose fiscal ($${preview.total.toFixed(2)}) no coincide con el total ($${requested.toFixed(2)}).`);return}
    setBusy(true);setMessage('')
    try{const items=lines.map(line=>fiscalLine(line,factor)),percentLabel=projectTotal>0?round((requested/projectTotal)*100):0,ref=[`Cotización ${(quote.prefix||'COT')}-${quote.number}`,workOrder?`OT-${workOrder.number}`:null,requested===billing.remaining?'Facturación del saldo del proyecto':`Facturación parcial ${percentLabel}%`].filter(Boolean).join(' / ')
      const payload=await apiRequest('/api/dte/invoices',session,{companyId:company.id,clientId:quote.client_id,dteType:'03',items,condicionOperacion:advanceToApply<requested?2:1,totalLetras:`${requested.toFixed(2)} DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`,observaciones:`${ref} · Total proyecto $${projectTotal.toFixed(2)} · CCF $${requested.toFixed(2)} · Pago previo/anticipo $${advanceToApply.toFixed(2)} · Saldo por cobrar al aceptar $${receivableAfter.toFixed(2)}`,payment:{codigo:paymentCode(quote.payment_method),montoPago:requested,referencia:ref,periodo:advanceToApply<requested?30:null,plazo:advanceToApply<requested?'01':null},sourceQuoteId:quote.id,sourceWorkOrderId:workOrder?.id||null,billingKind:requested===billing.remaining?'FINAL':'PARTIAL',billingPercentage:percentLabel,projectTotal})
      setMessage(`Crédito Fiscal ${payload.control_number} creado por $${requested.toFixed(2)}. Pago previo a aplicar: $${advanceToApply.toFixed(2)}. Saldo esperado: $${receivableAfter.toFixed(2)}.`);await chooseQuote(quote.id)
    }catch(error){setMessage(error.message)}finally{setBusy(false)}
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
        {Math.abs(preview.total-requested)>0.03&&<div className="feedback error form-span-3">El cálculo fiscal no coincide. No se puede emitir todavía.</div>}
        <div className="form-span-3"><button type="button" onClick={issuePartial} disabled={busy||requested<=0||billing.remaining<=0||Math.abs(preview.total-requested)>0.03}>{busy?'Creando…':`Crear Crédito Fiscal por $${requested.toFixed(2)}`}</button></div>
      </>}
    </div>
    {message&&<p className={message.includes('creado')?'feedback success':'feedback error'} role="status">{message}</p>}
    <small className="billing-auto-note">Ejemplo: trabajo $80.00, pago previo $40.00 → CCF $80.00 → anticipo aplicado $40.00 → cuenta por cobrar $40.00. El ingreso original de $40.00 no se duplica.</small>
  </section>
}
