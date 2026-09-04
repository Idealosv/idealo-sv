import { useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const ELIGIBLE = ['APPROVED','PARTIALLY_CONVERTED','CONVERTED']
const ACTIVE_DTE = ['DRAFT','SIGNED','PROCESSED']
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

function fiscalLine(line,factor,taxMode){
  const unit=String(line.unit||'').toLowerCase()
  let price=round(Number(line.unit_price||0)*factor)
  let discount=round(Number(line.discount||0)*factor)
  if(line.taxable!==false && taxMode==='INCLUDED'){
    price=round(price/1.13)
    discount=round(discount/1.13)
  }
  return {
    tipoItem:unit.includes('serv')?'2':'1',
    codigo:line.sku||'',
    descripcion:line.description||'Avance parcial del proyecto',
    cantidad:String(line.quantity||1),
    uniMedida:unit.includes('serv')?'36':unit.includes('unidad')?'59':'99',
    precioUni:price.toFixed(2),
    montoDescu:discount.toFixed(2),
    tipoVenta:line.taxable===false?'exenta':'gravada',
  }
}

function fiscalPreview(lines,factor,taxMode){
  const items=lines.map(line=>fiscalLine(line,factor,taxMode))
  let base=0,iva=0,exenta=0
  items.forEach(item=>{
    const amount=round(Math.max(0,Number(item.cantidad||0)*Number(item.precioUni||0)-Number(item.montoDescu||0)))
    if(item.tipoVenta==='gravada'){
      base=round(base+amount)
      iva=round(iva+round(amount*0.13))
    }else exenta=round(exenta+amount)
  })
  return {base,iva,exenta,total:round(base+iva+exenta)}
}

async function apiRequest(path,session,body){
  const response=await fetch(`${API_URL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.message||`La API respondió HTTP ${response.status}.`)
  return payload
}

export default function PartialInvoiceFromQuote({session,supabase,company}){
  const [quotes,setQuotes]=useState([])
  const [quoteId,setQuoteId]=useState('')
  const [percentage,setPercentage]=useState('50')
  const [percentageBase,setPercentageBase]=useState('project')
  const [mode,setMode]=useState('percentage')
  const [manualAmount,setManualAmount]=useState('')
  const [billing,setBilling]=useState({billed:0,remaining:0,documents:0})
  const [lines,setLines]=useState([])
  const [workOrder,setWorkOrder]=useState(null)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(()=>{
    supabase.from('quotes').select('id,number,prefix,status,total,tax_mode,client_id,payment_method,project_name').eq('company_id',company.id).in('status',ELIGIBLE).is('soft_deleted_at',null).order('number',{ascending:false}).then(({data})=>setQuotes(data||[]))
  },[company.id,supabase])

  const quote=quotes.find(row=>row.id===quoteId)||null
  const projectTotal=round(quote?.total||0)
  const requested=useMemo(()=>{
    if(!quote)return 0
    let raw=Number(manualAmount||0)
    if(mode==='percentage'){
      const base=percentageBase==='remaining'?billing.remaining:projectTotal
      raw=base*(Math.max(0,Number(percentage||0))/100)
      if(percentage==='100'&&percentageBase==='project')raw=billing.remaining
    }
    return round(Math.min(Math.max(0,raw),billing.remaining||projectTotal))
  },[quote,mode,percentage,percentageBase,manualAmount,projectTotal,billing.remaining])
  const factor=projectTotal>0?requested/projectTotal:0
  const pendingAfter=round(Math.max(0,(billing.remaining||projectTotal)-requested))
  const preview=useMemo(()=>fiscalPreview(lines,factor,quote?.tax_mode),[lines,factor,quote?.tax_mode])

  const chooseQuote=async(id)=>{
    setQuoteId(id);setMessage('');setLines([]);setWorkOrder(null)
    if(!id){setBilling({billed:0,remaining:0,documents:0});return}
    const selected=quotes.find(row=>row.id===id)
    const [{data:itemRows,error:itemError},{data:dtes,error:dteError},{data:orders}]=await Promise.all([
      supabase.from('quote_items').select('description,quantity,unit,unit_price,discount,sku,taxable').eq('quote_id',id).order('sort_order'),
      supabase.from('dte_documents').select('id,status,dte_payload,source_quote_id,quote_id').eq('company_id',company.id).or(`source_quote_id.eq.${id},quote_id.eq.${id}`),
      supabase.from('work_orders').select('id,number,status').eq('company_id',company.id).eq('quote_id',id).order('number',{ascending:false}).limit(1),
    ])
    if(itemError||dteError){setMessage(itemError?.message||dteError?.message);return}
    const active=(dtes||[]).filter(row=>ACTIVE_DTE.includes(String(row.status||'').toUpperCase()))
    const billed=round(active.reduce((sum,row)=>sum+dteTotal(row),0))
    setLines(itemRows||[]);setWorkOrder(orders?.[0]||null)
    setBilling({billed,remaining:round(Math.max(0,Number(selected?.total||0)-billed)),documents:active.length})
  }

  const issuePartial=async()=>{
    if(!quote||!lines.length||requested<=0)return
    if(requested>billing.remaining+0.01){setMessage('El monto supera el saldo pendiente de facturar.');return}
    setBusy(true);setMessage('')
    try{
      const items=lines.map(line=>fiscalLine(line,factor,quote.tax_mode))
      const percentLabel=projectTotal>0?round((requested/projectTotal)*100):0
      const ref=[`Cotización ${(quote.prefix||'COT')}-${quote.number}`,workOrder?`OT-${workOrder.number}`:null,`Facturación parcial ${percentLabel}%`].filter(Boolean).join(' / ')
      const payload=await apiRequest('/api/dte/invoices',session,{
        companyId:company.id,
        clientId:quote.client_id,
        dteType:'03',
        items,
        condicionOperacion:1,
        totalLetras:`${requested.toFixed(2)} DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`,
        observaciones:`${ref} · Total proyecto $${projectTotal.toFixed(2)} · Parcial $${requested.toFixed(2)} · Base gravada $${preview.base.toFixed(2)} · IVA $${preview.iva.toFixed(2)} · Pendiente $${pendingAfter.toFixed(2)}`,
        payment:{codigo:paymentCode(quote.payment_method),montoPago:requested,referencia:ref,periodo:null,plazo:null},
        sourceQuoteId:quote.id,
        sourceWorkOrderId:workOrder?.id||null,
        billingKind:'PARTIAL',
        billingPercentage:percentLabel,
        projectTotal,
      })
      setMessage(`Crédito Fiscal parcial ${payload.control_number} creado por $${requested.toFixed(2)}. Ahora debe firmarse y enviarse a Hacienda.`)
      await chooseQuote(quote.id)
    }catch(error){setMessage(error.message)}finally{setBusy(false)}
  }

  return <section className="panel" style={{marginBottom:16}}>
    <div className="billing-section-intro"><div><strong>Facturación parcial del proyecto</strong><small>El monto mostrado es el TOTAL del CCF, con su IVA desglosado antes de crearlo.</small></div></div>
    <div className="form-grid three">
      <label className="field form-span-3"><span>Cotización / proyecto</span><select value={quoteId} onChange={e=>chooseQuote(e.target.value)}><option value="">Seleccionar cotización</option>{quotes.map(row=><option key={row.id} value={row.id}>{`${row.prefix||'COT'}-${row.number} · ${row.project_name||'Proyecto'} · $${Number(row.total||0).toFixed(2)}`}</option>)}</select></label>
      {quote&&<>
        <div className="billing-context-banner form-span-3"><strong>Total proyecto: ${projectTotal.toFixed(2)}</strong> · Ya facturado: <strong>${billing.billed.toFixed(2)}</strong> · Saldo pendiente: <strong>${billing.remaining.toFixed(2)}</strong>{billing.documents>0?` · ${billing.documents} DTE previo(s)`:''}</div>
        <label className="field"><span>Cómo facturar</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="percentage">Por porcentaje</option><option value="amount">Por monto exacto</option></select></label>
        {mode==='percentage'&&<label className="field"><span>Calcular porcentaje sobre</span><select value={percentageBase} onChange={e=>setPercentageBase(e.target.value)}><option value="project">Proyecto original (${projectTotal.toFixed(2)})</option><option value="remaining">Saldo pendiente (${billing.remaining.toFixed(2)})</option></select></label>}
        {mode==='percentage'?<label className="field"><span>Porcentaje</span><select value={percentage} onChange={e=>setPercentage(e.target.value)}><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select></label>:<label className="field"><span>Total del CCF a emitir</span><input type="number" min="0.01" step="0.01" value={manualAmount} onChange={e=>setManualAmount(e.target.value)}/></label>}
        <div className="billing-context-banner form-span-3" style={{fontSize:'1rem',lineHeight:1.7}}>
          <strong>DESGLOSE DEL CCF ANTES DE CREARLO</strong><br/>
          Venta gravada sin IVA: <strong>${preview.base.toFixed(2)}</strong> · IVA 13%: <strong>${preview.iva.toFixed(2)}</strong>{preview.exenta>0?<> · Exento: <strong>${preview.exenta.toFixed(2)}</strong></>:null}<br/>
          TOTAL CCF: <strong>${requested.toFixed(2)}</strong> · Saldo del proyecto después de este CCF: <strong>${pendingAfter.toFixed(2)}</strong>
        </div>
        {Math.abs(preview.total-requested)>0.03&&<div className="feedback error form-span-3">Revisá el cálculo fiscal: el desglose calculado (${preview.total.toFixed(2)}) no coincide con el total parcial (${requested.toFixed(2)}). No emitas hasta corregirlo.</div>}
        <div className="form-span-3"><button type="button" onClick={issuePartial} disabled={busy||requested<=0||billing.remaining<=0||Math.abs(preview.total-requested)>0.03}>{busy?'Creando…':`Crear CCF parcial · TOTAL $${requested.toFixed(2)}`}</button></div>
      </>}
    </div>
    {message&&<p className={message.includes('creado')?'feedback success':'feedback error'} role="status">{message}</p>}
    <small className="billing-auto-note">El IVA no se suma otra vez al total mostrado: el botón indica el TOTAL final del CCF. Si ya existe un anticipo en Caja para esta cotización/orden, al aceptarse el DTE se aplica sin duplicar el ingreso.</small>
  </section>
}
