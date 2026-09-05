import { useEffect, useMemo, useState } from 'react'
import { addDays, balance, isOpen, localIsoDate, matchesReceivableFilter, money, statusLabel } from './billingReceivables.js'
import { reverseCustomerPayment } from './paymentReversal.js'
import CustomerAdvancesPanel from './CustomerAdvancesPanel.jsx'
import './billing-receivables-payments.css'

const emptyPayment={open:false,row:null,amount:'',payment_method:'CASH',cash_account_id:'',reference:'',notes:'',payment_key:''}

export default function BillingReceivablesPanel({company,supabase,onOpenCash,focusWorkOrderId='',focusQuoteId=''}){
  const [receivables,setReceivables]=useState([])
  const [payments,setPayments]=useState([])
  const [reversals,setReversals]=useState([])
  const [accounts,setAccounts]=useState([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [success,setSuccess]=useState('')
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState('OPEN')
  const [reversing,setReversing]=useState('')
  const [paying,setPaying]=useState(false)
  const [payment,setPayment]=useState(emptyPayment)

  const load=async()=>{
    setLoading(true);setMessage('')
    const [ar,pay,rev,acc]=await Promise.all([
      supabase.from('accounts_receivable').select('id,number,concept,work_order_id,quote_id,dte_document_id,amount_total,amount_paid,status,due_date,created_at,client_id,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('customer_payments').select('id,amount,paid_at,payment_method,reference,client_id,cash_account_id,source_advance_id,clients(name)').eq('company_id',company.id).order('paid_at',{ascending:false}).limit(50),
      supabase.from('customer_payment_reversals').select('id,payment_id,reason,reversed_at').eq('company_id',company.id).order('reversed_at',{ascending:false}).limit(100),
      supabase.from('cash_account_balances').select('cash_account_id,name,account_type,current_balance,active').eq('company_id',company.id).eq('active',true).order('name'),
    ])
    const error=ar.error||pay.error||rev.error||acc.error
    if(error)setMessage(error.message)
    else{setReceivables(ar.data||[]);setPayments(pay.data||[]);setReversals(rev.data||[]);setAccounts(acc.data||[])}
    setLoading(false)
  }

  useEffect(()=>{load()},[company.id])
  useEffect(()=>{if(focusWorkOrderId||focusQuoteId){setFilter('OPEN');setQuery('')}},[focusWorkOrderId,focusQuoteId])

  const reversalByPayment=useMemo(()=>new Map(reversals.map(row=>[row.payment_id,row])),[reversals])
  const accountById=useMemo(()=>new Map(accounts.map(row=>[row.cash_account_id,row])),[accounts])

  const reversePayment=async paymentRow=>{
    const existing=reversalByPayment.get(paymentRow.id)
    if(existing)return
    const reason=window.prompt('Motivo de la reversión del cobro:','')
    if(reason===null)return
    if(String(reason).trim().length<4){setMessage('Indicá un motivo de al menos 4 caracteres.');return}
    if(!window.confirm(`Se registrará una reversión por ${money(paymentRow.amount)}. El pago original se conservará. ¿Continuar?`))return
    setReversing(paymentRow.id);setMessage('');setSuccess('')
    try{await reverseCustomerPayment({supabase,paymentId:paymentRow.id,reason});setSuccess('Cobro reversado correctamente.');await load()}
    catch(error){setMessage(error?.message||'No se pudo reversar el cobro.')}
    finally{setReversing('')}
  }

  const openPayment=row=>{
    const pending=balance(row)
    const preferred=accounts.find(a=>['CASH','PETTY_CASH'].includes(a.account_type))||accounts[0]
    setMessage('');setSuccess('')
    setPayment({open:true,row,amount:pending.toFixed(2),payment_method:'CASH',cash_account_id:preferred?.cash_account_id||'',reference:'',notes:'',payment_key:crypto.randomUUID()})
  }

  const closePayment=()=>{if(!paying)setPayment(emptyPayment)}

  const submitPayment=async event=>{
    event.preventDefault()
    if(!payment.row||paying)return
    const amount=Number(payment.amount)
    const pending=balance(payment.row)
    if(!Number.isFinite(amount)||amount<=0){setMessage('Ingresá un abono mayor que cero.');return}
    if(amount>pending+.001){setMessage(`El abono no puede superar el saldo pendiente de ${money(pending)}.`);return}
    if(!payment.cash_account_id){setMessage('Seleccioná la Caja o Banco donde ingresó el dinero.');return}
    setPaying(true);setMessage('');setSuccess('')
    const {error}=await supabase.rpc('register_customer_payment',{
      p_receivable:payment.row.id,
      p_cash_account:payment.cash_account_id,
      p_amount:amount,
      p_payment_method:payment.payment_method,
      p_reference:payment.reference.trim()||null,
      p_notes:payment.notes.trim()||null,
      p_payment_key:payment.payment_key,
    })
    if(error){
      const text=String(error.message||'')
      setMessage(text.includes('Caja cerrada')?'Caja cerrada. Abrí la caja antes de recibir efectivo o elegí una cuenta bancaria.':text)
      setPaying(false);return
    }
    const remaining=Math.max(pending-amount,0)
    setPayment(emptyPayment)
    setSuccess(remaining<.005?`Cobro registrado. ${payment.row.clients?.name||'El cliente'} quedó al día.`:`Abono registrado. Saldo pendiente ${money(remaining)}.`)
    setPaying(false)
    await load()
  }

  const stats=useMemo(()=>{
    const today=localIsoDate(),open=receivables.filter(isOpen)
    const overdue=open.filter(row=>row.due_date&&row.due_date<today)
    const due7=open.filter(row=>row.due_date&&row.due_date>=today&&row.due_date<=addDays(today,7))
    const due30=open.filter(row=>row.due_date&&row.due_date>=today&&row.due_date<=addDays(today,30))
    return {open:open.reduce((sum,row)=>sum+balance(row),0),overdue:overdue.reduce((sum,row)=>sum+balance(row),0),due7:due7.reduce((sum,row)=>sum+balance(row),0),due30:due30.reduce((sum,row)=>sum+balance(row),0),overdueCount:overdue.length,openCount:open.length}
  },[receivables])

  const visible=useMemo(()=>{
    const needle=query.trim().toLowerCase(),today=localIsoDate(),hasFocus=Boolean(focusWorkOrderId||focusQuoteId)
    return receivables.filter(row=>{
      const focusMatches=!hasFocus||row.work_order_id===focusWorkOrderId||row.quote_id===focusQuoteId
      return focusMatches&&matchesReceivableFilter(row,filter,today)&&(!needle||[row.number,row.clients?.name,row.concept,row.status].some(value=>String(value||'').toLowerCase().includes(needle)))
    })
  },[receivables,query,filter,focusWorkOrderId,focusQuoteId])

  if(loading)return <section className="billing-ar-state">Cargando cuentas por cobrar…</section>

  const pending=payment.row?balance(payment.row):0
  const after=Math.max(pending-Number(payment.amount||0),0)
  const selectedAccount=accountById.get(payment.cash_account_id)
  const focused=Boolean(focusWorkOrderId||focusQuoteId)

  return <section className="billing-ar">
    <div className="billing-ar-head"><div><p className="form-kicker">COBRANZA · FACTURACIÓN</p><h3>Cuentas por cobrar</h3><p>Facturas a crédito, vencimientos, abonos parciales y cobros conectados directamente con Caja o Banco.</p></div><div className="billing-ar-actions"><button type="button" className="secondary-button" onClick={load}>Actualizar</button>{onOpenCash&&<button type="button" onClick={onOpenCash}>Abrir Caja</button>}</div></div>
    {focused&&<div className="billing-context-banner"><strong>Mostrando la cuenta por cobrar del trabajo recién facturado.</strong></div>}
    {message&&<p className="feedback error">{message}</p>}
    {success&&<p className="feedback success">{success}</p>}
    <div className="billing-ar-kpis"><Kpi label="Saldo por cobrar" value={money(stats.open)}/><Kpi label="Vencido" value={money(stats.overdue)} danger={stats.overdue>0}/><Kpi label="Vence en 7 días" value={money(stats.due7)}/><Kpi label="Vence en 30 días" value={money(stats.due30)}/><Kpi label="Cuentas abiertas" value={stats.openCount}/><Kpi label="Cuentas vencidas" value={stats.overdueCount} danger={stats.overdueCount>0}/></div>
    <CustomerAdvancesPanel company={company} supabase={supabase} onRegistered={load}/>
    <div className="billing-ar-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar cliente o documento" aria-label="Buscar cuentas por cobrar"/><select value={filter} onChange={event=>setFilter(event.target.value)}><option value="OPEN">Pendientes</option><option value="OVERDUE">Vencidas</option><option value="DUE7">Por vencer</option><option value="PAID">Pagadas</option><option value="CANCELLED">Anuladas</option><option value="ALL">Todas</option></select></div>
    <div className="billing-ar-grid">
      <section className="billing-ar-card"><div className="billing-ar-card-head"><div><span>CARTERA</span><strong>Documentos por cobrar</strong></div><small>{visible.length} registro(s)</small></div>{visible.length?<div className="billing-ar-table-wrap"><table className="billing-ar-table"><thead><tr><th>Documento</th><th>Cliente</th><th>Vence</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><strong>{row.number||'Cuenta'}</strong><small>{row.concept||'Facturación'}</small></td><td>{row.clients?.name||'Cliente'}</td><td>{row.due_date||'Sin fecha'}</td><td>{money(row.amount_total)}</td><td>{money(row.amount_paid)}</td><td><strong>{money(balance(row))}</strong></td><td><span className={`billing-ar-status ${statusLabel(row).toLowerCase().replaceAll(' ','-')}`}>{statusLabel(row)}</span></td><td>{isOpen(row)&&<button type="button" className="billing-ar-pay-button" onClick={()=>openPayment(row)}>Registrar cobro</button>}</td></tr>)}</tbody></table></div>:<div className="billing-ar-empty">{focused?'Todavía no aparece una cuenta por cobrar abierta para este trabajo.':'No hay cuentas para este filtro.'}</div>}</section>
      <aside className="billing-ar-card billing-ar-payments"><div className="billing-ar-card-head"><div><span>COBROS</span><strong>Últimos pagos</strong></div></div>{payments.length?<div className="billing-ar-payment-list">{payments.slice(0,12).map(paymentRow=>{const reversal=reversalByPayment.get(paymentRow.id),account=accountById.get(paymentRow.cash_account_id);return <div key={paymentRow.id}><div><strong>{paymentRow.clients?.name||'Cliente'}</strong><small>{paymentRow.paid_at?new Date(paymentRow.paid_at).toLocaleString('es-SV'):'—'} · {paymentRow.source_advance_id?'Anticipo aplicado':paymentRow.payment_method||'Pago'}</small><small>{account?.name||'Caja/Banco'}{paymentRow.reference?` · Ref. ${paymentRow.reference}`:''}{reversal?' · REVERSADO':''}</small>{reversal&&<small title={reversal.reason}>Motivo: {reversal.reason}</small>}</div><div><strong>{money(paymentRow.amount)}</strong>{!reversal&&<button type="button" className="secondary-button" disabled={reversing===paymentRow.id} onClick={()=>reversePayment(paymentRow)}>{reversing===paymentRow.id?'Reversando…':'Reversar'}</button>}</div></div>})}</div>:<div className="billing-ar-empty">Todavía no hay cobros registrados.</div>}</aside>
    </div>

    {payment.open&&<div className="billing-payment-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closePayment()}}><form className="billing-payment-modal" onSubmit={submitPayment}>
      <div className="billing-payment-head"><div><p className="form-kicker">REGISTRAR COBRO</p><h3>{payment.row?.clients?.name||'Cliente'}</h3><small>{payment.row?.number||payment.row?.concept||'Cuenta por cobrar'}</small></div><button type="button" onClick={closePayment} disabled={paying}>×</button></div>
      <div className="billing-payment-summary"><article><small>Saldo actual</small><strong>{money(pending)}</strong></article><article><small>Abono</small><strong>{money(payment.amount)}</strong></article><article className={after<.005?'paid':'partial'}><small>Saldo después</small><strong>{money(after)}</strong><em>{after<.005?'QUEDARÁ PAGADA':'QUEDARÁ PARCIAL'}</em></article></div>
      <div className="billing-payment-grid">
        <label>Monto a recibir *<input autoFocus required type="number" min="0.01" max={pending} step="0.01" value={payment.amount} onChange={e=>setPayment(v=>({...v,amount:e.target.value}))}/></label>
        <label>Forma de pago<select value={payment.payment_method} onChange={e=>setPayment(v=>({...v,payment_method:e.target.value}))}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
        <label className="wide">Ingresar a Caja / Banco *<select required value={payment.cash_account_id} onChange={e=>setPayment(v=>({...v,cash_account_id:e.target.value}))}><option value="">Seleccionar</option>{accounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name} · {a.account_type==='BANK'?'Banco':'Caja'} · {money(a.current_balance)}</option>)}</select><small>{selectedAccount?.account_type==='BANK'?'Banco disponible sin apertura de caja.':'Si es efectivo, la caja seleccionada debe estar abierta.'}</small></label>
        <label>Referencia<input value={payment.reference} onChange={e=>setPayment(v=>({...v,reference:e.target.value}))} placeholder="Transferencia, recibo, cheque…"/></label>
        <label>Nota<input value={payment.notes} onChange={e=>setPayment(v=>({...v,notes:e.target.value}))} placeholder="Opcional"/></label>
      </div>
      <div className="billing-payment-actions"><button type="button" className="secondary-button" onClick={closePayment} disabled={paying}>Cancelar</button><button type="submit" disabled={paying||!payment.cash_account_id||Number(payment.amount)<=0||Number(payment.amount)>pending}>{paying?'Registrando…':'Registrar cobro'}</button></div>
    </form></div>}
  </section>
}

function Kpi({label,value,danger=false}){return <article className={`billing-ar-kpi ${danger?'danger':''}`}><small>{label}</small><strong>{value}</strong></article>}
