import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { buildPrestaditosAlerts } from './prestaditos-alerts.js'

const labels={CRITICAL:'Crítica',HIGH:'Alta',MEDIUM:'Media',LOW:'Baja'}
const typeLabels={DOCUMENTS:'Documentación',APPLICATION:'Solicitud',MATURITY:'Vencimiento',CONTRACT:'Contrato',PAYMENT:'Liquidación',RENEWAL:'Renovación'}
const viewLabels={OPEN:'Abiertas',READ:'Revisadas',DISMISSED:'Archivadas'}

function Empty({view}){return <div className="prst-empty"><strong>Sin notificaciones</strong><p>No hay notificaciones en {viewLabels[view].toLowerCase()}.</p></div>}

export default function PrestaditosAlertsPanel({company,investors,applications,investments,contracts,payments,renewals,investorMap,notificationStates=[],act,onGo}){
 const [priority,setPriority]=useState('ALL')
 const [type,setType]=useState('ALL')
 const [search,setSearch]=useState('')
 const [view,setView]=useState('OPEN')

 const alerts=useMemo(()=>buildPrestaditosAlerts({investors,applications,investments,contracts,payments,renewals,investorMap}),[investors,applications,investments,contracts,payments,renewals,investorMap])
 const stateMap=useMemo(()=>new Map(notificationStates.map(x=>[x.alert_key,x])),[notificationStates])
 const viewCounts=useMemo(()=>({
  OPEN:alerts.filter(x=>!stateMap.has(x.id)).length,
  READ:notificationStates.filter(x=>x.state==='READ'&&alerts.some(a=>a.id===x.alert_key)).length,
  DISMISSED:notificationStates.filter(x=>x.state==='DISMISSED').length,
 }),[alerts,notificationStates,stateMap])

 const rows=useMemo(()=>{
  if(view==='DISMISSED'){
   return notificationStates.filter(x=>x.state==='DISMISSED').map(x=>({
    id:x.alert_key,
    priority:x.priority||'MEDIUM',
    type:x.alert_type||'OTHER',
    title:x.alert_title||'Notificación archivada',
    detail:x.alert_detail||x.note||'',
    tab:x.target_tab||'Dashboard',
    investor_id:x.investor_id,
    investment_id:x.investment_id,
    stored:true,
    updated_at:x.updated_at,
   }))
  }

  return alerts.filter(row=>{
   const state=stateMap.get(row.id)?.state
   return view==='READ'?state==='READ':!state
  })
 },[view,alerts,notificationStates,stateMap])

 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase()
  return rows.filter(row=>(priority==='ALL'||row.priority===priority)&&(type==='ALL'||row.type===type)&&(!q||(row.title+' '+row.detail+' '+(typeLabels[row.type]||row.type)).toLowerCase().includes(q)))
 },[rows,priority,type,search])

 const count=p=>alerts.filter(x=>x.priority===p&&!stateMap.has(x.id)).length
 const persist=(row,state)=>{
  act(async()=>{
   const {error}=await supabase.rpc('inv_set_notification_state',{
    p_company_id:company.id,
    p_alert_key:row.id,
    p_state:state,
    p_alert_title:row.title||'',
    p_alert_detail:row.detail||'',
    p_alert_type:row.type||'',
    p_priority:row.priority||'',
    p_target_tab:row.tab||'',
    p_investor_id:row.investor_id||null,
    p_investment_id:row.investment_id||null,
    p_note:'',
   })
   if(error)throw error
  },state==='READ'?'Notificación marcada como revisada.':'Notificación archivada.')
 }
 const restore=row=>{
  act(async()=>{
   const {error}=await supabase.rpc('inv_clear_notification_state',{p_company_id:company.id,p_alert_key:row.id})
   if(error)throw error
  },'Notificación restaurada a pendientes.')
 }

 return <section className="prst-alerts-module">
  <section className="prst-investor-summary prst-alert-summary">
   <article><span>Críticas abiertas</span><strong>{count('CRITICAL')}</strong><small>acción inmediata</small></article>
   <article><span>Altas abiertas</span><strong>{count('HIGH')}</strong><small>requieren atención</small></article>
   <article><span>Revisadas</span><strong>{notificationStates.filter(x=>x.state==='READ'&&alerts.some(a=>a.id===x.alert_key)).length}</strong><small>siguen activas</small></article>
   <article><span>Archivadas</span><strong>{notificationStates.filter(x=>x.state==='DISMISSED').length}</strong><small>historial personal</small></article>
  </section>

  <article className="prst-card prst-notification-center-card">
   <div className="prst-card-head"><div><small>SEGUIMIENTO OPERATIVO</small><h2>Centro de notificaciones</h2><p>Priorizá lo urgente, revisá pendientes y conservá un historial sin alterar la operación financiera.</p></div></div>

   <div className="prst-notification-tabs">{Object.entries(viewLabels).map(([value,label])=><button key={value} type="button" className={view===value?'active':''} onClick={()=>setView(value)}>{label}<span>{viewCounts[value]}</span></button>)}</div>

   <div className="prst-alert-filters">
    <input className="prst-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar notificación o inversionista"/>
    <select value={priority} onChange={e=>setPriority(e.target.value)}><option value="ALL">Todas las prioridades</option><option value="CRITICAL">Críticas</option><option value="HIGH">Altas</option><option value="MEDIUM">Medias</option></select>
    <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Todos los tipos</option>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
   </div>

   {!filtered.length?<Empty view={view}/>:<div className="prst-alert-list">{filtered.map(row=><article key={row.id} className={'prst-operational-alert '+String(row.priority||'MEDIUM').toLowerCase()}>
    <div className="prst-alert-icon">{row.priority==='CRITICAL'?'!':row.priority==='HIGH'?'↑':'•'}</div>
    <div className="prst-alert-copy"><div><span>{typeLabels[row.type]||row.type}</span><b>{labels[row.priority]||row.priority}</b></div><strong>{row.title}</strong><small>{row.detail}</small>{row.stored&&row.updated_at&&<small>Archivada: {new Date(row.updated_at).toLocaleString('es-SV')}</small>}</div>
    <div className="prst-notification-actions">
     {view!=='DISMISSED'&&<button type="button" className="primary" onClick={()=>onGo?.(row.tab,row)}>Abrir</button>}
     {view==='OPEN'&&<button type="button" className="secondary" onClick={()=>persist(row,'READ')}>Marcar revisada</button>}
     {view!=='DISMISSED'&&<button type="button" className="archive" onClick={()=>persist(row,'DISMISSED')}>Archivar</button>}
     {view==='DISMISSED'&&<button type="button" className="restore" onClick={()=>restore(row)}>Restaurar</button>}
    </div>
   </article>)}</div>}
  </article>

  <article className="prst-card prst-alert-scope prst-notification-rules-card">
   <div className="prst-card-head"><div><small>CRITERIOS ACTUALES</small><h2>Qué está vigilando el sistema</h2></div></div>
   <div className="prst-alert-rules">
    <span>Inversiones vencidas y próximas a vencer en 30 días.</span>
    <span>Contratos no preparados o pendientes de firma.</span>
    <span>Foto/DUI incompletos en inversionistas activos.</span>
    <span>Fondos recibidos sin formalizar.</span>
    <span>Capital pendiente de liquidar al vencimiento.</span>
    <span>Decisiones de renovación pendientes de ejecutar.</span>
   </div>
   <div className="prst-note"><strong>Rendimientos:</strong> mientras no esté definida la regla de prorrateo para plazos diferentes de 12 meses, el sistema solo marca revisión de liquidación cuando existe una ganancia proyectada registrada; no inventa fechas ni cuotas de pago.</div>
  </article>
 </section>
}
