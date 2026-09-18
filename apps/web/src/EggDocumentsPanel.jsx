import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))

export default function EggDocumentsPanel({companyId}){
 const [orders,setOrders]=useState([])
 const [routes,setRoutes]=useState([])
 const [customers,setCustomers]=useState([])
 const [orderId,setOrderId]=useState('')
 const [routeId,setRouteId]=useState('')
 const [customerId,setCustomerId]=useState('')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [o,r,c]=await Promise.all([
   supabase.from('egg_orders').select('id,order_number,total,status,egg_customers(name)').eq('company_id',companyId).neq('status','CANCELLED').order('created_at',{ascending:false}).limit(150),
   supabase.from('egg_routes').select('id,route_code,name,route_date,status').eq('company_id',companyId).order('route_date',{ascending:false}).limit(100),
   supabase.from('egg_customers').select('id,name').eq('company_id',companyId).eq('active',true).order('name')
  ])
  for(const x of [o,r,c])if(x.error)throw x.error
  setOrders(o.data||[]);setRoutes(r.data||[]);setCustomers(c.data||[])
  setOrderId(current=>current||o.data?.[0]?.id||'')
  setRouteId(current=>current||r.data?.[0]?.id||'')
  setCustomerId(current=>current||c.data?.[0]?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(String(e?.message||e)))},[load])

 const download=async(type,params)=>{
  setLoading(true);setError('');setNotice('')
  try{
   const {data:{session}}=await supabase.auth.getSession()
   if(!session?.access_token)throw new Error('La sesión expiró.')
   const query=new URLSearchParams({company_id:companyId,...params})
   const res=await fetch(apiUrl+'/api/eggs/documents/'+type+'?'+query.toString(),{headers:{Authorization:'Bearer '+session.access_token}})
   if(!res.ok){
    const body=await res.json().catch(()=>({}));throw new Error(body.message||'No se pudo generar el PDF.')
   }
   const blob=await res.blob()
   const disposition=res.headers.get('content-disposition')||''
   const match=/filename="?([^"]+)"?/i.exec(disposition)
   const filename=match?.[1]||('idealo-eggs-'+type+'.pdf')
   const url=URL.createObjectURL(blob)
   const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)
   setNotice('PDF generado correctamente: '+filename)
  }catch(e){setError(String(e?.message||e))}
  finally{setLoading(false)}
 }

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>DOCUMENTOS COMERCIALES</small><h2>PDF listos para entregar</h2><p>Generados con la información actual del sistema y el estilo de IDEALO SV.</p></div><button onClick={load}>Actualizar</button></div>
   <div className="eggs-doc-grid">
    <article>
     <div><span>PEDIDO</span><h3>Comprobante de pedido</h3><p>Detalle de venta, cantidades, precios, total, pagado y saldo.</p></div>
     <select value={orderId} onChange={e=>setOrderId(e.target.value)}>{orders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.egg_customers?.name} · {money(o.total)}</option>)}</select>
     <button disabled={loading||!orderId} onClick={()=>download('order',{order_id:orderId})}>Generar PDF</button>
    </article>
    <article>
     <div><span>ENTREGA</span><h3>Nota de entrega</h3><p>Documento logístico con espacio de recibido, firma o sello.</p></div>
     <select value={orderId} onChange={e=>setOrderId(e.target.value)}>{orders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.egg_customers?.name}</option>)}</select>
     <button disabled={loading||!orderId} onClick={()=>download('delivery',{order_id:orderId})}>Generar PDF</button>
    </article>
    <article>
     <div><span>DESPACHO</span><h3>Manifiesto de carga</h3><p>Producto cargado por clasificación y lista ordenada de paradas.</p></div>
     <select value={routeId} onChange={e=>setRouteId(e.target.value)}>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} · {r.name||'Ruta'} · {r.status}</option>)}</select>
     <button disabled={loading||!routeId} onClick={()=>download('manifest',{route_id:routeId})}>Generar PDF</button>
    </article>
    <article>
     <div><span>CARTERA</span><h3>Estado de cuenta</h3><p>Ventas, abonos, vencimientos y saldo del cliente mayorista.</p></div>
     <select value={customerId} onChange={e=>setCustomerId(e.target.value)}>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
     <button disabled={loading||!customerId} onClick={()=>download('statement',{customer_id:customerId})}>Generar PDF</button>
    </article>
    <article>
     <div><span>REPARTO</span><h3>Liquidación de motorista</h3><p>Entregas, fallidas, cobros recibidos y firmas de cierre de ruta.</p></div>
     <select value={routeId} onChange={e=>setRouteId(e.target.value)}>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} · {r.name||'Ruta'}</option>)}</select>
     <button disabled={loading||!routeId} onClick={()=>download('settlement',{route_id:routeId})}>Generar PDF</button>
    </article>
   </div>
  </section>
 </div>
}
