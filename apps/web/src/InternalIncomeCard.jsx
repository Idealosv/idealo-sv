import {useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export default function InternalIncomeCard({company,supabase,accounts=[],clients=[],onSaved}){
  const activeAccounts=useMemo(()=>accounts.filter(a=>a.active!==false),[accounts])
  const [form,setForm]=useState({client_id:'',cash_account_id:'',amount:'',concept:'',received_at:day(),payment_method:'CASH',reference:'',notes:''})
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')

  const save=async e=>{
    e.preventDefault();setMessage('')
    const amount=Number(form.amount)
    if(!form.cash_account_id||!form.concept.trim()||!Number.isFinite(amount)||amount<=0){setMessage('Selecciona la cuenta, escribe el concepto y un monto mayor que cero.');return}
    setSaving(true)
    const {error}=await supabase.rpc('register_internal_income',{
      p_company_id:company.id,p_cash_account_id:form.cash_account_id,p_amount:amount,p_concept:form.concept.trim(),
      p_received_at:`${form.received_at}T12:00:00`,p_payment_method:form.payment_method,p_client_id:form.client_id||null,
      p_reference:form.reference||null,p_notes:form.notes||null
    })
    if(error)setMessage(error.message)
    else{
      setMessage(`Ingreso interno de ${money(amount)} registrado. No se creó ni transmitió ningún DTE.`)
      setForm(f=>({...f,client_id:'',amount:'',concept:'',reference:'',notes:''}))
      await onSaved?.()
    }
    setSaving(false)
  }

  return <form onSubmit={save} className="form-card cash-advance-card internal-income-card">
    <div className="cash-section-heading compact"><div><p className="form-kicker">INGRESO INTERNO</p><h3>Registrar ingreso sin emitir DTE</h3><small>Control interno de Caja/Banco. No crea, firma ni transmite factura.</small></div><span className="cash-pending-pill">SIN DTE</span></div>
    {message&&<p className={message.includes('registrado')?'feedback success':'feedback error'}>{message}</p>}
    <div className="cash-advance-grid">
      <label>Concepto *<input required maxLength="160" value={form.concept} onChange={e=>setForm({...form,concept:e.target.value})} placeholder="Ej. Venta mostrador / servicio recibido"/></label>
      <label>Cliente <span>(opcional)</span><select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}><option value="">Sin identificar</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Monto *<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/></label>
      <label>Forma de ingreso<select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
      <label>Recibir en<select required value={form.cash_account_id} onChange={e=>setForm({...form,cash_account_id:e.target.value})}><option value="">Seleccionar</option>{activeAccounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name}</option>)}</select></label>
    </div>
    <div className="cash-form-footer"><details className="cash-more-data"><summary>Más datos</summary><div className="cash-extra-grid"><label>Fecha<input type="date" value={form.received_at} onChange={e=>setForm({...form,received_at:e.target.value})}/></label><label>Referencia<input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="Referencia interna"/></label><label>Nota<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observación opcional"/></label></div></details><button type="submit" disabled={saving}>{saving?'Registrando…':'Registrar ingreso interno'}</button></div>
    <p className="cash-shift-message">Este registro suma a Caja, Dashboard y reportes financieros, pero queda identificado como “Sin DTE emitido”.</p>
  </form>
}
