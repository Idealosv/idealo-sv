import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const date=v=>v?new Date(String(v).includes('T')?v:`${v}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggRoutesPanel({companyId}){
 const [routes,setRoutes]=useState([])
 const [orders,setOrders]=useState([])
 const [selectedRoute,setSelectedRoute]=useState('')
 const [form,setForm]=useState({route_date:new Date().toISOString().slice(0,10),name:'',driver_name:'',vehicle:'',notes:''})
 const [assignOrder,setAssignOrder]=useState('')
 const [delivery,setDelivery]=useState(null)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [routeRes,orderRes]=await Promise.all([
   supabase.from('egg_routes').select('*,egg_route_stops(*,egg_orders(id,order_number,total,paid_amount,status,egg_customers(name,address,phone)))').eq('company_id',companyId).order('route_date',{ascending:false}).limit(100),
   supabase.from('egg_orders').select('id,order_number,total,paid_amount,status,order_date,egg_customers(name,address,phone)').eq('company_id',companyId).neq('status','CANCELLED').order('created_at',{ascending:false}).limit(200)
  ])
  if(routeRes.error)throw routeRes.error
  if(orderRes.error)throw orderRes.error
  const nextRoutes=routeRes.data||[]
  setRoutes(nextRoutes)
  setOrders(orderRes.data||[])
  setSelectedRoute(current=>current||nextRoutes[0]?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const act=async(fn,message)=>{
  setSaving(true);setError('');setNotice('')
  try{await fn();setNotice(message);await load()}
  catch(e){setError(errorText(e))}
  finally{setSaving(false)}
 }

 const createRoute=e=>{e.preventDefault();return act(async()=>{
  const {data,error}=await supabase.rpc('egg_create_route',{p_company_id:companyId,p_route_date:form.route_date,p_name:form.name,p_driver_name:form.driver_name,p_vehicle:form.vehicle,p_notes:form.notes})
  if(error)throw error
  setSelectedRoute(data)
  setForm(current=>({...current,name:'',driver_name:'',vehicle:'',notes:''}))
 },'Ruta creada correctamente.')}

 const assign=e=>{e.preventDefault();if(!selectedRoute||!assignOrder)return
  return act(async()=>{const {error}=await supabase.rpc('egg_add_order_to_route',{p_route_id:selectedRoute,p_order_id:assignOrder});if(error)throw error;setAssignOrder('')},'Pedido agregado a la ruta.')
 }

 const start=id=>act(async()=>{const {error}=await supabase.rpc('egg_start_route',{p_route_id:id});if(error)throw error},'Ruta iniciada.')

 const confirmDelivery=e=>{e.preventDefault();if(!delivery)return
  return act(async()=>{
   const {error}=await supabase.rpc('egg_deliver_route_stop',{
    p_stop_id:delivery.id,p_received_by:delivery.received_by,p_collected_amount:Number(delivery.collected_amount||0),
    p_collection_method:delivery.collection_method,p_collection_reference:delivery.collection_reference,p_notes:delivery.notes
   })
   if(error)throw error
   setDelivery(null)
  },'Entrega confirmada y cobro aplicado cuando corresponde.')
 }

 const active=routes.find(r=>r.id===selectedRoute)||null
 const assignedOrderIds=useMemo(()=>new Set(routes.flatMap(r=>(r.egg_route_stops||[]).filter(s=>['PENDING','DELIVERED'].includes(s.status)).map(s=>s.order_id))),[routes])
 const availableOrders=orders.filter(o=>!assignedOrderIds.has(o.id))
 const deliveredCount=routes.reduce((sum,r)=>sum+(r.egg_route_stops||[]).filter(s=>s.status==='DELIVERED').length,0)
 const pendingCount=routes.reduce((sum,r)=>sum+(r.egg_route_stops||[]).filter(s=>s.status==='PENDING').length,0)

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  <section className="eggs-metrics eggs-v2-metrics">
   <article className="eggs-metric"><span>Rutas</span><strong>{routes.length}</strong><small>planificadas y completadas</small></article>
   <article className="eggs-metric"><span>Entregas pendientes</span><strong>{pendingCount}</strong><small>paradas por atender</small></article>
   <article className="eggs-metric"><span>Entregas realizadas</span><strong>{deliveredCount}</strong><small>confirmadas</small></article>
  </section>

  <section className="eggs-two-column">
   <form className="eggs-card eggs-form" onSubmit={createRoute}>
    <div className="eggs-section-head"><div><small>PLANIFICACIÓN</small><h2>Nueva ruta</h2></div></div>
    <label className="eggs-field"><span>Fecha</span><input type="date" required value={form.route_date} onChange={e=>setForm({...form,route_date:e.target.value})}/></label>
    <label className="eggs-field"><span>Nombre de ruta</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ruta Ahuachapán centro"/></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Motorista</span><input value={form.driver_name} onChange={e=>setForm({...form,driver_name:e.target.value})}/></label>
     <label className="eggs-field"><span>Vehículo</span><input value={form.vehicle} onChange={e=>setForm({...form,vehicle:e.target.value})} placeholder="Placa / unidad"/></label>
    </div>
    <label className="eggs-field"><span>Notas</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    <button className="eggs-primary" disabled={saving}>Crear ruta</button>
   </form>

   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>DESPACHO</small><h2>Asignar pedidos</h2><p>Un pedido queda reservado a una ruta activa.</p></div></div>
    <form onSubmit={assign} className="eggs-inline-form">
     <label className="eggs-field"><span>Ruta</span><select value={selectedRoute} onChange={e=>setSelectedRoute(e.target.value)}><option value="">Seleccionar</option>{routes.filter(r=>r.status==='PLANNED').map(r=><option key={r.id} value={r.id}>{r.route_code} · {r.name||'Sin nombre'} · {date(r.route_date)}</option>)}</select></label>
     <label className="eggs-field"><span>Pedido</span><select value={assignOrder} onChange={e=>setAssignOrder(e.target.value)}><option value="">Seleccionar pedido</option>{availableOrders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.egg_customers?.name} · {money(o.total)}</option>)}</select></label>
     <button className="eggs-primary" disabled={saving||!selectedRoute||!assignOrder}>Agregar a ruta</button>
    </form>
    {active&&<div className="eggs-route-summary">
     <div><b>{active.route_code}</b><small>{active.name||'Ruta sin nombre'} · {active.driver_name||'Sin motorista'} · {active.vehicle||'Sin vehículo'}</small></div>
     <span className={`eggs-pill ${active.status==='COMPLETED'?'good':active.status==='IN_TRANSIT'?'warn':'neutral'}`}>{active.status==='PLANNED'?'Planificada':active.status==='IN_TRANSIT'?'En ruta':active.status==='COMPLETED'?'Completada':'Cancelada'}</span>
    </div>}
   </section>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>RUTAS Y ENTREGAS</small><h2>Despachos programados</h2></div></div>
   <div className="eggs-route-list">
    {routes.map(route=><article className="eggs-route-card" key={route.id}>
     <header>
      <div><b>{route.route_code}</b><h3>{route.name||'Ruta de reparto'}</h3><small>{date(route.route_date)} · {route.driver_name||'Sin motorista'} · {route.vehicle||'Sin vehículo'}</small></div>
      <div className="eggs-route-actions">
       <span className={`eggs-pill ${route.status==='COMPLETED'?'good':route.status==='IN_TRANSIT'?'warn':'neutral'}`}>{route.status}</span>
       {route.status==='PLANNED'&&<button disabled={saving||!(route.egg_route_stops||[]).length} onClick={()=>start(route.id)}>Iniciar ruta</button>}
      </div>
     </header>
     <div className="eggs-stop-list">
      {(route.egg_route_stops||[]).sort((a,b)=>a.stop_order-b.stop_order).map(stop=>{
       const order=stop.egg_orders;const balance=Math.max(0,Number(order?.total||0)-Number(order?.paid_amount||0))
       return <div key={stop.id} className={`eggs-stop ${stop.status.toLowerCase()}`}>
        <span className="eggs-stop-number">{stop.stop_order}</span>
        <div className="eggs-stop-customer"><b>{order?.egg_customers?.name||'Cliente'}</b><small>{order?.egg_customers?.address||'Sin dirección'} · {order?.egg_customers?.phone||'Sin teléfono'}</small><small>{order?.order_number} · saldo {money(balance)}</small></div>
        <div className="eggs-stop-state"><span className={`eggs-pill ${stop.status==='DELIVERED'?'good':'warn'}`}>{stop.status==='DELIVERED'?'Entregado':'Pendiente'}</span>{stop.status==='PENDING'&&<button onClick={()=>setDelivery({id:stop.id,order_number:order?.order_number,customer:order?.egg_customers?.name,balance,received_by:'',collected_amount:'',collection_method:'CASH',collection_reference:'',notes:''})}>Confirmar entrega</button>}</div>
       </div>
      })}
      {!(route.egg_route_stops||[]).length&&<div className="eggs-empty">Esta ruta todavía no tiene pedidos.</div>}
     </div>
    </article>)}
    {!routes.length&&<div className="eggs-empty">Creá la primera ruta de reparto.</div>}
   </div>
  </section>

  {delivery&&<div className="eggs-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setDelivery(null)}>
   <form className="eggs-modal" onSubmit={confirmDelivery}>
    <div className="eggs-section-head"><div><small>ENTREGA</small><h2>{delivery.customer}</h2><p>{delivery.order_number} · saldo {money(delivery.balance)}</p></div><button type="button" onClick={()=>setDelivery(null)}>×</button></div>
    <label className="eggs-field"><span>Recibido por</span><input value={delivery.received_by} onChange={e=>setDelivery({...delivery,received_by:e.target.value})}/></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Cobro recibido</span><input type="number" min="0" max={delivery.balance} step="0.01" value={delivery.collected_amount} onChange={e=>setDelivery({...delivery,collected_amount:e.target.value})}/></label>
     <label className="eggs-field"><span>Método</span><select value={delivery.collection_method} onChange={e=>setDelivery({...delivery,collection_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
    </div>
    <label className="eggs-field"><span>Referencia</span><input value={delivery.collection_reference} onChange={e=>setDelivery({...delivery,collection_reference:e.target.value})}/></label>
    <label className="eggs-field"><span>Notas</span><textarea value={delivery.notes} onChange={e=>setDelivery({...delivery,notes:e.target.value})}/></label>
    <div className="eggs-modal-actions"><button type="button" onClick={()=>setDelivery(null)}>Cancelar</button><button className="eggs-primary" disabled={saving}>Confirmar entrega</button></div>
   </form>
  </div>}
 </div>
}
