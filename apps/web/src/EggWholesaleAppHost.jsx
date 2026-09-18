import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './idealo-eggs.css'
import EggRoutesPanel from './EggRoutesPanel.jsx'
import EggMachinePanel from './EggMachinePanel.jsx'
import EggDtePanel from './EggDtePanel.jsx'
import EggPricingPanel from './EggPricingPanel.jsx'
import EggReturnsPanel from './EggReturnsPanel.jsx'
import EggReportsPanel from './EggReportsPanel.jsx'
import EggUsersPanel from './EggUsersPanel.jsx'
import EggMobileDeliveryPanel from './EggMobileDeliveryPanel.jsx'
import EggDispatchPanel from './EggDispatchPanel.jsx'

const TABS=[
 ['Inicio','Resumen','EGG_OPERATIONS'],
 ['Proveedores','Granjas y proveedores','EGG_OPERATIONS'],
 ['Lotes','Recepción y clasificación','EGG_OPERATIONS'],
 ['Inventario','Existencias','EGG_OPERATIONS'],
 ['Clientes','Clientes mayoristas','EGG_OPERATIONS'],
 ['Ventas','Pedidos y ventas','EGG_OPERATIONS'],
 ['Caja','Cobros y crédito','EGG_OPERATIONS'],
 ['Precios','Mayorista y rentabilidad','EGG_PRICING'],
 ['Devoluciones','Pérdidas y retornos','EGG_RETURNS'],
 ['Reportes','Indicadores gerenciales','EGG_REPORTS'],
 ['Rutas','Planificación de reparto','EGG_LOGISTICS'],
 ['Despacho','Carga y retorno','EGG_LOGISTICS'],
 ['Máquina','Pesaje y clasificación','EGG_MACHINE'],
 ['Móvil','Reparto desde teléfono','EGG_MOBILE'],
 ['DTE','Facturación electrónica','DTE'],
 ['Usuarios','Roles y permisos','EGG_USERS'],
]

const today=()=>new Date().toISOString().slice(0,10)
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0))
const number=value=>new Intl.NumberFormat('es-SV').format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const textError=error=>String(error?.message||error||'Ocurrió un error inesperado.')

function Field({label,children,hint}){return <label className="eggs-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({children}){return <div className="eggs-empty">{children}</div>}
function Pill({children,tone='neutral'}){return <span className={`eggs-pill ${tone}`}>{children}</span>}
function Metric({label,value,hint}){return <article className="eggs-metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}

export default function EggWholesaleAppHost(){
 const enabled=window.location.pathname==='/eggs'||window.location.pathname.startsWith('/eggs/')
 const mobileOnly=window.location.pathname.startsWith('/eggs/mobile')
 const queryCompany=enabled?new URLSearchParams(window.location.search).get('company'):''
 const [companyId,setCompanyId]=useState(queryCompany||window.__IDEALO_ACTIVE_COMPANY__?.id||'')
 const [companyName,setCompanyName]=useState(window.__IDEALO_ACTIVE_COMPANY__?.name||'Venta de Huevos')
 const [tab,setTab]=useState('Inicio')
 const [loading,setLoading]=useState(enabled)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [suppliers,setSuppliers]=useState([])
 const [grades,setGrades]=useState([])
 const [batches,setBatches]=useState([])
 const [classifications,setClassifications]=useState([])
 const [inventory,setInventory]=useState([])
 const [customers,setCustomers]=useState([])
 const [orders,setOrders]=useState([])
 const [payments,setPayments]=useState([])
 const [supplierForm,setSupplierForm]=useState({name:'',contact_name:'',phone:'',email:'',notes:''})
 const [batchForm,setBatchForm]=useState({supplier_id:'',received_at:today(),total_eggs:'',total_cost:'',source_reference:'',notes:''})
 const [classifyForm,setClassifyForm]=useState({batch_id:'',grade_id:'',quantity_eggs:'',damaged_eggs:'0',avg_weight_g:''})
 const [customerForm,setCustomerForm]=useState({name:'',contact_name:'',phone:'',email:'',address:'',credit_limit:'0',credit_days:'0',notes:''})
 const [orderForm,setOrderForm]=useState({customer_id:'',grade_id:'',presentation:'Bandeja',quantity_units:'',eggs_per_unit:'30',unit_price:'',payment_type:'CREDIT',notes:''})
 const [paymentForm,setPaymentForm]=useState({order_id:'',amount:'',method:'CASH',reference:''})
 const [entitlements,setEntitlements]=useState(null)
 const [eggRole,setEggRole]=useState('')
 const [suggestedPrice,setSuggestedPrice]=useState(null)

 useEffect(()=>{
  if(!enabled)return
  const sync=()=>{
   const c=window.__IDEALO_ACTIVE_COMPANY__
   if(!companyId&&c?.id)setCompanyId(c.id)
   if(c?.name)setCompanyName(c.name)
  }
  window.addEventListener('idealo-company-resolved',sync)
  sync()
  return()=>window.removeEventListener('idealo-company-resolved',sync)
 },[enabled,companyId])

 const load=useCallback(async()=>{
  if(!enabled||!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const [supplierRes,gradeRes,batchRes,classRes,inventoryRes,customerRes,orderRes,paymentRes]=await Promise.all([
    supabase.from('egg_suppliers').select('*').eq('company_id',companyId).order('name'),
    supabase.from('egg_grades').select('*').eq('company_id',companyId).eq('active',true).order('sort_order'),
    supabase.from('egg_batches').select('*,egg_suppliers(name)').eq('company_id',companyId).order('received_at',{ascending:false}).limit(100),
    supabase.from('egg_batch_classifications').select('*,egg_grades(code,name)').eq('company_id',companyId).order('created_at',{ascending:false}).limit(300),
    supabase.from('egg_inventory_stock').select('*').eq('company_id',companyId).order('name'),
    supabase.from('egg_customers').select('*').eq('company_id',companyId).order('name'),
    supabase.from('egg_orders').select('*,egg_customers(name),egg_order_items(*,egg_grades(code,name))').eq('company_id',companyId).order('created_at',{ascending:false}).limit(150),
    supabase.from('egg_payments').select('*,egg_orders(order_number,egg_customers(name))').eq('company_id',companyId).order('paid_at',{ascending:false}).limit(150),
   ])
   for(const result of [supplierRes,gradeRes,batchRes,classRes,inventoryRes,customerRes,orderRes,paymentRes])if(result.error)throw result.error
   setSuppliers(supplierRes.data||[])
   setGrades(gradeRes.data||[])
   setBatches(batchRes.data||[])
   setClassifications(classRes.data||[])
   setInventory(inventoryRes.data||[])
   setCustomers(customerRes.data||[])
   setOrders(orderRes.data||[])
   setPayments(paymentRes.data||[])
  }catch(err){setError(textError(err))}
  finally{setLoading(false)}
 },[enabled,companyId])

 useEffect(()=>{load()},[load])

 useEffect(()=>{
  if(!enabled||!companyId||!supabase)return
  let cancelled=false
  const run=async()=>{
   try{
    const {data:{session}}=await supabase.auth.getSession()
    if(session?.access_token){
     const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
     const response=await fetch(apiUrl+'/api/saas/access?company_id='+encodeURIComponent(companyId),{headers:{Authorization:'Bearer '+session.access_token}})
     const body=await response.json().catch(()=>null)
     if(response.ok&&!cancelled)setEntitlements(body)
    }
    const {data:role}=await supabase.rpc('egg_effective_role',{p_company_id:companyId})
    if(!cancelled)setEggRole(role||'')
   }catch{}
  }
  run()
  return()=>{cancelled=true}
 },[enabled,companyId])

 const hasModule=code=>!entitlements||entitlements.legacy||entitlements.modules?.includes(code)
 const visibleTabs=TABS.filter(([, ,module])=>hasModule(module))

 useEffect(()=>{
  if(!companyId||!orderForm.customer_id||!orderForm.grade_id||!orderForm.quantity_units||!orderForm.eggs_per_unit)return
  let cancelled=false
  supabase.rpc('egg_resolve_price',{
   p_company_id:companyId,p_customer_id:orderForm.customer_id,p_grade_id:orderForm.grade_id,
   p_presentation:orderForm.presentation,p_quantity_units:Number(orderForm.quantity_units),p_eggs_per_unit:Number(orderForm.eggs_per_unit)
  }).then(({data,error})=>{
   if(cancelled||error)return
   const value=Number(data||0)
   setSuggestedPrice(value>0?value:null)
   if(value>0)setOrderForm(current=>({...current,unit_price:String(value)}))
  })
  return()=>{cancelled=true}
 },[companyId,orderForm.customer_id,orderForm.grade_id,orderForm.presentation,orderForm.quantity_units,orderForm.eggs_per_unit])

 useEffect(()=>{
  if(!batchForm.supplier_id&&suppliers[0])setBatchForm(current=>({...current,supplier_id:suppliers[0].id}))
  if(!classifyForm.batch_id&&batches[0])setClassifyForm(current=>({...current,batch_id:batches[0].id}))
  if(!classifyForm.grade_id&&grades[0])setClassifyForm(current=>({...current,grade_id:grades[0].id}))
  if(!orderForm.customer_id&&customers[0])setOrderForm(current=>({...current,customer_id:customers[0].id}))
  if(!orderForm.grade_id&&grades[0])setOrderForm(current=>({...current,grade_id:grades[0].id}))
 },[suppliers,batches,grades,customers,batchForm.supplier_id,classifyForm.batch_id,classifyForm.grade_id,orderForm.customer_id,orderForm.grade_id])

 const act=async(fn,success)=>{
  setSaving(true);setError('');setNotice('')
  try{await fn();setNotice(success);await load()}
  catch(err){setError(textError(err))}
  finally{setSaving(false)}
 }

 const createSupplier=event=>{event.preventDefault();return act(async()=>{
  const payload={company_id:companyId,...supplierForm}
  const {error:e}=await supabase.from('egg_suppliers').insert(payload);if(e)throw e
  setSupplierForm({name:'',contact_name:'',phone:'',email:'',notes:''})
 },'Proveedor agregado correctamente.')}

 const receiveBatch=event=>{event.preventDefault();return act(async()=>{
  const {data,error:errorRpc}=await supabase.rpc('egg_receive_batch',{
   p_company_id:companyId,p_supplier_id:batchForm.supplier_id||null,p_total_eggs:Number(batchForm.total_eggs),
   p_total_cost:Number(batchForm.total_cost||0),p_received_at:batchForm.received_at,p_source_reference:batchForm.source_reference,p_notes:batchForm.notes
  })
  if(errorRpc)throw errorRpc
  setClassifyForm(current=>({...current,batch_id:data||current.batch_id}))
  setBatchForm(current=>({...current,total_eggs:'',total_cost:'',source_reference:'',notes:''}))
 },'Lote recibido. Ya podés registrar su clasificación.')}

 const classifyBatch=event=>{event.preventDefault();return act(async()=>{
  const {error:e}=await supabase.rpc('egg_classify_batch',{
   p_batch_id:classifyForm.batch_id,p_grade_id:classifyForm.grade_id,p_quantity_eggs:Number(classifyForm.quantity_eggs),
   p_damaged_eggs:Number(classifyForm.damaged_eggs||0),p_avg_weight_g:classifyForm.avg_weight_g?Number(classifyForm.avg_weight_g):null
  })
  if(e)throw e
  setClassifyForm(current=>({...current,quantity_eggs:'',damaged_eggs:'0',avg_weight_g:''}))
 },'Clasificación registrada e inventario actualizado.')}

 const createCustomer=event=>{event.preventDefault();return act(async()=>{
  const payload={company_id:companyId,...customerForm,credit_limit:Number(customerForm.credit_limit||0),credit_days:Number(customerForm.credit_days||0)}
  const {error:e}=await supabase.from('egg_customers').insert(payload);if(e)throw e
  setCustomerForm({name:'',contact_name:'',phone:'',email:'',address:'',credit_limit:'0',credit_days:'0',notes:''})
 },'Cliente mayorista agregado.')}

 const createOrder=event=>{event.preventDefault();return act(async()=>{
  const {error:e}=await supabase.rpc('egg_create_order',{
   p_company_id:companyId,p_customer_id:orderForm.customer_id,p_grade_id:orderForm.grade_id,
   p_presentation:orderForm.presentation,p_quantity_units:Number(orderForm.quantity_units),p_eggs_per_unit:Number(orderForm.eggs_per_unit),
   p_unit_price:Number(orderForm.unit_price),p_payment_type:orderForm.payment_type,p_notes:orderForm.notes
  })
  if(e)throw e
  setOrderForm(current=>({...current,quantity_units:'',unit_price:'',notes:''}))
 },orderForm.payment_type==='CASH'?'Venta al contado registrada e inventario descontado.':'Pedido a crédito registrado e inventario descontado.')}

 const recordPayment=event=>{event.preventDefault();return act(async()=>{
  const {error:e}=await supabase.rpc('egg_record_payment',{
   p_order_id:paymentForm.order_id,p_amount:Number(paymentForm.amount),p_method:paymentForm.method,p_reference:paymentForm.reference
  })
  if(e)throw e
  setPaymentForm({order_id:'',amount:'',method:'CASH',reference:''})
 },'Abono registrado correctamente.')}

 const stockTotal=useMemo(()=>inventory.reduce((sum,row)=>sum+Number(row.stock_eggs||0),0),[inventory])
 const salesTotal=useMemo(()=>orders.filter(o=>o.status!=='CANCELLED').reduce((sum,o)=>sum+Number(o.total||0),0),[orders])
 const receivable=useMemo(()=>orders.filter(o=>o.status!=='CANCELLED').reduce((sum,o)=>sum+Math.max(0,Number(o.total||0)-Number(o.paid_amount||0)),0),[orders])
 const damagedTotal=useMemo(()=>classifications.reduce((sum,row)=>sum+Number(row.damaged_eggs||0),0),[classifications])
 const openOrders=useMemo(()=>orders.filter(o=>o.status==='CONFIRMED'),[orders])
 const lowStock=useMemo(()=>inventory.filter(row=>Number(row.stock_eggs||0)<=0),[inventory])

 if(!enabled)return null
 if(mobileOnly)return <EggMobileDeliveryPanel companyId={companyId} onExit={()=>{window.location.href='/eggs?company='+encodeURIComponent(companyId)}}/>

 const batchProgress=batch=>{
  const rows=classifications.filter(c=>c.batch_id===batch.id)
  const used=rows.reduce((sum,c)=>sum+Number(c.quantity_eggs||0)+Number(c.damaged_eggs||0),0)
  return {used,pct:batch.total_eggs?Math.min(100,Math.round(used/Number(batch.total_eggs)*100)):0}
 }

 return <div className="eggs-app">
  <header className="eggs-header">
   <div>
    <span className="eggs-brand">IDEALO SV · IDEALO EGGS{entitlements?.plan?.name?' · '+entitlements.plan.name:''}{eggRole?' · '+eggRole:''}</span>
    <h1>{companyName}</h1>
    <p>Control mayorista de lotes, clasificación, inventario, pedidos, crédito y cobros.</p>
   </div>
   <div className="eggs-header-actions">
    <button onClick={load} disabled={loading}>Actualizar</button>
    {new URLSearchParams(window.location.search).get('master')==='1'
      ?<a href="/master">Membresías</a>
      :<a href="/">IDEALO SV</a>}
   </div>
  </header>

  <nav className="eggs-tabs">
   {visibleTabs.map(([name,description])=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}><strong>{name}</strong><small>{description}</small></button>)}
  </nav>

  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  {loading&&<div className="eggs-loading">Actualizando información…</div>}

  <main className="eggs-main">
   {tab==='Inicio'&&<>
    <section className="eggs-metrics">
     <Metric label="Huevos disponibles" value={number(stockTotal)} hint={`${number(Math.floor(stockTotal/30))} bandejas completas de 30`}/>
     <Metric label="Ventas registradas" value={money(salesTotal)} hint={`${orders.length} pedidos`}/>
     <Metric label="Por cobrar" value={money(receivable)} hint={`${openOrders.length} pedidos abiertos`}/>
     <Metric label="Lotes recibidos" value={number(batches.length)} hint="Trazabilidad de recepción"/>
     <Metric label="Huevos dañados" value={number(damagedTotal)} hint="Registrados en clasificación"/>
     <Metric label="Clientes" value={number(customers.length)} hint="Mayoristas registrados"/>
    </section>

    <section className="eggs-dashboard-grid">
     <article className="eggs-card">
      <div className="eggs-section-head"><div><small>INVENTARIO</small><h2>Existencia por tamaño</h2></div><button onClick={()=>setTab('Inventario')}>Ver inventario</button></div>
      <div className="eggs-stock-list">
       {inventory.length?inventory.map(row=><div key={row.grade_id}><span><b>{row.name}</b><small>{row.min_weight_g||'—'}–{row.max_weight_g||'+'} g</small></span><strong>{number(row.stock_eggs)} <small>huevos</small></strong></div>):<Empty>Aún no hay inventario. Recibí un lote y clasificalo.</Empty>}
      </div>
     </article>
     <article className="eggs-card">
      <div className="eggs-section-head"><div><small>OPERACIÓN</small><h2>Últimos lotes</h2></div><button onClick={()=>setTab('Lotes')}>Recibir lote</button></div>
      <div className="eggs-compact-list">
       {batches.slice(0,5).map(batch=>{const progress=batchProgress(batch);return <div key={batch.id}><span><b>{batch.batch_code}</b><small>{batch.egg_suppliers?.name||'Sin proveedor'} · {date(batch.received_at)}</small></span><span><b>{number(batch.total_eggs)}</b><small>{progress.pct}% clasificado</small></span></div>})}
       {!batches.length&&<Empty>No hay lotes recibidos.</Empty>}
      </div>
     </article>
     <article className="eggs-card eggs-wide">
      <div className="eggs-section-head"><div><small>VENTAS</small><h2>Pedidos recientes</h2></div><button onClick={()=>setTab('Ventas')}>Nueva venta</button></div>
      <div className="eggs-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Condición</th><th>Total</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>
       {orders.slice(0,6).map(order=><tr key={order.id}><td><b>{order.order_number}</b><small>{date(order.order_date)}</small></td><td>{order.egg_customers?.name}</td><td>{order.payment_type==='CASH'?'Contado':'Crédito'}</td><td>{money(order.total)}</td><td>{money(Math.max(0,Number(order.total)-Number(order.paid_amount)))}</td><td><Pill tone={order.status==='PAID'?'good':'warn'}>{order.status==='PAID'?'Pagado':'Pendiente'}</Pill></td></tr>)}
       {!orders.length&&<tr><td colSpan="6"><Empty>No hay ventas todavía.</Empty></td></tr>}
      </tbody></table></div>
     </article>
    </section>
   </>}

   {tab==='Proveedores'&&<section className="eggs-two-column">
    <form className="eggs-card eggs-form" onSubmit={createSupplier}>
     <div className="eggs-section-head"><div><small>NUEVO PROVEEDOR</small><h2>Granja o distribuidor</h2></div></div>
     <Field label="Nombre"><input required value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})} placeholder="Granja San José"/></Field>
     <Field label="Contacto"><input value={supplierForm.contact_name} onChange={e=>setSupplierForm({...supplierForm,contact_name:e.target.value})} placeholder="Persona de contacto"/></Field>
     <div className="eggs-form-grid"><Field label="Teléfono"><input value={supplierForm.phone} onChange={e=>setSupplierForm({...supplierForm,phone:e.target.value})}/></Field><Field label="Correo"><input type="email" value={supplierForm.email} onChange={e=>setSupplierForm({...supplierForm,email:e.target.value})}/></Field></div>
     <Field label="Notas"><textarea value={supplierForm.notes} onChange={e=>setSupplierForm({...supplierForm,notes:e.target.value})}/></Field>
     <button className="eggs-primary" disabled={saving}>Guardar proveedor</button>
    </form>
    <section className="eggs-card">
     <div className="eggs-section-head"><div><small>ABASTECIMIENTO</small><h2>Proveedores registrados</h2></div><Pill>{suppliers.length}</Pill></div>
     <div className="eggs-list">
      {suppliers.map(row=><article key={row.id}><div><b>{row.name}</b><small>{row.contact_name||'Sin contacto'}{row.phone?` · ${row.phone}`:''}</small></div><Pill tone={row.active?'good':'neutral'}>{row.active?'Activo':'Inactivo'}</Pill></article>)}
      {!suppliers.length&&<Empty>Agregá la primera granja o proveedor.</Empty>}
     </div>
    </section>
   </section>}

   {tab==='Lotes'&&<>
    <section className="eggs-two-column">
     <form className="eggs-card eggs-form" onSubmit={receiveBatch}>
      <div className="eggs-section-head"><div><small>RECEPCIÓN</small><h2>Nuevo lote</h2></div></div>
      <Field label="Proveedor"><select value={batchForm.supplier_id} onChange={e=>setBatchForm({...batchForm,supplier_id:e.target.value})}><option value="">Sin proveedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <div className="eggs-form-grid"><Field label="Fecha"><input type="date" required value={batchForm.received_at} onChange={e=>setBatchForm({...batchForm,received_at:e.target.value})}/></Field><Field label="Huevos recibidos"><input type="number" min="1" required value={batchForm.total_eggs} onChange={e=>setBatchForm({...batchForm,total_eggs:e.target.value})} placeholder="12000"/></Field></div>
      <div className="eggs-form-grid"><Field label="Costo total"><input type="number" min="0" step="0.01" required value={batchForm.total_cost} onChange={e=>setBatchForm({...batchForm,total_cost:e.target.value})} placeholder="1200.00"/></Field><Field label="Referencia"><input value={batchForm.source_reference} onChange={e=>setBatchForm({...batchForm,source_reference:e.target.value})} placeholder="Factura / entrega"/></Field></div>
      <Field label="Notas"><textarea value={batchForm.notes} onChange={e=>setBatchForm({...batchForm,notes:e.target.value})}/></Field>
      <button className="eggs-primary" disabled={saving}>Recibir lote</button>
     </form>

     <form className="eggs-card eggs-form" onSubmit={classifyBatch}>
      <div className="eggs-section-head"><div><small>CLASIFICACIÓN</small><h2>Registrar tamaño y peso</h2></div></div>
      <Field label="Lote"><select required value={classifyForm.batch_id} onChange={e=>setClassifyForm({...classifyForm,batch_id:e.target.value})}><option value="">Seleccionar</option>{batches.filter(b=>b.status==='OPEN').map(b=><option key={b.id} value={b.id}>{b.batch_code} · {number(b.total_eggs)} huevos</option>)}</select></Field>
      <Field label="Clasificación"><select required value={classifyForm.grade_id} onChange={e=>setClassifyForm({...classifyForm,grade_id:e.target.value})}><option value="">Seleccionar</option>{grades.map(g=><option key={g.id} value={g.id}>{g.name} · {g.min_weight_g||'0'}–{g.max_weight_g||'+'} g</option>)}</select></Field>
      <div className="eggs-form-grid"><Field label="Huevos buenos"><input type="number" min="0" required value={classifyForm.quantity_eggs} onChange={e=>setClassifyForm({...classifyForm,quantity_eggs:e.target.value})}/></Field><Field label="Dañados / rechazo"><input type="number" min="0" required value={classifyForm.damaged_eggs} onChange={e=>setClassifyForm({...classifyForm,damaged_eggs:e.target.value})}/></Field></div>
      <Field label="Peso promedio (g)" hint="Opcional; útil para captura manual o integración futura con clasificadora."><input type="number" min="0" step="0.01" value={classifyForm.avg_weight_g} onChange={e=>setClassifyForm({...classifyForm,avg_weight_g:e.target.value})}/></Field>
      <button className="eggs-primary" disabled={saving}>Guardar clasificación</button>
     </form>
    </section>

    <section className="eggs-card">
     <div className="eggs-section-head"><div><small>TRAZABILIDAD</small><h2>Lotes recibidos</h2></div><Pill>{batches.length}</Pill></div>
     <div className="eggs-table-wrap"><table><thead><tr><th>Lote</th><th>Proveedor</th><th>Fecha</th><th>Recibidos</th><th>Clasificados</th><th>Costo</th><th>Estado</th></tr></thead><tbody>
      {batches.map(batch=>{const p=batchProgress(batch);return <tr key={batch.id}><td><b>{batch.batch_code}</b><small>{batch.source_reference||'Sin referencia'}</small></td><td>{batch.egg_suppliers?.name||'—'}</td><td>{date(batch.received_at)}</td><td>{number(batch.total_eggs)}</td><td>{number(p.used)} <small>{p.pct}%</small></td><td>{money(batch.total_cost)}<small>{money(Number(batch.total_cost)/Number(batch.total_eggs))}/huevo</small></td><td><Pill tone={batch.status==='CLASSIFIED'?'good':'warn'}>{batch.status==='CLASSIFIED'?'Clasificado':'Abierto'}</Pill></td></tr>})}
      {!batches.length&&<tr><td colSpan="7"><Empty>Aún no hay lotes.</Empty></td></tr>}
     </tbody></table></div>
    </section>
   </>}

   {tab==='Inventario'&&<section className="eggs-card">
    <div className="eggs-section-head"><div><small>INVENTARIO EN TIEMPO REAL</small><h2>Existencia por clasificación</h2><p>Las entradas se generan al clasificar lotes y las salidas al confirmar ventas.</p></div></div>
    <div className="eggs-inventory-grid">
     {grades.map(grade=>{const row=inventory.find(i=>i.grade_id===grade.id);const eggs=Number(row?.stock_eggs||0);return <article key={grade.id}><header><div><small>{grade.code}</small><h3>{grade.name}</h3></div><Pill tone={eggs>0?'good':'danger'}>{eggs>0?'Disponible':'Sin stock'}</Pill></header><strong>{number(eggs)}</strong><span>huevos</span><div><b>{number(Math.floor(eggs/30))}</b><small>bandejas de 30</small></div><footer><span>Peso</span><b>{grade.min_weight_g||'—'}–{grade.max_weight_g||'+'} g</b></footer></article>})}
    </div>
    {lowStock.length>0&&<div className="eggs-note">Hay {lowStock.length} clasificación{lowStock.length===1?'':'es'} sin existencia disponible.</div>}
   </section>}

   {tab==='Clientes'&&<section className="eggs-two-column">
    <form className="eggs-card eggs-form" onSubmit={createCustomer}>
     <div className="eggs-section-head"><div><small>NUEVO CLIENTE</small><h2>Cliente mayorista</h2></div></div>
     <Field label="Nombre comercial"><input required value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})} placeholder="Supermercado / tienda / restaurante"/></Field>
     <Field label="Contacto"><input value={customerForm.contact_name} onChange={e=>setCustomerForm({...customerForm,contact_name:e.target.value})}/></Field>
     <div className="eggs-form-grid"><Field label="Teléfono"><input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></Field><Field label="Correo"><input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})}/></Field></div>
     <Field label="Dirección"><input value={customerForm.address} onChange={e=>setCustomerForm({...customerForm,address:e.target.value})}/></Field>
     <div className="eggs-form-grid"><Field label="Límite de crédito"><input type="number" min="0" step="0.01" value={customerForm.credit_limit} onChange={e=>setCustomerForm({...customerForm,credit_limit:e.target.value})}/></Field><Field label="Días de crédito"><input type="number" min="0" value={customerForm.credit_days} onChange={e=>setCustomerForm({...customerForm,credit_days:e.target.value})}/></Field></div>
     <Field label="Notas"><textarea value={customerForm.notes} onChange={e=>setCustomerForm({...customerForm,notes:e.target.value})}/></Field>
     <button className="eggs-primary" disabled={saving}>Guardar cliente</button>
    </form>
    <section className="eggs-card">
     <div className="eggs-section-head"><div><small>CARTERA</small><h2>Clientes mayoristas</h2></div><Pill>{customers.length}</Pill></div>
     <div className="eggs-list">
      {customers.map(c=><article key={c.id}><div><b>{c.name}</b><small>{c.contact_name||'Sin contacto'}{c.phone?` · ${c.phone}`:''}</small><small>Crédito: {money(c.credit_limit)} · {c.credit_days} días</small></div><Pill tone={c.credit_days>0?'warn':'good'}>{c.credit_days>0?'Crédito':'Contado'}</Pill></article>)}
      {!customers.length&&<Empty>Agregá el primer cliente mayorista.</Empty>}
     </div>
    </section>
   </section>}

   {tab==='Ventas'&&<>
    <section className="eggs-two-column">
     <form className="eggs-card eggs-form" onSubmit={createOrder}>
      <div className="eggs-section-head"><div><small>NUEVO PEDIDO</small><h2>Registrar venta</h2></div></div>
      <Field label="Cliente"><select required value={orderForm.customer_id} onChange={e=>setOrderForm({...orderForm,customer_id:e.target.value,unit_price:''})}><option value="">Seleccionar</option>{customers.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Clasificación"><select required value={orderForm.grade_id} onChange={e=>setOrderForm({...orderForm,grade_id:e.target.value,unit_price:''})}><option value="">Seleccionar</option>{grades.map(g=>{const stock=inventory.find(i=>i.grade_id===g.id);return <option key={g.id} value={g.id}>{g.name} · {number(stock?.stock_eggs||0)} disponibles</option>})}</select></Field>
      <div className="eggs-form-grid"><Field label="Presentación"><select value={orderForm.presentation} onChange={e=>{const eggs=e.target.value==='Docena'?12:e.target.value==='Bandeja'?30:e.target.value==='Caja'?360:1;setOrderForm({...orderForm,presentation:e.target.value,eggs_per_unit:String(eggs),unit_price:''})}}><option>Bandeja</option><option>Docena</option><option>Caja</option><option>Unidad</option></select></Field><Field label="Huevos por presentación"><input type="number" min="1" required value={orderForm.eggs_per_unit} onChange={e=>setOrderForm({...orderForm,eggs_per_unit:e.target.value})}/></Field></div>
      <div className="eggs-form-grid"><Field label="Cantidad"><input type="number" min="0.01" step="0.01" required value={orderForm.quantity_units} onChange={e=>setOrderForm({...orderForm,quantity_units:e.target.value,unit_price:''})}/></Field><Field label="Precio por presentación" hint={suggestedPrice?'Precio mayorista aplicado automáticamente: '+money(suggestedPrice):'Podés ingresarlo manualmente si no existe una regla.'}><input type="number" min="0" step="0.01" required value={orderForm.unit_price} onChange={e=>setOrderForm({...orderForm,unit_price:e.target.value})}/></Field></div>
      <Field label="Condición de pago"><select value={orderForm.payment_type} onChange={e=>setOrderForm({...orderForm,payment_type:e.target.value})}><option value="CASH">Contado</option><option value="CREDIT">Crédito</option></select></Field>
      <Field label="Notas"><textarea value={orderForm.notes} onChange={e=>setOrderForm({...orderForm,notes:e.target.value})}/></Field>
      {orderForm.quantity_units&&orderForm.unit_price&&<div className="eggs-order-preview"><span>Total estimado</span><strong>{money(Number(orderForm.quantity_units)*Number(orderForm.unit_price))}</strong><small>{number(Number(orderForm.quantity_units)*Number(orderForm.eggs_per_unit||0))} huevos</small></div>}
      <button className="eggs-primary" disabled={saving||!customers.length}>Registrar venta</button>
     </form>
     <section className="eggs-card">
      <div className="eggs-section-head"><div><small>DISPONIBILIDAD</small><h2>Stock para venta</h2></div></div>
      <div className="eggs-stock-list">{grades.map(g=>{const stock=inventory.find(i=>i.grade_id===g.id);return <div key={g.id}><span><b>{g.name}</b><small>{g.min_weight_g||'—'}–{g.max_weight_g||'+'} g</small></span><strong>{number(stock?.stock_eggs||0)} <small>huevos</small></strong></div>})}</div>
     </section>
    </section>
    <section className="eggs-card">
     <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Pedidos y ventas</h2></div><Pill>{orders.length}</Pill></div>
     <div className="eggs-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Detalle</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>
      {orders.map(o=>{const item=o.egg_order_items?.[0];const balance=Math.max(0,Number(o.total)-Number(o.paid_amount));return <tr key={o.id}><td><b>{o.order_number}</b><small>{date(o.order_date)}</small></td><td>{o.egg_customers?.name}</td><td>{item?<><b>{item.egg_grades?.name}</b><small>{item.quantity_units} {item.presentation} · {number(item.total_eggs)} huevos</small></>:'—'}</td><td>{money(o.total)}</td><td>{money(o.paid_amount)}</td><td>{money(balance)}</td><td><Pill tone={o.status==='PAID'?'good':'warn'}>{o.status==='PAID'?'Pagado':'Pendiente'}</Pill></td></tr>})}
      {!orders.length&&<tr><td colSpan="7"><Empty>No hay pedidos registrados.</Empty></td></tr>}
     </tbody></table></div>
    </section>
   </>}

   {tab==='Caja'&&<section className="eggs-two-column eggs-cash-layout">
    <form className="eggs-card eggs-form" onSubmit={recordPayment}>
     <div className="eggs-section-head"><div><small>CUENTAS POR COBRAR</small><h2>Registrar abono</h2></div></div>
     <Field label="Pedido"><select required value={paymentForm.order_id} onChange={e=>{const order=orders.find(o=>o.id===e.target.value);setPaymentForm({...paymentForm,order_id:e.target.value,amount:order?String(Math.max(0,Number(order.total)-Number(order.paid_amount))):''})}}><option value="">Seleccionar pedido</option>{orders.filter(o=>o.status!=='PAID'&&o.status!=='CANCELLED').map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.egg_customers?.name} · saldo {money(Math.max(0,Number(o.total)-Number(o.paid_amount)))}</option>)}</select></Field>
     <Field label="Monto"><input type="number" min="0.01" step="0.01" required value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})}/></Field>
     <Field label="Método"><select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm,method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></Field>
     <Field label="Referencia"><input value={paymentForm.reference} onChange={e=>setPaymentForm({...paymentForm,reference:e.target.value})} placeholder="Comprobante / transferencia"/></Field>
     <button className="eggs-primary" disabled={saving}>Registrar abono</button>
    </form>
    <section className="eggs-card">
     <div className="eggs-section-head"><div><small>RESUMEN</small><h2>Cartera mayorista</h2></div></div>
     <div className="eggs-cash-summary"><div><span>Total vendido</span><b>{money(salesTotal)}</b></div><div><span>Saldo pendiente</span><b>{money(receivable)}</b></div><div><span>Cobros registrados</span><b>{money(payments.reduce((s,p)=>s+Number(p.amount||0),0))}</b></div></div>
     <div className="eggs-list compact">
      {orders.filter(o=>Number(o.total)>Number(o.paid_amount)&&o.status!=='CANCELLED').slice(0,10).map(o=><article key={o.id}><div><b>{o.egg_customers?.name}</b><small>{o.order_number} · vence {date(o.due_date)}</small></div><strong>{money(Number(o.total)-Number(o.paid_amount))}</strong></article>)}
      {!openOrders.length&&<Empty>No hay saldos pendientes.</Empty>}
     </div>
    </section>
    <section className="eggs-card eggs-wide">
     <div className="eggs-section-head"><div><small>MOVIMIENTOS</small><h2>Últimos cobros</h2></div></div>
     <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Método</th><th>Referencia</th><th>Monto</th></tr></thead><tbody>
      {payments.map(p=><tr key={p.id}><td>{date(p.paid_at)}</td><td>{p.egg_orders?.order_number||'—'}</td><td>{p.method}</td><td>{p.reference||'—'}</td><td><b>{money(p.amount)}</b></td></tr>)}
      {!payments.length&&<tr><td colSpan="5"><Empty>No hay cobros registrados.</Empty></td></tr>}
     </tbody></table></div>
    </section>
   </section>}

   {tab==='Precios'&&hasModule('EGG_PRICING')&&<EggPricingPanel companyId={companyId}/>}
   {tab==='Devoluciones'&&hasModule('EGG_RETURNS')&&<EggReturnsPanel companyId={companyId}/>}
   {tab==='Reportes'&&hasModule('EGG_REPORTS')&&<EggReportsPanel companyId={companyId}/>}
   {tab==='Rutas'&&hasModule('EGG_LOGISTICS')&&<EggRoutesPanel companyId={companyId}/>}
   {tab==='Despacho'&&hasModule('EGG_LOGISTICS')&&<EggDispatchPanel companyId={companyId}/>}
   {tab==='Máquina'&&hasModule('EGG_MACHINE')&&<EggMachinePanel companyId={companyId}/>}
   {tab==='Móvil'&&hasModule('EGG_MOBILE')&&<EggMobileDeliveryPanel companyId={companyId} onExit={()=>setTab('Inicio')}/>}
   {tab==='DTE'&&hasModule('DTE')&&<EggDtePanel companyId={companyId}/>}
   {tab==='Usuarios'&&hasModule('EGG_USERS')&&<EggUsersPanel companyId={companyId}/>}
  </main>
 </div>
}
