import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const num=v=>new Intl.NumberFormat('es-SV').format(Number(v||0))
const date=v=>v?new Date(String(v).includes('T')?v:v+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggDispatchPanel({companyId}){
 const [routes,setRoutes]=useState([])
 const [routeId,setRouteId]=useState('')
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [returns,setReturns]=useState({})

 const load=useCallback(async()=>{
  if(!companyId)return
  const {data,error}=await supabase.from('egg_routes')
   .select('*,egg_route_stops(id,status,order_id,egg_orders(order_number,egg_customers(name))),egg_route_load_items(*,egg_grades(name,code))')
   .eq('company_id',companyId).order('route_date',{ascending:false}).limit(100)
  if(error)throw error
  setRoutes(data||[])
  setRouteId(current=>current||data?.[0]?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const route=routes.find(r=>r.id===routeId)||null
 const loadItems=route?.egg_route_load_items||[]

 const act=async(fn,message)=>{setSaving(true);setError('');setNotice('');try{await fn();setNotice(message);await load()}catch(e){setError(errorText(e))}finally{setSaving(false)}}

 const prepare=()=>act(async()=>{
  const {error}=await supabase.rpc('egg_prepare_route_load',{p_route_id:routeId})
  if(error)throw error
 },'Carga preparada a partir de los pedidos de la ruta.')

 const updateLoaded=async(item,value)=>{
  setSaving(true);setError('');setNotice('')
  const {error}=await supabase.from('egg_route_load_items').update({loaded_eggs:Number(value),updated_at:new Date().toISOString()}).eq('id',item.id)
  if(error)setError(errorText(error));else{setNotice('Cantidad cargada actualizada.');await load()}
  setSaving(false)
 }

 const recordReturn=async item=>{
  const values=returns[item.id]||{good:'0',damaged:'0',notes:''}
  return act(async()=>{
   const {error}=await supabase.rpc('egg_record_route_return',{
    p_route_id:routeId,p_grade_id:item.grade_id,p_returned_good:Number(values.good||0),p_damaged:Number(values.damaged||0),p_notes:values.notes||''
   })
   if(error)throw error
   setReturns(current=>({...current,[item.id]:{good:'0',damaged:'0',notes:''}}))
  },'Retorno de ruta registrado. Producto bueno reintegrado y daño contabilizado.')
 }

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>CARGA Y DESPACHO</small><h2>Preparación de vehículo</h2><p>Consolida todos los pedidos de la ruta por clasificación.</p></div></div>
   <label className="eggs-field"><span>Ruta</span><select value={routeId} onChange={e=>setRouteId(e.target.value)}><option value="">Seleccionar</option>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} · {r.name||'Ruta'} · {date(r.route_date)} · {r.status}</option>)}</select></label>
   {route&&<div className="eggs-dispatch-summary">
    <div><span>Motorista</span><b>{route.driver_name||'—'}</b></div>
    <div><span>Vehículo</span><b>{route.vehicle||'—'}</b></div>
    <div><span>Pedidos</span><b>{(route.egg_route_stops||[]).length}</b></div>
    <div><span>Preparada</span><b>{route.load_prepared_at?'Sí':'No'}</b></div>
   </div>}
   <button className="eggs-primary eggs-inline-primary" disabled={saving||!routeId||route?.status==='COMPLETED'} onClick={prepare}>{route?.load_prepared_at?'Recalcular carga':'Preparar carga'}</button>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>MANIFIESTO</small><h2>Producto a cargar</h2></div><span className="eggs-pill">{loadItems.length} tamaños</span></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>Clasificación</th><th>Requerido</th><th>Cargado</th><th>Retorno bueno</th><th>Dañado</th><th>Acción</th></tr></thead><tbody>
    {loadItems.map(item=>{
     const state=returns[item.id]||{good:String(item.returned_good_eggs||0),damaged:String(item.damaged_eggs||0),notes:''}
     return <tr key={item.id}>
      <td><b>{item.egg_grades?.name}</b><small>{item.egg_grades?.code}</small></td>
      <td>{num(item.expected_eggs)}</td>
      <td><input className="eggs-table-input" type="number" min="0" defaultValue={item.loaded_eggs} onBlur={e=>Number(e.target.value)!==Number(item.loaded_eggs)&&updateLoaded(item,e.target.value)}/></td>
      <td><input className="eggs-table-input" type="number" min="0" value={state.good} onChange={e=>setReturns(current=>({...current,[item.id]:{...state,good:e.target.value}}))}/></td>
      <td><input className="eggs-table-input" type="number" min="0" value={state.damaged} onChange={e=>setReturns(current=>({...current,[item.id]:{...state,damaged:e.target.value}}))}/></td>
      <td><button className="eggs-mini-action" disabled={saving} onClick={()=>recordReturn(item)}>Registrar retorno</button></td>
     </tr>
    })}
    {!loadItems.length&&<tr><td colSpan="6"><div className="eggs-empty">Prepará la carga para generar el manifiesto.</div></td></tr>}
   </tbody></table></div>
   <div className="eggs-note">Los huevos devueltos en buen estado vuelven al inventario. Los dañados en transporte quedan registrados como pérdida.</div>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>PEDIDOS DE RUTA</small><h2>Control de paradas</h2></div></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>#</th><th>Pedido</th><th>Cliente</th><th>Estado</th></tr></thead><tbody>
    {(route?.egg_route_stops||[]).map((s,i)=><tr key={s.id}><td>{i+1}</td><td>{s.egg_orders?.order_number}</td><td>{s.egg_orders?.egg_customers?.name}</td><td><span className={'eggs-pill '+(s.status==='DELIVERED'?'good':s.status==='FAILED'?'danger':'warn')}>{s.status}</span></td></tr>)}
    {!route?.egg_route_stops?.length&&<tr><td colSpan="4"><div className="eggs-empty">No hay pedidos asignados.</div></td></tr>}
   </tbody></table></div>
  </section>
 </div>
}
