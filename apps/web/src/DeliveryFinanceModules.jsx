import { useEffect, useMemo, useState } from 'react'

const money = (value) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0))
const dt = (value) => value ? new Date(value).toLocaleString('es-SV') : '—'

export function DeliveriesModule({ company, supabase }) {
  const [orders,setOrders]=useState([]), [rows,setRows]=useState([]), [message,setMessage]=useState('')
  const [form,setForm]=useState({work_order_id:'',delivery_method:'PICKUP',scheduled_at:'',delivery_address:'',notes:''})
  const load=async()=>{
    const [o,d]=await Promise.all([
      supabase.from('work_orders').select('id,number,title,status,client_id,total,clients(name)').eq('company_id',company.id).in('status',['READY','DELIVERED']).order('created_at',{ascending:false}),
      supabase.from('deliveries').select('*,clients(name),work_orders(number,title,total,status)').eq('company_id',company.id).order('created_at',{ascending:false})
    ])
    if(o.error||d.error) setMessage(o.error?.message||d.error?.message); else {setOrders(o.data||[]);setRows(d.data||[])}
  }
  useEffect(()=>{load()},[company.id])
  const create=async(e)=>{
    e.preventDefault(); const order=orders.find(x=>x.id===form.work_order_id); if(!order)return setMessage('Seleccioná una orden lista para entregar.')
    const {error}=await supabase.from('deliveries').insert({company_id:company.id,work_order_id:order.id,client_id:order.client_id,delivery_method:form.delivery_method,scheduled_at:form.scheduled_at||null,delivery_address:form.delivery_address||null,notes:form.notes||null,status:form.scheduled_at?'SCHEDULED':'READY'})
    if(error)setMessage(error.message); else {setMessage('Entrega creada.');setForm({work_order_id:'',delivery_method:'PICKUP',scheduled_at:'',delivery_address:'',notes:''});await load()}
  }
  const delivered=async(r)=>{
    const recipient=window.prompt('Nombre de quien recibe:','')
    if(recipient===null)return
    const {error}=await supabase.from('deliveries').update({status:'DELIVERED',delivered_at:new Date().toISOString(),recipient_name:recipient||null,updated_at:new Date().toISOString()}).eq('id',r.id)
    if(!error&&r.work_order_id) await supabase.from('work_orders').update({status:'DELIVERED',updated_at:new Date().toISOString()}).eq('id',r.work_order_id)
    setMessage(error?error.message:'Entrega confirmada.');await load()
  }
  const open=rows.filter(r=>r.status!=='DELIVERED'&&r.status!=='CANCELLED').length
  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">LOGÍSTICA</p><h2>Entregas</h2><p>Controla retiro, envío o instalación del trabajo terminado y registra quién lo recibió.</p></div><span className="status dte-ready">{open} pendientes</span></div>
    {message&&<p className="feedback success">{message}</p>}
    <form className="panel client-form-full" onSubmit={create}><div className="form-grid three">
      <label className="field form-span-2"><span>Orden lista *</span><select required value={form.work_order_id} onChange={e=>setForm({...form,work_order_id:e.target.value})}><option value="">Seleccionar orden</option>{orders.filter(o=>!rows.some(r=>r.work_order_id===o.id)).map(o=><option key={o.id} value={o.id}>OT-{String(o.number).padStart(5,'0')} · {o.clients?.name||'Cliente'} · {o.title}</option>)}</select></label>
      <label className="field"><span>Modalidad</span><select value={form.delivery_method} onChange={e=>setForm({...form,delivery_method:e.target.value})}><option value="PICKUP">Retiro en local</option><option value="DELIVERY">Envío</option><option value="INSTALLATION">Instalación</option></select></label>
      <label className="field"><span>Fecha programada</span><input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})}/></label>
      <label className="field form-span-2"><span>Dirección / lugar</span><input value={form.delivery_address} onChange={e=>setForm({...form,delivery_address:e.target.value})}/></label>
      <label className="field form-span-3"><span>Indicaciones</span><textarea rows="2" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    </div><div className="form-actions end"><button>Crear entrega</button></div></form>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">SEGUIMIENTO</p><h3>Entregas recientes</h3></div></div>
    {rows.length?<div className="client-list">{rows.map(r=><div className="client-row" key={r.id}><div><strong>ENT-{String(r.number).padStart(5,'0')} · {r.clients?.name||'Cliente'}</strong><small>{r.work_orders?.title||'Trabajo'} · {r.delivery_method} · programada {dt(r.scheduled_at)}</small><small>{r.status==='DELIVERED'?`Recibió: ${r.recipient_name||'Sin nombre'} · ${dt(r.delivered_at)}`:r.delivery_address||'Sin dirección adicional'}</small></div><div><strong>{r.status}</strong>{r.status!=='DELIVERED'&&r.status!=='CANCELLED'&&<button onClick={()=>delivered(r)}>Confirmar entrega</button>}</div></div>)}</div>:<div className="empty-state"><strong>Sin entregas</strong><p>Cuando una orden llegue a LISTO podrás programar su entrega.</p></div>}
    </section>
  </section>
}

export function ReceivablesModule({ company, supabase }) {
  const [orders,setOrders]=useState([]),[rows,setRows]=useState([]),[payments,setPayments]=useState([]),[message,setMessage]=useState('')
  const [form,setForm]=useState({work_order_id:'',concept:'',amount_total:'',due_date:''})
  const [pay,setPay]=useState({receivable_id:'',amount:'',payment_method:'CASH',reference:''})
  const load=async()=>{
    const [o,r,p]=await Promise.all([
      supabase.from('work_orders').select('id,number,title,total,client_id,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('accounts_receivable').select('*,clients(name),work_orders(number,title)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('customer_payments').select('*').eq('company_id',company.id).order('paid_at',{ascending:false}).limit(100)
    ])
    if(o.error||r.error||p.error)setMessage(o.error?.message||r.error?.message||p.error?.message);else{setOrders(o.data||[]);setRows(r.data||[]);setPayments(p.data||[])}
  }
  useEffect(()=>{load()},[company.id])
  const selectOrder=(id)=>{const o=orders.find(x=>x.id===id);setForm({work_order_id:id,concept:o?`OT-${String(o.number).padStart(5,'0')} · ${o.title}`:'',amount_total:o?.total||'',due_date:''})}
  const create=async(e)=>{e.preventDefault();const o=orders.find(x=>x.id===form.work_order_id);if(!o)return setMessage('Seleccioná una orden.');const {error}=await supabase.from('accounts_receivable').insert({company_id:company.id,client_id:o.client_id,work_order_id:o.id,concept:form.concept,amount_total:Number(form.amount_total||0),due_date:form.due_date||null});if(error)setMessage(error.message);else{setMessage('Cuenta por cobrar creada.');setForm({work_order_id:'',concept:'',amount_total:'',due_date:''});await load()}}
  const registerPayment=async(e)=>{e.preventDefault();const r=rows.find(x=>x.id===pay.receivable_id);if(!r)return setMessage('Seleccioná una cuenta.');const balance=Number(r.amount_total)-Number(r.amount_paid);const amount=Number(pay.amount||0);if(amount<=0||amount>balance+0.001)return setMessage(`El pago debe ser mayor a $0 y no superar ${money(balance)}.`);const {error}=await supabase.from('customer_payments').insert({company_id:company.id,receivable_id:r.id,client_id:r.client_id,amount,payment_method:pay.payment_method,reference:pay.reference||null});if(error)setMessage(error.message);else{setMessage('Pago registrado.');setPay({receivable_id:'',amount:'',payment_method:'CASH',reference:''});await load()}}
  const pending=useMemo(()=>rows.filter(r=>!['PAID','CANCELLED'].includes(r.status)).reduce((s,r)=>s+Number(r.amount_total)-Number(r.amount_paid),0),[rows])
  const collected=useMemo(()=>payments.reduce((s,p)=>s+Number(p.amount||0),0),[payments])
  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">FINANZAS</p><h2>Cuentas por cobrar</h2><p>Controla saldos de clientes y registra abonos sin perder el vínculo con la orden de trabajo.</p></div></div>
    <div className="metrics-grid"><article className="metric-card"><span>Saldo pendiente</span><strong>{money(pending)}</strong></article><article className="metric-card"><span>Cobrado registrado</span><strong>{money(collected)}</strong></article><article className="metric-card"><span>Cuentas abiertas</span><strong>{rows.filter(r=>!['PAID','CANCELLED'].includes(r.status)).length}</strong></article></div>
    {message&&<p className="feedback success">{message}</p>}
    <div className="module-grid two-column">
      <form className="panel" onSubmit={create}><div className="panel-heading"><div><p className="form-kicker">NUEVA CUENTA</p><h3>Generar saldo</h3></div></div><div className="form-grid">
        <label className="field"><span>Orden de trabajo *</span><select required value={form.work_order_id} onChange={e=>selectOrder(e.target.value)}><option value="">Seleccionar orden</option>{orders.filter(o=>!rows.some(r=>r.work_order_id===o.id)).map(o=><option key={o.id} value={o.id}>OT-{String(o.number).padStart(5,'0')} · {o.clients?.name||'Cliente'} · {money(o.total)}</option>)}</select></label>
        <label className="field"><span>Concepto *</span><input required value={form.concept} onChange={e=>setForm({...form,concept:e.target.value})}/></label>
        <label className="field"><span>Total *</span><input type="number" min="0" step="0.01" required value={form.amount_total} onChange={e=>setForm({...form,amount_total:e.target.value})}/></label>
        <label className="field"><span>Vencimiento</span><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
      </div><div className="form-actions end"><button>Crear cuenta</button></div></form>
      <form className="panel" onSubmit={registerPayment}><div className="panel-heading"><div><p className="form-kicker">COBRO</p><h3>Registrar pago</h3></div></div><div className="form-grid">
        <label className="field"><span>Cuenta *</span><select required value={pay.receivable_id} onChange={e=>setPay({...pay,receivable_id:e.target.value})}><option value="">Seleccionar cuenta</option>{rows.filter(r=>!['PAID','CANCELLED'].includes(r.status)).map(r=><option key={r.id} value={r.id}>CXC-{String(r.number).padStart(5,'0')} · {r.clients?.name||'Cliente'} · saldo {money(Number(r.amount_total)-Number(r.amount_paid))}</option>)}</select></label>
        <label className="field"><span>Monto *</span><input type="number" min="0.01" step="0.01" required value={pay.amount} onChange={e=>setPay({...pay,amount:e.target.value})}/></label>
        <label className="field"><span>Forma</span><select value={pay.payment_method} onChange={e=>setPay({...pay,payment_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
        <label className="field"><span>Referencia</span><input value={pay.reference} onChange={e=>setPay({...pay,reference:e.target.value})}/></label>
      </div><div className="form-actions end"><button>Registrar pago</button></div></form>
    </div>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">CARTERA</p><h3>Saldos de clientes</h3></div></div>{rows.length?<div className="client-list">{rows.map(r=>{const bal=Number(r.amount_total)-Number(r.amount_paid);return <div className="client-row" key={r.id}><div><strong>CXC-{String(r.number).padStart(5,'0')} · {r.clients?.name||'Cliente'}</strong><small>{r.concept} · vence {r.due_date||'sin fecha'}</small></div><div><strong>{money(bal)} pendiente</strong><small>{money(r.amount_paid)} pagado de {money(r.amount_total)} · {r.status}</small></div></div>})}</div>:<div className="empty-state"><strong>Sin cuentas por cobrar</strong></div>}</section>
  </section>
}
