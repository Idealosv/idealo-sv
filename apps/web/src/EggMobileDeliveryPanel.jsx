import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggMobileDeliveryPanel({companyId,onExit}){
 const [routes,setRoutes]=useState([])
 const [routeId,setRouteId]=useState('')
 const [delivery,setDelivery]=useState(null)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const {data,error}=await supabase.from('egg_routes')
   .select('*,egg_route_stops(*,egg_orders(id,order_number,total,paid_amount,status,egg_customers(name,address,phone)))')
   .eq('company_id',companyId).in('status',['PLANNED','IN_TRANSIT']).order('route_date',{ascending:true})
  if(error)throw error
  setRoutes(data||[])
  setRouteId(current=>current||data?.[0]?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const route=routes.find(r=>r.id===routeId)||null
 const stops=useMemo(()=>[...(route?.egg_route_stops||[])].sort((a,b)=>a.stop_order-b.stop_order),[route])
 const pending=stops.filter(s=>s.status==='PENDING')
 const delivered=stops.filter(s=>s.status==='DELIVERED')

 const start=async()=>{
  setSaving(true);setError('');setNotice('')
  const {error}=await supabase.rpc('egg_start_route',{p_route_id:routeId})
  if(error)setError(errorText(error));else{setNotice('Ruta iniciada.');await load()}
  setSaving(false)
 }

 const markFailed=async stop=>{
  const note=window.prompt('Motivo de entrega fallida:','Cliente ausente')||'Entrega fallida'
  setSaving(true);setError('');setNotice('')
  const {error}=await supabase.rpc('egg_mark_route_stop_failed',{p_stop_id:stop.id,p_notes:note})
  if(error)setError(errorText(error));else{setNotice('Entrega marcada como fallida.');await load()}
  setSaving(false)
 }

 const confirm=async e=>{
  e.preventDefault();if(!delivery)return
  setSaving(true);setError('');setNotice('')
  const {error}=await supabase.rpc('egg_deliver_route_stop',{
   p_stop_id:delivery.id,p_received_by:delivery.received_by,p_collected_amount:Number(delivery.collected_amount||0),
   p_collection_method:delivery.collection_method,p_collection_reference:delivery.collection_reference,p_notes:delivery.notes
  })
  if(error)setError(errorText(error));else{setDelivery(null);setNotice('Entrega confirmada.');await load()}
  setSaving(false)
 }

 return <div className="egg-mobile-app">
  <header className="egg-mobile-header">
   <div><small>IDEALO EGGS · REPARTO</small><h1>Ruta del motorista</h1></div>
   <button onClick={onExit}>Salir</button>
  </header>
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <main className="egg-mobile-main">
   <label className="eggs-field"><span>Ruta asignada</span><select value={routeId} onChange={e=>setRouteId(e.target.value)}><option value="">Seleccionar ruta</option>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} · {r.name||'Ruta'} · {r.status}</option>)}</select></label>
   {route&&<>
    <section className="egg-mobile-summary">
     <div><span>Motorista</span><b>{route.driver_name||'—'}</b></div>
     <div><span>Vehículo</span><b>{route.vehicle||'—'}</b></div>
     <div><span>Pendientes</span><b>{pending.length}</b></div>
     <div><span>Entregados</span><b>{delivered.length}</b></div>
    </section>
    {route.status==='PLANNED'&&<button className="egg-mobile-start" disabled={saving||!stops.length} onClick={start}>Iniciar ruta</button>}
    <section className="egg-mobile-stops">
     {stops.map(stop=>{
      const order=stop.egg_orders
      const customer=order?.egg_customers
      const balance=Math.max(0,Number(order?.total||0)-Number(order?.paid_amount||0))
      const mapHref='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(customer?.address||customer?.name||'')
      return <article key={stop.id} className={'egg-mobile-stop '+String(stop.status||'').toLowerCase()}>
       <div className="egg-mobile-stop-number">{stop.stop_order}</div>
       <div className="egg-mobile-stop-info">
        <h2>{customer?.name||'Cliente'}</h2>
        <p>{customer?.address||'Sin dirección registrada'}</p>
        <div className="egg-mobile-order"><span>{order?.order_number}</span><b>Saldo {money(balance)}</b></div>
        <div className="egg-mobile-links">
         {customer?.phone&&<a href={'tel:'+customer.phone}>Llamar</a>}
         {customer?.address&&<a href={mapHref} target="_blank" rel="noreferrer">Navegar</a>}
        </div>
       </div>
       <div className="egg-mobile-stop-actions">
        {stop.status==='PENDING'?<>
         <button className="deliver" onClick={()=>setDelivery({id:stop.id,customer:customer?.name,order_number:order?.order_number,balance,received_by:'',collected_amount:'',collection_method:'CASH',collection_reference:'',notes:''})}>Entregar</button>
         <button className="fail" disabled={saving} onClick={()=>markFailed(stop)}>No entregado</button>
        </>:<span className={'eggs-pill '+(stop.status==='DELIVERED'?'good':'danger')}>{stop.status==='DELIVERED'?'Entregado':'Fallido'}</span>}
       </div>
      </article>
     })}
     {!stops.length&&<div className="eggs-empty">Esta ruta no tiene pedidos.</div>}
    </section>
   </>}
  </main>

  {delivery&&<div className="eggs-modal-backdrop">
   <form className="eggs-modal egg-mobile-modal" onSubmit={confirm}>
    <div className="eggs-section-head"><div><small>CONFIRMAR ENTREGA</small><h2>{delivery.customer}</h2><p>{delivery.order_number} · saldo {money(delivery.balance)}</p></div></div>
    <label className="eggs-field"><span>Recibido por</span><input required value={delivery.received_by} onChange={e=>setDelivery({...delivery,received_by:e.target.value})}/></label>
    <label className="eggs-field"><span>Cobro recibido</span><input type="number" min="0" max={delivery.balance} step="0.01" value={delivery.collected_amount} onChange={e=>setDelivery({...delivery,collected_amount:e.target.value})}/></label>
    <label className="eggs-field"><span>Método</span><select value={delivery.collection_method} onChange={e=>setDelivery({...delivery,collection_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
    <label className="eggs-field"><span>Referencia</span><input value={delivery.collection_reference} onChange={e=>setDelivery({...delivery,collection_reference:e.target.value})}/></label>
    <label className="eggs-field"><span>Notas</span><textarea value={delivery.notes} onChange={e=>setDelivery({...delivery,notes:e.target.value})}/></label>
    <div className="eggs-modal-actions"><button type="button" onClick={()=>setDelivery(null)}>Cancelar</button><button className="eggs-primary" disabled={saving}>Confirmar</button></div>
   </form>
  </div>}
 </div>
}
