import { useEffect, useMemo, useState } from 'react'

const money=(v)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const date=(v)=>v?new Date(`${v}T12:00:00`).toLocaleDateString('es-SV'):'—'
const newPaymentKey=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`

export default function SupplierPayablesModule({company,supabase}){
  const [rows,setRows]=useState([]),[payments,setPayments]=useState([]),[accounts,setAccounts]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [pay,setPay]=useState({payable_id:'',cash_account_id:'',amount:'',payment_method:'CASH',reference:'',notes:'',payment_key:newPaymentKey()})

  const load=async()=>{
    const [r,p,a]=await Promise.all([
      supabase.from('accounts_payable').select('*,suppliers(name),purchases(number,concept,document_type,document_number,purchase_date,procurement_status)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('supplier_payments').select('*,suppliers(name),cash_accounts(name),accounts_payable(number,concept)').eq('company_id',company.id).order('paid_at',{ascending:false}).limit(120),
      supabase.from('cash_accounts').select('*').eq('company_id',company.id).eq('active',true).order('name'),
    ])
    if(r.error||p.error||a.error)setMessage(r.error?.message||p.error?.message||a.error?.message)
    else{
      setRows(r.data||[]);setPayments(p.data||[]);setAccounts(a.data||[])
      setPay(v=>({...v,cash_account_id:v.cash_account_id||a.data?.[0]?.id||''}))
    }
  }
  useEffect(()=>{load()},[company.id])

  const openRows=useMemo(()=>rows.filter(r=>!['PAID','CANCELLED'].includes(r.status)),[rows])
  const pending=useMemo(()=>openRows.reduce((s,r)=>s+Math.max(0,Number(r.amount_total)-Number(r.amount_paid)),0),[openRows])
  const overdue=useMemo(()=>openRows.filter(r=>r.due_date&&r.due_date<new Date().toISOString().slice(0,10)).reduce((s,r)=>s+Math.max(0,Number(r.amount_total)-Number(r.amount_paid)),0),[openRows])
  const paidThisMonth=useMemo(()=>{const key=new Date().toISOString().slice(0,7);return payments.filter(p=>p.paid_at?.startsWith(key)).reduce((s,p)=>s+Number(p.amount||0),0)},[payments])

  const selectPayable=(id)=>{
    const r=rows.find(x=>x.id===id)
    const balance=r?Math.max(0,Number(r.amount_total)-Number(r.amount_paid)):0
    setPay(v=>({...v,payable_id:id,amount:balance?String(balance.toFixed(2)):'',payment_key:newPaymentKey()}))
  }

  const registerPayment=async(e)=>{
    e.preventDefault();if(busy)return;setMessage('')
    const r=rows.find(x=>x.id===pay.payable_id)
    if(!r)return setMessage('Seleccioná una cuenta por pagar.')
    if(!pay.cash_account_id)return setMessage('Seleccioná la caja o banco desde donde se pagará.')
    const balance=Math.max(0,Number(r.amount_total)-Number(r.amount_paid));const amount=Number(pay.amount||0)
    if(amount<=0||amount>balance+0.001)return setMessage(`El pago debe ser mayor a $0 y no superar ${money(balance)}.`)
    setBusy(true)
    const {error}=await supabase.rpc('register_supplier_payment',{
      p_payable:r.id,p_cash_account:pay.cash_account_id,p_amount:amount,p_payment_method:pay.payment_method,
      p_reference:pay.reference.trim()||null,p_notes:pay.notes.trim()||null,p_payment_key:pay.payment_key,
    })
    if(error)setMessage(error.message)
    else{
      setMessage('Pago aplicado al proveedor y salida registrada una sola vez en Caja.')
      setPay(v=>({...v,payable_id:'',amount:'',reference:'',notes:'',payment_key:newPaymentKey()}));await load()
    }
    setBusy(false)
  }

  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">OBLIGACIONES</p><h2>Cuentas por pagar</h2><p>Las compras de inventario generan su obligación cuando quedan recibidas. Desde aquí puedes abonar o pagar y registrar automáticamente la salida de Caja.</p></div><span className={overdue>0?'status dte-pending':'status dte-ready'}>{overdue>0?`${money(overdue)} vencido`:'Sin vencidos'}</span></div>
    <div className="metrics-grid"><article className="metric-card"><span>Saldo por pagar</span><strong>{money(pending)}</strong></article><article className="metric-card"><span>Saldo vencido</span><strong>{money(overdue)}</strong></article><article className="metric-card"><span>Pagado este mes</span><strong>{money(paidThisMonth)}</strong></article><article className="metric-card"><span>Cuentas abiertas</span><strong>{openRows.length}</strong></article></div>
    {message&&<p className={/aplicado|una sola vez/i.test(message)?'feedback success':'feedback error'}>{message}</p>}
    <form className="panel client-form-full" onSubmit={registerPayment}>
      <div className="panel-heading"><div><p className="form-kicker">PAGO A PROVEEDOR</p><h3>Registrar abono o pago completo</h3></div></div>
      <div className="form-grid three">
        <label className="field form-span-2"><span>Cuenta por pagar *</span><select required value={pay.payable_id} onChange={e=>selectPayable(e.target.value)}><option value="">Seleccionar obligación</option>{openRows.map(r=><option key={r.id} value={r.id}>CXP-{String(r.number).padStart(5,'0')} · {r.suppliers?.name||'Proveedor ocasional'} · saldo {money(Number(r.amount_total)-Number(r.amount_paid))}</option>)}</select></label>
        <label className="field"><span>Caja / banco *</span><select required value={pay.cash_account_id} onChange={e=>setPay({...pay,cash_account_id:e.target.value})}><option value="">Seleccionar</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.account_type}</option>)}</select></label>
        <label className="field"><span>Monto *</span><input type="number" min="0.01" step="0.01" required value={pay.amount} onChange={e=>setPay({...pay,amount:e.target.value})}/></label>
        <label className="field"><span>Forma de pago</span><select value={pay.payment_method} onChange={e=>setPay({...pay,payment_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
        <label className="field"><span>Referencia</span><input value={pay.reference} onChange={e=>setPay({...pay,reference:e.target.value})} placeholder="Transferencia / cheque / comprobante"/></label>
        <label className="field form-span-3"><span>Notas</span><textarea rows="2" value={pay.notes} onChange={e=>setPay({...pay,notes:e.target.value})}/></label>
      </div><div className="form-actions end"><button disabled={!accounts.length||busy}>{busy?'Registrando pago…':'Registrar pago y salida de caja'}</button></div>
      {!accounts.length&&<div className="dte-note">Primero crea una cuenta en Caja (Caja principal, caja chica o banco) para registrar pagos.</div>}
    </form>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">PENDIENTES</p><h3>Obligaciones con proveedores</h3></div></div>
      {rows.length?<div className="client-list">{rows.map(r=>{const balance=Math.max(0,Number(r.amount_total)-Number(r.amount_paid));const isOverdue=r.status!=='PAID'&&r.due_date&&r.due_date<new Date().toISOString().slice(0,10);return <div className="client-row" key={r.id}><div><strong>CXP-{String(r.number).padStart(5,'0')} · {r.suppliers?.name||'Proveedor ocasional'}</strong><small>{r.purchases?`COM-${String(r.purchases.number).padStart(5,'0')} · `:''}{r.concept}</small><small>Vence {date(r.due_date)} · pagado {money(r.amount_paid)} de {money(r.amount_total)}</small></div><div><strong>{money(balance)}</strong><small>{r.status}{isOverdue?' · VENCIDA':''}</small>{balance>0&&<button type="button" onClick={()=>selectPayable(r.id)}>Pagar</button>}</div></div>})}</div>:<div className="empty-state"><strong>Sin cuentas por pagar</strong><p>Las compras manuales registradas y las compras de inventario ya recibidas aparecerán automáticamente aquí.</p></div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">PAGOS</p><h3>Últimos pagos a proveedores</h3></div></div>
      {payments.length?<div className="client-list">{payments.slice(0,30).map(p=><div className="client-row" key={p.id}><div><strong>{p.suppliers?.name||'Proveedor ocasional'} · {money(p.amount)}</strong><small>{new Date(p.paid_at).toLocaleString('es-SV')} · {p.payment_method} · desde {p.cash_accounts?.name||'Caja'}</small></div><div><strong>{p.accounts_payable?`CXP-${String(p.accounts_payable.number).padStart(5,'0')}`:'CXP'}</strong><small>{p.reference||'Sin referencia'}</small></div></div>)}</div>:<div className="empty-state"><strong>Sin pagos registrados</strong></div>}
    </section>
  </section>
}
