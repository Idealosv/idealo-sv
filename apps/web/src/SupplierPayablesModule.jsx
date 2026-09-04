import { useEffect, useMemo, useState } from 'react'

const money=(v)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const date=(v)=>v?new Date(`${v}T12:00:00`).toLocaleDateString('es-SV'):'—'
const newPaymentKey=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`
const balanceOf=r=>Math.max(0,Number(r?.amount_total||0)-Number(r?.amount_paid||0))

export default function SupplierPayablesModule({company,supabase}){
  const [rows,setRows]=useState([]),[payments,setPayments]=useState([]),[accounts,setAccounts]=useState([]),[sessions,setSessions]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [pay,setPay]=useState({payable_id:'',cash_account_id:'',amount:'',payment_method:'CASH',reference:'',notes:'',payment_key:newPaymentKey()})

  const load=async()=>{
    const [r,p,a,s]=await Promise.all([
      supabase.from('accounts_payable').select('*,suppliers(name),purchases(number,concept,document_type,document_number,purchase_date,procurement_status)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('supplier_payments').select('*,suppliers(name),cash_accounts(name),accounts_payable(number,concept)').eq('company_id',company.id).order('paid_at',{ascending:false}).limit(120),
      supabase.from('cash_account_balances').select('cash_account_id,name,account_type,current_balance,active').eq('company_id',company.id).eq('active',true).order('name'),
      supabase.from('cash_register_sessions').select('id,cash_account_id,status').eq('company_id',company.id).eq('status','OPEN'),
    ])
    const error=r.error||p.error||a.error||s.error
    if(error){setMessage(error.message);return}
    setRows(r.data||[]);setPayments(p.data||[]);setAccounts(a.data||[]);setSessions(s.data||[])
    const preferred=(a.data||[]).find(x=>['CASH','CAJA'].includes(String(x.account_type).toUpperCase())&&(s.data||[]).some(y=>y.cash_account_id===x.cash_account_id))||(a.data||[])[0]
    setPay(v=>({...v,cash_account_id:v.cash_account_id||preferred?.cash_account_id||''}))
  }
  useEffect(()=>{load()},[company.id])

  const openRows=useMemo(()=>rows.filter(r=>!['PAID','CANCELLED'].includes(r.status)),[rows])
  const pending=useMemo(()=>openRows.reduce((sum,r)=>sum+balanceOf(r),0),[openRows])
  const overdue=useMemo(()=>openRows.filter(r=>r.due_date&&r.due_date<new Date().toISOString().slice(0,10)).reduce((sum,r)=>sum+balanceOf(r),0),[openRows])
  const paidThisMonth=useMemo(()=>{const key=new Date().toISOString().slice(0,7);return payments.filter(p=>p.paid_at?.startsWith(key)).reduce((sum,p)=>sum+Number(p.amount||0),0)},[payments])
  const selected=useMemo(()=>rows.find(r=>r.id===pay.payable_id),[rows,pay.payable_id])
  const selectedAccount=useMemo(()=>accounts.find(a=>a.cash_account_id===pay.cash_account_id),[accounts,pay.cash_account_id])
  const currentBalance=balanceOf(selected),amount=Number(pay.amount||0),after=Math.max(0,currentBalance-amount)
  const accountBalance=Number(selectedAccount?.current_balance||0)
  const isCash=['CASH','CAJA'].includes(String(selectedAccount?.account_type||'').toUpperCase())
  const cashOpen=!isCash||sessions.some(s=>s.cash_account_id===pay.cash_account_id)
  const enoughFunds=amount<=accountBalance+0.001

  const selectPayable=(id)=>{
    const r=rows.find(x=>x.id===id),balance=balanceOf(r)
    setPay(v=>({...v,payable_id:id,amount:balance?String(balance.toFixed(2)):'',payment_key:newPaymentKey()}))
    window.setTimeout(()=>document.querySelector('[data-cxp-payment-form]')?.scrollIntoView({behavior:'smooth',block:'start'}),0)
  }

  const registerPayment=async(e)=>{
    e.preventDefault();if(busy)return;setMessage('')
    if(!selected)return setMessage('Seleccioná una cuenta por pagar.')
    if(!pay.cash_account_id)return setMessage('Seleccioná la Caja o Banco desde donde se pagará.')
    if(amount<=0||amount>currentBalance+0.001)return setMessage(`El pago debe ser mayor a $0 y no superar ${money(currentBalance)}.`)
    if(!cashOpen)return setMessage('Caja cerrada. Primero debes abrir la caja antes de registrar este pago en efectivo.')
    if(!enoughFunds)return setMessage(`Saldo insuficiente en ${selectedAccount?.name||'la cuenta seleccionada'}. Disponible: ${money(accountBalance)}.`)
    setBusy(true)
    const {error}=await supabase.rpc('register_supplier_payment',{p_payable:selected.id,p_cash_account:pay.cash_account_id,p_amount:amount,p_payment_method:pay.payment_method,p_reference:pay.reference.trim()||null,p_notes:pay.notes.trim()||null,p_payment_key:pay.payment_key})
    if(error)setMessage(error.message)
    else{
      setMessage(`${after<0.01?'Cuenta pagada':'Abono registrado'}: ${money(amount)} salió de ${selectedAccount?.name||'Caja/Banco'}. Saldo pendiente ${money(after)}.`)
      setPay(v=>({...v,payable_id:'',amount:'',reference:'',notes:'',payment_key:newPaymentKey()}));await load()
    }
    setBusy(false)
  }

  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">OBLIGACIONES</p><h2>Cuentas por pagar</h2><p>Controlá lo que debés a proveedores, aboná parcialmente o pagá completo y descontá automáticamente de Caja o Banco.</p></div><span className={overdue>0?'status dte-pending':'status dte-ready'}>{overdue>0?`${money(overdue)} vencido`:'Sin vencidos'}</span></div>
    <div className="metrics-grid"><article className="metric-card"><span>Saldo por pagar</span><strong>{money(pending)}</strong></article><article className="metric-card"><span>Saldo vencido</span><strong>{money(overdue)}</strong></article><article className="metric-card"><span>Pagado este mes</span><strong>{money(paidThisMonth)}</strong></article><article className="metric-card"><span>Cuentas abiertas</span><strong>{openRows.length}</strong></article></div>
    {message&&<p className={/pagada|registrado|salió de/i.test(message)?'feedback success':'feedback error'}>{message}</p>}

    <form className="panel client-form-full" onSubmit={registerPayment} data-cxp-payment-form>
      <div className="panel-heading"><div><p className="form-kicker">PAGO A PROVEEDOR</p><h3>Registrar abono o pago completo</h3></div></div>
      <div className="form-grid three">
        <label className="field form-span-2"><span>Cuenta por pagar *</span><select required value={pay.payable_id} onChange={e=>selectPayable(e.target.value)}><option value="">Seleccionar obligación</option>{openRows.map(r=><option key={r.id} value={r.id}>CXP-{String(r.number).padStart(5,'0')} · {r.suppliers?.name||'Proveedor ocasional'} · saldo {money(balanceOf(r))}</option>)}</select></label>
        <label className="field"><span>Pagar desde *</span><select required value={pay.cash_account_id} onChange={e=>setPay({...pay,cash_account_id:e.target.value})}><option value="">Seleccionar Caja / Banco</option>{accounts.map(a=>{const cash=['CASH','CAJA'].includes(String(a.account_type).toUpperCase()),open=!cash||sessions.some(s=>s.cash_account_id===a.cash_account_id);return <option key={a.cash_account_id} value={a.cash_account_id}>{a.name} · {cash?'Caja':'Banco'} · {money(a.current_balance)}{cash?open?' · ABIERTA':' · CERRADA':''}</option>})}</select></label>
        <label className="field"><span>Monto del abono *</span><input type="number" min="0.01" step="0.01" required value={pay.amount} onChange={e=>setPay({...pay,amount:e.target.value})}/></label>
        <label className="field"><span>Forma de pago</span><select value={pay.payment_method} onChange={e=>setPay({...pay,payment_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
        <label className="field"><span>Referencia</span><input value={pay.reference} onChange={e=>setPay({...pay,reference:e.target.value})} placeholder="Transferencia / cheque / comprobante"/></label>
        {selected&&<div className="field form-span-3"><span>Resumen antes de confirmar</span><div className="purchase-tax-summary"><b>Saldo actual {money(currentBalance)}</b><b>Abono {money(amount)}</b><strong>Quedará {money(after)}</strong></div><small>{selectedAccount?`${selectedAccount.name}: disponible ${money(accountBalance)}${isCash?cashOpen?' · caja abierta':' · CAJA CERRADA':''}`:'Seleccioná la cuenta de salida.'}</small></div>}
        <label className="field form-span-3"><span>Notas</span><textarea rows="2" value={pay.notes} onChange={e=>setPay({...pay,notes:e.target.value})}/></label>
      </div><div className="form-actions end"><button disabled={!accounts.length||busy||!selected||amount<=0||amount>currentBalance+0.001||!cashOpen||!enoughFunds}>{busy?'Registrando pago…':after<0.01?'Pagar cuenta completa':'Registrar abono'}</button></div>
      {!accounts.length&&<div className="dte-note">Primero crea una Caja o Banco para registrar pagos.</div>}
      {selectedAccount&&isCash&&!cashOpen&&<div className="dte-note">Esta caja está cerrada. Abrila en el módulo Caja antes de pagar en efectivo.</div>}
      {selectedAccount&&amount>0&&!enoughFunds&&<div className="dte-note">No hay saldo suficiente. Disponible {money(accountBalance)}.</div>}
    </form>

    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">PENDIENTES</p><h3>Obligaciones con proveedores</h3></div></div>
      {rows.length?<div className="client-list">{rows.map(r=>{const balance=balanceOf(r),isOverdue=r.status!=='PAID'&&r.due_date&&r.due_date<new Date().toISOString().slice(0,10);return <div className="client-row" key={r.id}><div><strong>CXP-{String(r.number).padStart(5,'0')} · {r.suppliers?.name||'Proveedor ocasional'}</strong><small>{r.purchases?`COM-${String(r.purchases.number).padStart(5,'0')} · `:''}{r.concept}</small><small>Vence {date(r.due_date)} · pagado {money(r.amount_paid)} de {money(r.amount_total)}</small></div><div><strong>{money(balance)}</strong><small>{r.status}{isOverdue?' · VENCIDA':''}</small>{balance>0&&!['CANCELLED'].includes(r.status)&&<button type="button" onClick={()=>selectPayable(r.id)}>Pagar / abonar</button>}</div></div>})}</div>:<div className="empty-state"><strong>Sin cuentas por pagar</strong><p>Las compras pendientes aparecerán automáticamente aquí.</p></div>}
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">PAGOS</p><h3>Últimos pagos a proveedores</h3></div></div>
      {payments.length?<div className="client-list">{payments.slice(0,30).map(p=><div className="client-row" key={p.id}><div><strong>{p.suppliers?.name||'Proveedor ocasional'} · {money(p.amount)}</strong><small>{new Date(p.paid_at).toLocaleString('es-SV')} · {p.payment_method} · desde {p.cash_accounts?.name||'Caja/Banco'}</small></div><div><strong>{p.accounts_payable?`CXP-${String(p.accounts_payable.number).padStart(5,'0')}`:'CXP'}</strong><small>{p.reference||'Sin referencia'}</small></div></div>)}</div>:<div className="empty-state"><strong>Sin pagos registrados</strong></div>}
    </section>
  </section>
}
