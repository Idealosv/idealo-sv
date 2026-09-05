import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

export default function InternalIncomeCard({company,supabase,accounts=[],clients=[],onSaved}){
 const activeAccounts=useMemo(()=>accounts.filter(a=>a.active!==false),[accounts])
 const [mode,setMode]=useState('WORK'),[quotes,setQuotes]=useState([]),[orders,setOrders]=useState([]),[payments,setPayments]=useState([])
 const [form,setForm]=useState({client_id:'',quote_id:'',work_order_id:'',cash_account_id:'',amount:'',concept:'',received_at:day(),payment_method:'CASH',reference:'',notes:''})
 const [saving,setSaving]=useState(false),[message,setMessage]=useState('')
 const loadWork=async()=>{if(!company?.id)return;const [q,w,p]=await Promise.all([
  supabase.from('quotes').select('id,number,prefix,client_id,project_name,total,status').eq('company_id',company.id).order('created_at',{ascending:false}).limit(150),
  supabase.from('work_orders').select('id,number,quote_id,client_id,total,status').eq('company_id',company.id).order('created_at',{ascending:false}).limit(150),
  supabase.from('internal_income_records').select('id,quote_id,work_order_id,amount').eq('company_id',company.id)
 ]);setQuotes(q.data||[]);setOrders(w.data||[]);setPayments(p.data||[])}
 useEffect(()=>{loadWork()},[company?.id])
 useEffect(()=>{if(!form.cash_account_id&&activeAccounts.length)setForm(f=>({...f,cash_account_id:activeAccounts[0].cash_account_id}))},[activeAccounts,form.cash_account_id])
 const selectedOrder=orders.find(x=>x.id===form.work_order_id),selectedQuote=quotes.find(x=>x.id===(selectedOrder?.quote_id||form.quote_id))
 const selectedClient=clients.find(x=>x.id===(selectedOrder?.client_id||selectedQuote?.client_id||form.client_id))
 const total=Number(selectedOrder?.total||selectedQuote?.total||0)
 const paid=payments.filter(p=>selectedOrder? p.work_order_id===selectedOrder.id : (!p.work_order_id&&p.quote_id===form.quote_id)).reduce((s,p)=>s+Number(p.amount||0),0)
 const pending=Math.max(0,total-paid),percent=total>0?Math.min(100,(paid/total)*100):0
 const filteredQuotes=quotes.filter(q=>!form.client_id||q.client_id===form.client_id)
 const filteredOrders=orders.filter(o=>(!form.client_id||o.client_id===form.client_id)&&(!form.quote_id||o.quote_id===form.quote_id))
 const workConcept=selectedQuote?.project_name?.trim()||selectedOrder?`Pago de ${selectedQuote?.project_name?.trim()||'trabajo'}`:''
 const chooseQuote=id=>{const q=quotes.find(x=>x.id===id);const matching=orders.filter(o=>o.quote_id===id);const autoOrder=matching.length===1?matching[0]:null;setForm(f=>({...f,quote_id:id,work_order_id:autoOrder?.id||'',client_id:q?.client_id||f.client_id,concept:q?.project_name?.trim()||'Trabajo'}))}
 const chooseOrder=id=>{const o=orders.find(x=>x.id===id),q=quotes.find(x=>x.id===o?.quote_id);setForm(f=>({...f,work_order_id:id,quote_id:o?.quote_id||f.quote_id,client_id:o?.client_id||f.client_id,concept:q?.project_name?.trim()||'Trabajo'}))}
 const setPercent=n=>{if(pending>0)setForm(f=>({...f,amount:(pending*n/100).toFixed(2)}))}
 const save=async e=>{e.preventDefault();setMessage('');const amount=Number(form.amount);const concept=mode==='WORK'?(selectedQuote?.project_name?.trim()||'Pago de trabajo'):form.concept.trim();if(!form.cash_account_id||!concept||!Number.isFinite(amount)||amount<=0){setMessage('Selecciona dónde recibir el dinero y un monto mayor que cero.');return}if(mode==='WORK'&&!form.quote_id&&!form.work_order_id){setMessage('Selecciona la Cotización u OT que estás cobrando.');return}if(mode==='WORK'&&pending>0&&amount>pending+.009){setMessage(`El pago supera el saldo pendiente de ${money(pending)}.`);return}setSaving(true);const {error}=await supabase.rpc('register_internal_income',{p_company_id:company.id,p_cash_account_id:form.cash_account_id,p_amount:amount,p_concept:concept,p_received_at:`${form.received_at}T12:00:00`,p_payment_method:form.payment_method,p_client_id:(selectedClient?.id||form.client_id)||null,p_reference:form.reference||null,p_notes:form.notes||null,p_quote_id:mode==='WORK'?(form.quote_id||null):null,p_work_order_id:mode==='WORK'?(form.work_order_id||null):null});if(error)setMessage(error.message);else{setMessage(`${mode==='WORK'?'Pago':'Otro ingreso'} de ${money(amount)} registrado. No se creó ni transmitió ningún DTE.`);setForm(f=>({...f,amount:'',reference:'',notes:'',concept:mode==='WORK'?f.concept:''}));await loadWork();await onSaved?.()}setSaving(false)}
 return <form onSubmit={save} className="form-card cash-advance-card internal-income-card">
  <div className="cash-section-heading compact"><div><p className="form-kicker">REGISTRO INTERNO</p><h3>Registrar dinero recibido</h3><small>Control de Caja/Banco. No crea, firma ni transmite DTE automáticamente.</small></div><span className="cash-pending-pill">SIN DTE</span></div>
  <div className="cash-form-footer"><div><button type="button" className={mode==='WORK'?'confirm':'secondary'} onClick={()=>setMode('WORK')}>Pago de trabajo</button> <button type="button" className={mode==='OTHER'?'confirm':'secondary'} onClick={()=>setMode('OTHER')}>Otro ingreso</button></div></div>
  {message&&<p className={message.includes('registrado')?'feedback success':'feedback error'}>{message}</p>}
  {mode==='WORK'&&<><div className="cash-advance-grid">
   <label>Cliente<select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value,quote_id:'',work_order_id:'',concept:''})}><option value="">Seleccionar cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Cotización<select value={form.quote_id} onChange={e=>chooseQuote(e.target.value)}><option value="">Seleccionar</option>{filteredQuotes.map(q=><option key={q.id} value={q.id}>{q.prefix||'COT'}-{q.number} · {q.project_name||'Trabajo'} · {money(q.total)}</option>)}</select></label>
   <label>OT<select value={form.work_order_id} onChange={e=>chooseOrder(e.target.value)}><option value="">Sin OT / usar cotización</option>{filteredOrders.map(o=><option key={o.id} value={o.id}>OT-{o.number} · {money(o.total)}</option>)}</select></label>
  </div>{selectedQuote&&<div className="cash-shift-message"><strong>{selectedClient?.name||'Cliente'}</strong> · {selectedQuote.prefix||'COT'}-{selectedQuote.number}{selectedOrder?` · OT-${selectedOrder.number}`:''} · {selectedQuote.project_name||'Trabajo'}</div>}{total>0&&<div className="cash-shift-summary"><article><small>Total trabajo</small><strong>{money(total)}</strong></article><article><small>Recibido</small><strong>{money(paid)}</strong></article><article className="expected"><small>Pendiente</small><strong>{money(pending)}</strong></article><article><small>Pagado</small><strong>{percent.toFixed(0)}%</strong></article></div>}<div className="cash-form-footer"><span>Pago rápido:</span><div><button type="button" className="secondary" onClick={()=>setPercent(25)}>25%</button> <button type="button" className="secondary" onClick={()=>setPercent(50)}>50%</button> <button type="button" className="secondary" onClick={()=>setPercent(100)}>Saldo completo</button></div></div></>}
  <div className="cash-advance-grid">
   {mode==='OTHER'&&<label>Concepto *<input required maxLength="160" value={form.concept} onChange={e=>setForm({...form,concept:e.target.value})} placeholder="Ej. aporte, reintegro u otro ingreso"/></label>}
   {mode==='OTHER'&&<label>Cliente <span>(opcional)</span><select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}><option value="">Sin identificar</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
   <label>Monto recibido *<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00"/></label>
   <label>Forma de ingreso<select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
   <label>Recibir en<select required value={form.cash_account_id} onChange={e=>setForm({...form,cash_account_id:e.target.value})}><option value="">Seleccionar</option>{activeAccounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name}</option>)}</select></label>
  </div>
  <div className="cash-form-footer"><details className="cash-more-data"><summary>Más datos</summary><div className="cash-extra-grid"><label>Fecha<input type="date" value={form.received_at} onChange={e=>setForm({...form,received_at:e.target.value})}/></label><label>Referencia<input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="Referencia interna"/></label><label>Nota<input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observación opcional"/></label></div></details><button type="submit" disabled={saving}>{saving?'Registrando…':mode==='WORK'?'Registrar pago':'Registrar otro ingreso'}</button></div>
  <p className="cash-shift-message">Al seleccionar una Cotización u OT, IDEALO SV toma automáticamente cliente, trabajo, total y saldo pendiente. Solo indicas cuánto recibiste, la forma de pago y dónde entró el dinero.</p>
 </form>
}
