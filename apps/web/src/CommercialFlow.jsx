import { useEffect, useMemo, useState } from 'react'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))

export function ProductsModule({ company, supabase }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ name: '', category: '', description: '', unit: 'unidad', sale_price: '', estimated_minutes: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    const { data, error } = await supabase.from('finished_products').select('*').eq('company_id', company.id).order('name')
    if (error) setMessage(error.message); else setRows(data || [])
  }
  useEffect(() => { load() }, [company.id])
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMessage('')
    const payload = { ...form, company_id: company.id, sale_price: Number(form.sale_price || 0), estimated_minutes: form.estimated_minutes ? Number(form.estimated_minutes) : null }
    const { error } = await supabase.from('finished_products').insert(payload)
    if (error) setMessage(error.message); else { setMessage('Producto/trabajo agregado.'); setForm({ name: '', category: '', description: '', unit: 'unidad', sale_price: '', estimated_minutes: '' }); await load() }
    setBusy(false)
  }
  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">CATÁLOGO COMERCIAL</p><h2>Productos y trabajos terminados</h2><p>Lo que el cliente compra: camisas personalizadas, tazas, rótulos, impresiones, instalaciones y trabajos finalizados.</p></div><span className="status dte-ready">{rows.length} activos</span></div>
    {message && <p className="feedback success">{message}</p>}
    <form className="panel client-form-full" onSubmit={save}><div className="form-grid three">
      <label className="field form-span-2"><span>Nombre del producto/trabajo *</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej. Camisa personalizada full color"/></label>
      <label className="field"><span>Categoría</span><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="Sublimación, rótulos..."/></label>
      <label className="field"><span>Unidad</span><select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option>unidad</option><option>m²</option><option>metro</option><option>paquete</option><option>trabajo</option></select></label>
      <label className="field"><span>Precio de venta *</span><input type="number" step="0.01" min="0" required value={form.sale_price} onChange={e=>setForm({...form,sale_price:e.target.value})}/></label>
      <label className="field"><span>Tiempo estimado (min)</span><input type="number" min="0" value={form.estimated_minutes} onChange={e=>setForm({...form,estimated_minutes:e.target.value})}/></label>
      <label className="field form-span-3"><span>Descripción / alcance</span><textarea rows="2" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    </div><div className="form-actions end"><button disabled={busy}>{busy?'Guardando…':'Agregar producto/trabajo'}</button></div></form>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">LISTADO</p><h3>Catálogo de venta</h3></div></div>
      {rows.length ? <div className="client-list">{rows.map(r=><div className="client-row" key={r.id}><div><strong>{r.name}</strong><small>{r.category||'Sin categoría'} · {r.unit} · {r.description||'Sin descripción'}</small></div><div><strong>{money(r.sale_price)}</strong></div></div>)}</div> : <div className="empty-state"><strong>Aún no hay productos terminados</strong><p>Agregá el primer trabajo que ofrecés al cliente.</p></div>}
    </section>
  </section>
}

export function QuotesModule({ company, supabase }) {
  const [clients,setClients]=useState([]), [products,setProducts]=useState([]), [quotes,setQuotes]=useState([])
  const [clientId,setClientId]=useState(''), [notes,setNotes]=useState(''), [items,setItems]=useState([{product_id:'',description:'',quantity:1,unit:'unidad',unit_price:0,discount:0}]), [message,setMessage]=useState('')
  const load = async()=>{ const [c,p,q]=await Promise.all([supabase.from('clients').select('id,name').eq('company_id',company.id).order('name'),supabase.from('finished_products').select('*').eq('company_id',company.id).eq('active',true).order('name'),supabase.from('quotes').select('*, clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(30)]); setClients(c.data||[]);setProducts(p.data||[]);setQuotes(q.data||[]) }
  useEffect(()=>{load()},[company.id])
  const total=useMemo(()=>items.reduce((s,i)=>s+Math.max(0,Number(i.quantity||0)*Number(i.unit_price||0)-Number(i.discount||0)),0),[items])
  const choose=(idx,id)=>{const p=products.find(x=>x.id===id);setItems(x=>x.map((i,n)=>n===idx?{...i,product_id:id,description:p?.name||'',unit:p?.unit||'unidad',unit_price:Number(p?.sale_price||0)}:i))}
  const save=async()=>{ if(!clientId||items.some(i=>!i.description||Number(i.quantity)<=0)){setMessage('Seleccioná cliente y completá las partidas.');return} const {data:q,error}=await supabase.from('quotes').insert({company_id:company.id,client_id:clientId,notes,total,subtotal:total,status:'DRAFT'}).select().single(); if(error)return setMessage(error.message); const rows=items.map((i,n)=>({...i,quote_id:q.id,line_total:Math.max(0,Number(i.quantity)*Number(i.unit_price)-Number(i.discount||0)),sort_order:n})); const {error:e2}=await supabase.from('quote_items').insert(rows); if(e2)return setMessage(e2.message); setMessage('Cotización creada.');setItems([{product_id:'',description:'',quantity:1,unit:'unidad',unit_price:0,discount:0}]);setNotes('');await load() }
  const approve=async(q)=>{await supabase.from('quotes').update({status:'APPROVED',updated_at:new Date().toISOString()}).eq('id',q.id);await load()}
  const toWorkOrder=async(q)=>{ const {data:its}=await supabase.from('quote_items').select('*').eq('quote_id',q.id).order('sort_order'); const {data:w,error}=await supabase.from('work_orders').insert({company_id:company.id,quote_id:q.id,client_id:q.client_id,title:`Trabajo de cotización #${q.number}`,total:q.total,status:'PENDING'}).select().single(); if(error)return setMessage(error.message); if(its?.length) await supabase.from('work_order_items').insert(its.map(i=>({work_order_id:w.id,product_id:i.product_id,description:i.description,quantity:i.quantity,unit:i.unit,unit_price:i.unit_price,line_total:i.line_total,sort_order:i.sort_order}))); await supabase.from('quotes').update({status:'CONVERTED'}).eq('id',q.id);setMessage('Cotización convertida en orden de trabajo.');await load();window.dispatchEvent(new CustomEvent('idealo-commercial-flow-next',{detail:{step:'work-order',workOrderId:w.id}})) }
  return <section className="clients-module"><div className="clients-titlebar"><div><p className="form-kicker">VENTAS</p><h2>Cotizaciones</h2><p>Cotizá únicamente el producto o trabajo terminado que recibe el cliente.</p></div></div>{message&&<p className="feedback success">{message}</p>}
    <section className="panel client-form-full"><div className="form-grid three"><label className="field form-span-2"><span>Cliente *</span><select value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">Seleccionar cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Total</span><input readOnly value={money(total)}/></label></div>
    {items.map((i,idx)=><div className="invoice-item" key={idx}><div className="form-grid four"><label className="field"><span>Producto/trabajo</span><select value={i.product_id} onChange={e=>choose(idx,e.target.value)}><option value="">Personalizado/manual</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field form-span-2"><span>Descripción *</span><input value={i.description} onChange={e=>setItems(x=>x.map((z,n)=>n===idx?{...z,description:e.target.value}:z))}/></label><label className="field"><span>Cantidad *</span><input type="number" min="0.01" step="0.01" value={i.quantity} onChange={e=>setItems(x=>x.map((z,n)=>n===idx?{...z,quantity:e.target.value}:z))}/></label><label className="field"><span>Unidad</span><input value={i.unit} onChange={e=>setItems(x=>x.map((z,n)=>n===idx?{...z,unit:e.target.value}:z))}/></label><label className="field"><span>Precio unitario</span><input type="number" step="0.01" value={i.unit_price} onChange={e=>setItems(x=>x.map((z,n)=>n===idx?{...z,unit_price:e.target.value}:z))}/></label><label className="field"><span>Descuento</span><input type="number" step="0.01" value={i.discount} onChange={e=>setItems(x=>x.map((z,n)=>n===idx?{...z,discount:e.target.value}:z))}/></label></div></div>)}
    <button type="button" className="wide-action" onClick={()=>setItems(x=>[...x,{product_id:'',description:'',quantity:1,unit:'unidad',unit_price:0,discount:0}])}>+ Agregar partida</button><label className="field"><span>Notas</span><textarea rows="2" value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="form-actions end"><button type="button" onClick={save}>Guardar cotización</button></div></section>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">HISTORIAL</p><h3>Cotizaciones recientes</h3></div></div>{quotes.length?<div className="client-list">{quotes.map(q=><div className="client-row" key={q.id}><div><strong>COT-{String(q.number).padStart(5,'0')} · {q.clients?.name||'Cliente'}</strong><small>{q.status} · {new Date(q.created_at).toLocaleDateString('es-SV')}</small></div><div><strong>{money(q.total)}</strong><div className="form-actions end">{q.status==='DRAFT'&&<button onClick={()=>approve(q)}>Aprobar</button>}{q.status==='APPROVED'&&<button onClick={()=>toWorkOrder(q)}>Crear orden de trabajo</button>}</div></div></div>)}</div>:<div className="empty-state"><strong>Sin cotizaciones</strong></div>}</section>
  </section>
}

export function WorkOrdersModule({ company, supabase }) {
  const [rows,setRows]=useState([]),[message,setMessage]=useState('')
  const load=async()=>{const {data,error}=await supabase.from('work_orders').select('*, clients(name), work_order_items(*)').eq('company_id',company.id).order('created_at',{ascending:false});if(error)setMessage(error.message);else setRows(data||[])}
  useEffect(()=>{load()},[company.id])
  const nextStatus={PENDING:'DESIGN',DESIGN:'APPROVAL',APPROVAL:'PRODUCTION',PRODUCTION:'READY',READY:'DELIVERED'}
  const advance=async(r)=>{const next=nextStatus[r.status];if(!next)return;const {error}=await supabase.from('work_orders').update({status:next,updated_at:new Date().toISOString()}).eq('id',r.id).eq('company_id',company.id);if(error){setMessage(error.message);return}await load();if(next==='PRODUCTION')window.setTimeout(()=>window.dispatchEvent(new CustomEvent('idealo-commercial-flow-next',{detail:{step:'production',workOrderId:r.id}})),350);if(next==='READY')window.setTimeout(()=>window.dispatchEvent(new CustomEvent('idealo-commercial-flow-next',{detail:{step:'delivery',workOrderId:r.id}})),350)}
  return <section className="clients-module"><div className="clients-titlebar"><div><p className="form-kicker">PRODUCCIÓN</p><h2>Órdenes de trabajo</h2><p>Del trabajo aprobado a diseño, producción, listo y entrega.</p></div><span className="status dte-ready">{rows.filter(r=>r.status!=='DELIVERED').length} abiertas</span></div>{message&&<p className="feedback error">{message}</p>}
    <section className="panel">{rows.length?<div className="client-list">{rows.map(r=><div className="client-row" key={r.id}><div><strong>OT-{String(r.number).padStart(5,'0')} · {r.title}</strong><small>{r.clients?.name||'Cliente'} · {r.work_order_items?.map(i=>`${i.quantity} ${i.description}`).join(' · ')||'Sin partidas'}</small></div><div><strong>{r.status}</strong><small>{money(r.total)}</small>{nextStatus[r.status]&&<button onClick={()=>advance(r)}>Avanzar a {nextStatus[r.status]}</button>}</div></div>)}</div>:<div className="empty-state"><strong>No hay órdenes todavía</strong><p>Una cotización aprobada puede convertirse directamente en orden de trabajo.</p></div>}</section>
  </section>
}
