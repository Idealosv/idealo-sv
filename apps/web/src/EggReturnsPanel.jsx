import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const num=v=>new Intl.NumberFormat('es-SV').format(Number(v||0))
const date=v=>v?new Date(v).toLocaleString('es-SV'):'—'
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggReturnsPanel({companyId}){
 const [grades,setGrades]=useState([])
 const [orders,setOrders]=useState([])
 const [losses,setLosses]=useState([])
 const [returns,setReturns]=useState([])
 const [lossForm,setLossForm]=useState({grade_id:'',quantity_eggs:'',loss_type:'BREAKAGE',notes:''})
 const [returnForm,setReturnForm]=useState({order_id:'',grade_id:'',quantity_eggs:'',disposition:'RESTOCK',reason:'',refund_amount:'0'})
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [g,o,l,r]=await Promise.all([
   supabase.from('egg_grades').select('*').eq('company_id',companyId).eq('active',true).order('sort_order'),
   supabase.from('egg_orders').select('id,order_number,total,status,egg_customers(name),egg_order_items(grade_id,total_eggs,egg_grades(name))').eq('company_id',companyId).neq('status','CANCELLED').order('created_at',{ascending:false}).limit(150),
   supabase.from('egg_loss_events').select('*,egg_grades(name)').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
   supabase.from('egg_returns').select('*,egg_orders(order_number,egg_customers(name)),egg_grades(name)').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100)
  ])
  for(const x of [g,o,l,r])if(x.error)throw x.error
  setGrades(g.data||[]);setOrders(o.data||[]);setLosses(l.data||[]);setReturns(r.data||[])
  setLossForm(current=>({...current,grade_id:current.grade_id||g.data?.[0]?.id||''}))
  setReturnForm(current=>({...current,order_id:current.order_id||o.data?.[0]?.id||'',grade_id:current.grade_id||o.data?.[0]?.egg_order_items?.[0]?.grade_id||g.data?.[0]?.id||''}))
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const act=async(fn,message)=>{setSaving(true);setError('');setNotice('');try{await fn();setNotice(message);await load()}catch(e){setError(errorText(e))}finally{setSaving(false)}}

 const saveLoss=e=>{e.preventDefault();return act(async()=>{
  const {error}=await supabase.rpc('egg_record_loss',{
   p_company_id:companyId,p_grade_id:lossForm.grade_id,p_quantity_eggs:Number(lossForm.quantity_eggs),
   p_loss_type:lossForm.loss_type,p_batch_id:null,p_order_id:null,p_route_id:null,p_notes:lossForm.notes
  })
  if(error)throw error
  setLossForm(current=>({...current,quantity_eggs:'',notes:''}))
 },'Pérdida registrada e inventario ajustado.')}

 const saveReturn=e=>{e.preventDefault();return act(async()=>{
  const {error}=await supabase.rpc('egg_record_return',{
   p_order_id:returnForm.order_id,p_grade_id:returnForm.grade_id,p_quantity_eggs:Number(returnForm.quantity_eggs),
   p_disposition:returnForm.disposition,p_reason:returnForm.reason,p_refund_amount:Number(returnForm.refund_amount||0)
  })
  if(error)throw error
  setReturnForm(current=>({...current,quantity_eggs:'',reason:'',refund_amount:'0'}))
 },returnForm.disposition==='RESTOCK'?'Devolución registrada y producto reintegrado al inventario.':'Devolución dañada registrada como pérdida.')}

 const selectedOrder=orders.find(o=>o.id===returnForm.order_id)

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  <section className="eggs-two-column">
   <form className="eggs-card eggs-form" onSubmit={saveLoss}>
    <div className="eggs-section-head"><div><small>MERMA Y PÉRDIDA</small><h2>Registrar pérdida</h2><p>Roturas, suciedad, vencimiento, transporte y ajustes.</p></div></div>
    <label className="eggs-field"><span>Clasificación</span><select required value={lossForm.grade_id} onChange={e=>setLossForm({...lossForm,grade_id:e.target.value})}>{grades.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Cantidad de huevos</span><input type="number" min="1" required value={lossForm.quantity_eggs} onChange={e=>setLossForm({...lossForm,quantity_eggs:e.target.value})}/></label>
     <label className="eggs-field"><span>Motivo</span><select value={lossForm.loss_type} onChange={e=>setLossForm({...lossForm,loss_type:e.target.value})}><option value="BREAKAGE">Quebrados</option><option value="DIRTY">Sucios / no vendibles</option><option value="EXPIRED">Vencimiento / deterioro</option><option value="UV_REJECT">Rechazo UV</option><option value="TRANSPORT">Daño en transporte</option><option value="ADJUSTMENT">Ajuste de inventario</option><option value="OTHER">Otro</option></select></label>
    </div>
    <label className="eggs-field"><span>Notas</span><textarea value={lossForm.notes} onChange={e=>setLossForm({...lossForm,notes:e.target.value})}/></label>
    <button className="eggs-primary" disabled={saving}>Registrar pérdida</button>
   </form>

   <form className="eggs-card eggs-form" onSubmit={saveReturn}>
    <div className="eggs-section-head"><div><small>DEVOLUCIÓN DE CLIENTE</small><h2>Registrar devolución</h2><p>El producto bueno puede volver al inventario; el dañado queda como pérdida.</p></div></div>
    <label className="eggs-field"><span>Pedido</span><select required value={returnForm.order_id} onChange={e=>{const o=orders.find(x=>x.id===e.target.value);setReturnForm({...returnForm,order_id:e.target.value,grade_id:o?.egg_order_items?.[0]?.grade_id||''})}}><option value="">Seleccionar</option>{orders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.egg_customers?.name}</option>)}</select></label>
    <label className="eggs-field"><span>Clasificación vendida</span><select required value={returnForm.grade_id} onChange={e=>setReturnForm({...returnForm,grade_id:e.target.value})}>{(selectedOrder?.egg_order_items||[]).map(i=><option key={i.grade_id} value={i.grade_id}>{i.egg_grades?.name} · {num(i.total_eggs)} vendidos</option>)}</select></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Cantidad</span><input type="number" min="1" required value={returnForm.quantity_eggs} onChange={e=>setReturnForm({...returnForm,quantity_eggs:e.target.value})}/></label>
     <label className="eggs-field"><span>Destino</span><select value={returnForm.disposition} onChange={e=>setReturnForm({...returnForm,disposition:e.target.value})}><option value="RESTOCK">Regresar a inventario</option><option value="DAMAGED">Dañado / pérdida</option></select></label>
    </div>
    <label className="eggs-field"><span>Motivo</span><input value={returnForm.reason} onChange={e=>setReturnForm({...returnForm,reason:e.target.value})} placeholder="Razón de la devolución"/></label>
    <label className="eggs-field"><span>Monto a devolver / acreditar</span><input type="number" min="0" step="0.01" value={returnForm.refund_amount} onChange={e=>setReturnForm({...returnForm,refund_amount:e.target.value})}/><small>Se registra como referencia comercial; no modifica automáticamente un DTE ya emitido.</small></label>
    <button className="eggs-primary" disabled={saving}>Guardar devolución</button>
   </form>
  </section>

  <section className="eggs-two-column">
   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Pérdidas</h2></div><span className="eggs-pill">{losses.length}</span></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Tamaño</th><th>Huevos</th><th>Costo estimado</th></tr></thead><tbody>
     {losses.map(l=><tr key={l.id}><td>{date(l.created_at)}</td><td>{l.loss_type}</td><td>{l.egg_grades?.name}</td><td>{num(l.quantity_eggs)}</td><td>{money(l.estimated_cost)}</td></tr>)}
     {!losses.length&&<tr><td colSpan="5"><div className="eggs-empty">Sin pérdidas registradas.</div></td></tr>}
    </tbody></table></div>
   </section>
   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Devoluciones</h2></div><span className="eggs-pill">{returns.length}</span></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Tamaño</th><th>Huevos</th><th>Destino</th><th>Crédito</th></tr></thead><tbody>
     {returns.map(r=><tr key={r.id}><td>{date(r.created_at)}</td><td>{r.egg_orders?.order_number}<small>{r.egg_orders?.egg_customers?.name}</small></td><td>{r.egg_grades?.name}</td><td>{num(r.quantity_eggs)}</td><td>{r.disposition==='RESTOCK'?'Inventario':'Pérdida'}</td><td>{money(r.refund_amount)}</td></tr>)}
     {!returns.length&&<tr><td colSpan="6"><div className="eggs-empty">Sin devoluciones registradas.</div></td></tr>}
    </tbody></table></div>
   </section>
  </section>
 </div>
}
