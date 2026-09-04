import { useEffect, useMemo, useState } from 'react'
import { addDays, balance, isOpen, localIsoDate, matchesReceivableFilter, money, statusLabel } from './billingReceivables.js'
import { reverseCustomerPayment } from './paymentReversal.js'
import CustomerAdvancesPanel from './CustomerAdvancesPanel.jsx'

export default function BillingReceivablesPanel({company,supabase,onOpenCash}){
  const [receivables,setReceivables]=useState([])
  const [payments,setPayments]=useState([])
  const [reversals,setReversals]=useState([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState('OPEN')
  const [reversing,setReversing]=useState('')

  const load=async()=>{
    setLoading(true);setMessage('')
    const [ar,pay,rev]=await Promise.all([
      supabase.from('accounts_receivable').select('id,number,concept,work_order_id,quote_id,dte_document_id,amount_total,amount_paid,status,due_date,created_at,client_id,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('customer_payments').select('id,amount,paid_at,payment_method,reference,client_id,clients(name)').eq('company_id',company.id).order('paid_at',{ascending:false}).limit(50),
      supabase.from('customer_payment_reversals').select('id,payment_id,reason,reversed_at').eq('company_id',company.id).order('reversed_at',{ascending:false}).limit(100),
    ])
    const error=ar.error||pay.error||rev.error
    if(error)setMessage(error.message)
    else{setReceivables(ar.data||[]);setPayments(pay.data||[]);setReversals(rev.data||[])}
    setLoading(false)
  }

  useEffect(()=>{load()},[company.id])

  const reversalByPayment=useMemo(()=>new Map(reversals.map(row=>[row.payment_id,row])),[reversals])

  const reversePayment=async payment=>{
    const existing=reversalByPayment.get(payment.id)
    if(existing)return
    const reason=window.prompt('Motivo de la reversión del cobro:','')
    if(reason===null)return
    if(String(reason).trim().length<4){setMessage('Indicá un motivo de al menos 4 caracteres.');return}
    if(!window.confirm(`Se registrará una reversión por ${money(payment.amount)}. El pago original se conservará. ¿Continuar?`))return
    setReversing(payment.id);setMessage('')
    try{
      await reverseCustomerPayment({supabase,paymentId:payment.id,reason})
      await load()
    }catch(error){setMessage(error?.message||'No se pudo reversar el cobro.')}
    finally{setReversing('')}
  }

  const stats=useMemo(()=>{
    const today=localIsoDate()
    const open=receivables.filter(isOpen)
    const overdue=open.filter(row=>row.due_date&&row.due_date<today)
    const due7=open.filter(row=>row.due_date&&row.due_date>=today&&row.due_date<=addDays(today,7))
    const due30=open.filter(row=>row.due_date&&row.due_date>=today&&row.due_date<=addDays(today,30))
    return {
      open:open.reduce((sum,row)=>sum+balance(row),0),
      overdue:overdue.reduce((sum,row)=>sum+balance(row),0),
      due7:due7.reduce((sum,row)=>sum+balance(row),0),
      due30:due30.reduce((sum,row)=>sum+balance(row),0),
      overdueCount:overdue.length,
      openCount:open.length,
    }
  },[receivables])

  const visible=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    const today=localIsoDate()
    return receivables.filter(row=>{
      if(!matchesReceivableFilter(row,filter,today))return false
      if(!needle)return true
      return [row.number,row.clients?.name,row.concept,row.status].some(value=>String(value||'').toLowerCase().includes(needle))
    })
  },[receivables,query,filter])

  if(loading)return <section className="billing-ar-state">Cargando cuentas por cobrar…</section>

  return <section className="billing-ar">
    <div className="billing-ar-head"><div><p className="form-kicker">COBRANZA · FACTURACIÓN</p><h3>Cuentas por cobrar</h3><p>Controla facturas a crédito, vencimientos, anticipos y cobros registrados sin salir del módulo de Facturación.</p></div><div className="billing-ar-actions"><button type="button" className="secondary-button" onClick={load}>Actualizar</button>{onOpenCash&&<button type="button" onClick={onOpenCash}>Abrir Caja</button>}</div></div>
    {message&&<p className="feedback error">{message}</p>}
    <div className="billing-ar-kpis"><Kpi label="Saldo por cobrar" value={money(stats.open)}/><Kpi label="Vencido" value={money(stats.overdue)} danger={stats.overdue>0}/><Kpi label="Vence en 7 días" value={money(stats.due7)}/><Kpi label="Vence en 30 días" value={money(stats.due30)}/><Kpi label="Cuentas abiertas" value={stats.openCount}/><Kpi label="Cuentas vencidas" value={stats.overdueCount} danger={stats.overdueCount>0}/></div>
    <CustomerAdvancesPanel company={company} supabase={supabase} onRegistered={load}/>
    <div className="billing-ar-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar cliente o documento" aria-label="Buscar cuentas por cobrar"/><select value={filter} onChange={event=>setFilter(event.target.value)}><option value="OPEN">Pendientes</option><option value="OVERDUE">Vencidas</option><option value="DUE7">Por vencer</option><option value="PAID">Pagadas</option><option value="CANCELLED">Anuladas</option><option value="ALL">Todas</option></select></div>
    <div className="billing-ar-grid">
      <section className="billing-ar-card"><div className="billing-ar-card-head"><div><span>CARTERA</span><strong>Documentos por cobrar</strong></div><small>{visible.length} registro(s)</small></div>{visible.length?<div className="billing-ar-table-wrap"><table className="billing-ar-table"><thead><tr><th>Documento</th><th>Cliente</th><th>Vence</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><strong>{row.number||'Cuenta'}</strong><small>{row.concept||'Facturación'}</small></td><td>{row.clients?.name||'Cliente'}</td><td>{row.due_date||'Sin fecha'}</td><td>{money(row.amount_total)}</td><td>{money(row.amount_paid)}</td><td><strong>{money(balance(row))}</strong></td><td><span className={`billing-ar-status ${statusLabel(row).toLowerCase().replace(' ','-')}`}>{statusLabel(row)}</span></td></tr>)}</tbody></table></div>:<div className="billing-ar-empty">No hay cuentas para este filtro.</div>}</section>
      <aside className="billing-ar-card billing-ar-payments"><div className="billing-ar-card-head"><div><span>COBROS</span><strong>Últimos pagos</strong></div></div>{payments.length?<div className="billing-ar-payment-list">{payments.slice(0,12).map(payment=>{const reversal=reversalByPayment.get(payment.id);return <div key={payment.id}><div><strong>{payment.clients?.name||'Cliente'}</strong><small>{payment.paid_at?new Date(payment.paid_at).toLocaleString('es-SV'):'—'} · {payment.payment_method||'Pago'}{reversal?' · REVERSADO':''}</small>{reversal&&<small title={reversal.reason}>Motivo: {reversal.reason}</small>}</div><div><strong>{money(payment.amount)}</strong>{!reversal&&<button type="button" className="secondary-button" disabled={reversing===payment.id} onClick={()=>reversePayment(payment)}>{reversing===payment.id?'Reversando…':'Reversar'}</button>}</div></div>})}</div>:<div className="billing-ar-empty">Todavía no hay cobros registrados.</div>}</aside>
    </div>
  </section>
}

function Kpi({label,value,danger=false}){return <article className={`billing-ar-kpi ${danger?'danger':''}`}><small>{label}</small><strong>{value}</strong></article>}
