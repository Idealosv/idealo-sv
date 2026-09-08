import { useEffect, useMemo, useState } from 'react'

const money=value=>`$${Number(value||0).toFixed(2)}`
const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
const methodLabel={CASH:'Efectivo',TRANSFER:'Transferencia',CARD:'Tarjeta',CHECK:'Cheque',OTHER:'Otro'}

export default function CustomerAdvancesPanel({company,supabase,onRegistered}){
  const [clients,setClients]=useState([])
  const [accounts,setAccounts]=useState([])
  const [projects,setProjects]=useState([])
  const [advances,setAdvances]=useState([])
  const [clientId,setClientId]=useState('')
  const [projectKey,setProjectKey]=useState('')
  const [accountId,setAccountId]=useState('')
  const [amount,setAmount]=useState('')
  const [paymentMethod,setPaymentMethod]=useState('CASH')
  const [receivedDate,setReceivedDate]=useState(today())
  const [reference,setReference]=useState('')
  const [notes,setNotes]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [messageType,setMessageType]=useState('success')

  const load=async()=>{
    const [c,a,q,w,ad]=await Promise.all([
      supabase.from('clients').select('id,name').eq('company_id',company.id).order('name'),
      supabase.from('cash_accounts').select('id,name,account_type,active').eq('company_id',company.id).eq('active',true).order('name'),
      supabase.from('quotes').select('id,number,prefix,client_id,project_name,status,total').eq('company_id',company.id).is('soft_deleted_at',null).order('created_at',{ascending:false}).limit(100),
      supabase.from('work_orders').select('id,quote_id,number,status,title').eq('company_id',company.id).order('created_at',{ascending:false}).limit(100),
      supabase.from('customer_advances').select('id,client_id,quote_id,work_order_id,cash_account_id,amount,applied_amount,payment_method,reference,received_at,status,clients(name),cash_accounts(name)').eq('company_id',company.id).order('received_at',{ascending:false}).limit(100),
    ])
    const error=c.error||a.error||q.error||w.error||ad.error
    if(error){setMessage(error.message);setMessageType('error');return}
    setClients(c.data||[]);setAccounts(a.data||[]);setAdvances(ad.data||[])
    const orderByQuote=new Map((w.data||[]).map(row=>[row.quote_id,row]))
    setProjects((q.data||[]).map(quote=>({quote,workOrder:orderByQuote.get(quote.id)||null})))
    setAccountId(current=>current||(a.data||[])[0]?.id||'')
  }

  useEffect(()=>{load()},[company.id])

  const clientProjects=useMemo(()=>projects.filter(row=>!clientId||row.quote.client_id===clientId),[projects,clientId])
  const pendingTotal=useMemo(()=>advances.filter(row=>row.status==='OPEN'||row.status==='PARTIAL').reduce((sum,row)=>sum+Math.max(0,Number(row.amount)-Number(row.applied_amount)),0),[advances])

  const register=async event=>{
    event.preventDefault();setMessage('')
    if(!clientId){setMessage('Seleccioná el cliente que entregó el anticipo.');setMessageType('error');return}
    if(!accountId){setMessage('Seleccioná la caja o banco donde entró el dinero.');setMessageType('error');return}
    if(!(Number(amount)>0)){setMessage('Ingresá un monto de anticipo mayor a cero.');setMessageType('error');return}
    const project=projects.find(row=>row.quote.id===projectKey)||null
    setBusy(true)
    const {error}=await supabase.rpc('register_customer_advance',{
      p_company:company.id,p_client:clientId,p_cash_account:accountId,p_amount:Number(amount),p_payment_method:paymentMethod,
      p_quote:project?.quote.id||null,p_work_order:project?.workOrder?.id||null,p_reference:reference||null,p_notes:notes||null,
      p_received_at:`${receivedDate}T12:00:00`,
    })
    setBusy(false)
    if(error){setMessage(error.message);setMessageType('error');return}
    setMessage(`Anticipo de ${money(amount)} registrado en Caja/Banco y pendiente de aplicar a la factura final.`);setMessageType('success')
    setAmount('');setReference('');setNotes('');setProjectKey('')
    await load();onRegistered?.()
  }

  return <section className="billing-ar-card" style={{marginBottom:16}}>
    <div className="billing-ar-card-head"><div><span>ANTICIPOS</span><strong>Dinero recibido antes de facturar</strong></div><small>Pendiente de aplicar: {money(pendingTotal)}</small></div>
    <p style={{margin:'0 0 12px',color:'#64748b'}}>Registra el dinero en Caja hoy sin emitir todavía el Crédito Fiscal. Al facturar el mismo proyecto, IDEALO SV aplica el anticipo y evita duplicar el ingreso.</p>
    {message&&<p className={`feedback ${messageType==='error'?'error':'success'}`}>{message}</p>}
    <form className="form-grid two" onSubmit={register}>
      <label className="field"><span>Cliente *</span><select value={clientId} onChange={e=>{setClientId(e.target.value);setProjectKey('')}}><option value="">Seleccionar cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field"><span>Proyecto / cotización</span><select value={projectKey} onChange={e=>setProjectKey(e.target.value)}><option value="">Sin vincular todavía</option>{clientProjects.map(({quote,workOrder})=><option key={quote.id} value={quote.id}>{`${quote.prefix||'COT'}-${quote.number}${workOrder?` · OT-${workOrder.number}`:''} · ${quote.project_name||'Proyecto'} · ${money(quote.total)}`}</option>)}</select></label>
      <label className="field"><span>Fecha en que se recibió *</span><input type="date" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)}/></label>
      <label className="field"><span>Monto recibido *</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="40.00"/></label>
      <label className="field"><span>Forma de pago *</span><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
      <label className="field"><span>Ingresó a *</span><select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Seleccionar Caja/Banco</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.account_type==='CASH'?'Caja':'Banco'}</option>)}</select></label>
      <label className="field"><span>Referencia</span><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Comprobante, transferencia, recibo…"/></label>
      <label className="field"><span>Nota</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Anticipo pendiente de CCF al entregar"/></label>
      <div className="form-span-2"><button type="submit" disabled={busy}>{busy?'Registrando…':'Registrar anticipo en Caja'}</button></div>
    </form>
    <div style={{marginTop:16}}><div className="billing-ar-card-head"><div><span>HISTORIAL</span><strong>Anticipos recientes</strong></div></div>{advances.length?<div className="billing-ar-table-wrap"><table className="billing-ar-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Ingreso</th><th>Aplicado</th><th>Pendiente</th><th>Estado</th></tr></thead><tbody>{advances.slice(0,12).map(row=><tr key={row.id}><td>{String(row.received_at||'').slice(0,10)}</td><td><strong>{row.clients?.name||'Cliente'}</strong><small>{methodLabel[row.payment_method]||row.payment_method} · {row.cash_accounts?.name||'Caja/Banco'}</small></td><td>{money(row.amount)}</td><td>{money(row.applied_amount)}</td><td><strong>{money(Math.max(0,Number(row.amount)-Number(row.applied_amount)))}</strong></td><td>{row.status==='APPLIED'?'Aplicado':row.status==='PARTIAL'?'Parcial':'Pendiente'}</td></tr>)}</tbody></table></div>:<div className="billing-ar-empty">Todavía no hay anticipos registrados.</div>}</div>
  </section>
}
