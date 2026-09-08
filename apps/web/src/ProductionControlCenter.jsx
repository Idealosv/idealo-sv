import { useEffect, useMemo, useState } from 'react'

const money=(value)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const nowIso=()=>new Date().toISOString()
const addHours=(hours)=>new Date(Date.now()+hours*36e5).toISOString()
const openOrder=(row)=>!['DELIVERED','CANCELLED'].includes(String(row.status||'').toUpperCase())
const incidentOpen=(row)=>!['RESOLVED','CANCELLED','CLOSED'].includes(String(row.status||'').toUpperCase())

function openModule(target,tab){
  window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target,tab}}))
}

export default function ProductionControlCenter({company,supabase}){
  const [data,setData]=useState({orders:[],materials:[],incidents:[],costs:[],inventoryMoves:[],deliveries:[],tasks:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=async()=>{
    setLoading(true);setError('')
    const results=await Promise.all([
      supabase.from('work_orders').select('id,number,title,total,status,priority,due_at,assigned_employee_id,progress_percent,quality_status,materials_status,clients(name)').eq('company_id',company.id).order('due_at',{ascending:true}),
      supabase.from('production_material_requirements').select('id,work_order_id,material_name,required_qty,reserved_qty,status').eq('company_id',company.id),
      supabase.from('quality_incidents').select('id,work_order_id,title,severity,status,material_cost,labor_cost,outsourced_cost,other_cost').eq('company_id',company.id),
      supabase.from('work_order_costs').select('id,work_order_id,amount').eq('company_id',company.id),
      supabase.from('inventory_movements').select('id,work_order_id,movement_type,quantity,unit_cost').eq('company_id',company.id).not('work_order_id','is',null),
      supabase.from('deliveries').select('id,work_order_id,status,scheduled_at').eq('company_id',company.id),
      supabase.from('production_tasks').select('id,work_order_id,status,estimated_minutes').eq('company_id',company.id),
    ])
    const issue=results.find(row=>row.error)?.error
    if(issue)setError(issue.message)
    else setData({orders:results[0].data||[],materials:results[1].data||[],incidents:results[2].data||[],costs:results[3].data||[],inventoryMoves:results[4].data||[],deliveries:results[5].data||[],tasks:results[6].data||[]})
    setLoading(false)
  }
  useEffect(()=>{load()},[company.id])

  const analysis=useMemo(()=>{
    const now=nowIso(),soon=addHours(72)
    const active=data.orders.filter(openOrder)
    const costFor=(id)=>data.costs.filter(c=>c.work_order_id===id).reduce((s,c)=>s+Number(c.amount||0),0)+data.inventoryMoves.filter(m=>m.work_order_id===id&&m.movement_type==='CONSUMPTION').reduce((s,m)=>s+Number(m.quantity||0)*Number(m.unit_cost||0),0)
    const enriched=active.map(order=>{
      const cost=costFor(order.id),profit=Number(order.total||0)-cost
      const materialRows=data.materials.filter(m=>m.work_order_id===order.id)
      const blockedMaterials=materialRows.filter(m=>Number(m.reserved_qty||0)<Number(m.required_qty||0)&&m.status!=='READY')
      const openIncidents=data.incidents.filter(i=>i.work_order_id===order.id&&incidentOpen(i))
      const pendingTasks=data.tasks.filter(t=>t.work_order_id===order.id&&t.status!=='DONE')
      const delivery=data.deliveries.find(d=>d.work_order_id===order.id&&!['DELIVERED','CANCELLED'].includes(d.status))
      return {...order,cost,profit,blockedMaterials,openIncidents,pendingTasks,delivery}
    })
    const late=enriched.filter(o=>o.due_at&&o.due_at<now)
    const dueSoon=enriched.filter(o=>o.due_at&&o.due_at>=now&&o.due_at<=soon)
    const unassigned=enriched.filter(o=>!o.assigned_employee_id&&['DESIGN','APPROVAL','PRODUCTION','REWORK'].includes(o.status))
    const materialsBlocked=enriched.filter(o=>o.blockedMaterials.length>0&&['PRODUCTION','REWORK','READY'].includes(o.status))
    const qualityBlocked=enriched.filter(o=>o.openIncidents.length>0||o.quality_status==='REJECTED')
    const loss=enriched.filter(o=>Number(o.total||0)>0&&o.profit<0).sort((a,b)=>a.profit-b.profit)
    const readyNoDelivery=enriched.filter(o=>o.status==='READY'&&!o.delivery)
    const critical=[
      ...late.map(o=>({type:'late',level:'critical',order:o,title:`OT-${o.number} atrasada`,detail:`${o.title} · ${o.clients?.name||'Cliente'}`})),
      ...loss.map(o=>({type:'loss',level:'critical',order:o,title:`OT-${o.number} con pérdida`,detail:`Resultado ${money(o.profit)} · costo ${money(o.cost)}`})),
      ...materialsBlocked.map(o=>({type:'material',level:'important',order:o,title:`OT-${o.number} bloqueada por materiales`,detail:`${o.blockedMaterials.length} material(es) sin reserva completa`})),
      ...qualityBlocked.map(o=>({type:'quality',level:'important',order:o,title:`OT-${o.number} requiere calidad`,detail:`${o.openIncidents.length} incidencia(s) abierta(s) · ${o.quality_status||'PENDING'}`})),
      ...readyNoDelivery.map(o=>({type:'delivery',level:'important',order:o,title:`OT-${o.number} lista sin entrega programada`,detail:o.clients?.name||o.title})),
    ].slice(0,12)
    const workMinutes=enriched.reduce((sum,o)=>sum+o.pendingTasks.reduce((s,t)=>s+Number(t.estimated_minutes||0),0),0)
    return {active,enriched,late,dueSoon,unassigned,materialsBlocked,qualityBlocked,loss,readyNoDelivery,critical,workMinutes}
  },[data])

  if(loading)return <section className="production-control panel"><strong>Analizando operación de producción…</strong></section>
  return <section className="production-control">
    <div className="production-control-head"><div><p className="form-kicker">CONTROL OPERATIVO</p><h2>Prioridades de producción</h2><p>Qué debe atenderse primero antes de entrar al detalle de cada orden.</p></div><div className="production-control-actions"><button type="button" className="secondary-button" onClick={load}>Actualizar</button><button type="button" onClick={()=>openModule('planning')}>Abrir Agenda</button></div></div>
    {error&&<p className="feedback error">{error}</p>}
    <div className="production-control-kpis"><Kpi label="Órdenes activas" value={analysis.active.length}/><Kpi label="Atrasadas" value={analysis.late.length} danger={analysis.late.length>0}/><Kpi label="Vencen en 72 h" value={analysis.dueSoon.length}/><Kpi label="Sin responsable" value={analysis.unassigned.length}/><Kpi label="Bloqueadas material" value={analysis.materialsBlocked.length} danger={analysis.materialsBlocked.length>0}/><Kpi label="Calidad pendiente" value={analysis.qualityBlocked.length}/><Kpi label="Trabajos con pérdida" value={analysis.loss.length} danger={analysis.loss.length>0}/><Kpi label="Carga pendiente" value={`${Math.round(analysis.workMinutes/60)} h`}/></div>
    <div className="production-control-grid">
      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">ATENCIÓN INMEDIATA</p><h3>Bloqueos y riesgos</h3></div><span className="production-risk-count">{analysis.critical.length}</span></div>{analysis.critical.length?<div className="production-risk-list">{analysis.critical.map((item,index)=><div className={`production-risk-row ${item.level}`} key={`${item.type}-${item.order.id}-${index}`}><span/><div><strong>{item.title}</strong><small>{item.detail}</small></div></div>)}</div>:<div className="empty-state"><strong>Sin bloqueos críticos</strong><small>Las órdenes activas no presentan riesgos prioritarios con los datos actuales.</small></div>}</section>
      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">PRÓXIMAS SALIDAS</p><h3>Entregas y fechas límite</h3></div></div><div className="production-deadline-list">{analysis.enriched.filter(o=>o.due_at).sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)).slice(0,8).map(o=><div key={o.id}><time>{new Date(o.due_at).toLocaleString('es-SV',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time><div><strong>OT-{o.number} · {o.title}</strong><small>{o.clients?.name||'Cliente'} · {o.status} · {o.progress_percent||0}%</small></div><span className={o.due_at<nowIso()?'late':''}>{o.due_at<nowIso()?'ATRASADA':o.priority||'NORMAL'}</span></div>)}</div></section>
    </div>
    {analysis.loss.length>0&&<section className="panel"><div className="panel-heading"><div><p className="form-kicker">RENTABILIDAD</p><h3>Órdenes con pérdida</h3></div></div><div className="production-loss-table"><table><thead><tr><th>Orden</th><th>Cliente</th><th>Venta</th><th>Costo real</th><th>Resultado</th></tr></thead><tbody>{analysis.loss.slice(0,8).map(o=><tr key={o.id}><td>OT-{o.number}</td><td>{o.clients?.name||'Cliente'}</td><td>{money(o.total)}</td><td>{money(o.cost)}</td><td className="negative">{money(o.profit)}</td></tr>)}</tbody></table></div></section>}
  </section>
}

function Kpi({label,value,danger}){return <article className={danger?'danger':''}><span>{label}</span><strong>{value}</strong></article>}
