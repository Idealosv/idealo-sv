import { useMemo, useState } from 'react'
import { agendaWindow, buildPrestaditosAgenda } from './prestaditos-agenda.js'

const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString('es-SV',{weekday:'short',day:'2-digit',month:'short'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const labels={MATURITY:'Vencimiento',CONTRACT:'Contrato',REVIEW:'Revisión',SIGNATURE:'Firma',FORMALIZATION:'Formalización',DOCUMENTS:'Documentación',RENEWAL:'Renovación'}
const priorityLabel={CRITICAL:'Crítica',HIGH:'Alta',MEDIUM:'Media'}

export default function PrestaditosAgendaPanel({investors,applications,investments,contracts,renewals,investorMap,onGo}){
 const [view,setView]=useState('WEEK')
 const [type,setType]=useState('ALL')
 const [search,setSearch]=useState('')

 const events=useMemo(()=>buildPrestaditosAgenda({investors,applications,investments,contracts,renewals,investorMap}),[investors,applications,investments,contracts,renewals,investorMap])
 const windowRows=useMemo(()=>agendaWindow(events,view),[events,view])
 const rows=useMemo(()=>{
  const q=search.trim().toLowerCase()
  return windowRows.filter(row=>(type==='ALL'||row.type===type)&&(!q||(row.title+' '+row.detail+' '+labels[row.type]).toLowerCase().includes(q)))
 },[windowRows,type,search])

 const current=today()
 const overdue=events.filter(x=>x.date<current&&!x.floating).length
 const todayCount=events.filter(x=>x.date===current).length
 const weekCount=agendaWindow(events,'WEEK').length

 return <section className="prst-agenda-module">
  <section className="prst-investor-summary prst-agenda-summary">
   <article><span>Vencidos</span><strong>{overdue}</strong><small>fechas anteriores a hoy</small></article>
   <article><span>Para hoy</span><strong>{todayCount}</strong><small>incluye pendientes sin fecha límite</small></article>
   <article><span>Próximos 7 días</span><strong>{weekCount}</strong><small>agenda operativa</small></article>
   <article><span>Total activos</span><strong>{events.length}</strong><small>eventos derivados del ERP</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>AGENDA OPERATIVA</small><h2>Seguimiento diario y semanal</h2><p>Vencimientos, firmas, revisiones, renovaciones y documentación pendiente sin inventar fechas de pago de rendimientos.</p></div></div>

   <div className="prst-agenda-view-tabs">
    {[['TODAY','Hoy / vencidos'],['WEEK','7 días'],['MONTH','30 días']].map(([value,label])=><button key={value} type="button" className={view===value?'active':''} onClick={()=>setView(value)}>{label}</button>)}
   </div>

   <div className="prst-agenda-filters">
    <input className="prst-search" placeholder="Buscar evento o inversionista" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Todos los tipos</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <span>{rows.length} evento{rows.length===1?'':'s'}</span>
   </div>

   {!rows.length?<div className="prst-empty"><strong>Agenda despejada</strong><p>No hay eventos para los filtros y período seleccionados.</p></div>:<div className="prst-agenda-list">{rows.map(row=>{
    const isOverdue=row.date<current&&!row.floating
    return <article key={row.id} className={isOverdue?'overdue':row.priority.toLowerCase()}>
     <div className="prst-agenda-date"><b>{row.floating?'Hoy':date(row.date)}</b><small>{row.floating?'Seguimiento sin fecha límite':isOverdue?'Vencido':row.date===current?'Hoy':'Programado'}</small></div>
     <div className="prst-agenda-copy"><div><span>{labels[row.type]||row.type}</span><b>{priorityLabel[row.priority]||row.priority}</b></div><strong>{row.title}</strong><small>{row.detail}</small></div>
     <button type="button" onClick={()=>onGo?.(row.tab,row)}>Abrir</button>
    </article>
   })}</div>}
  </article>

  <article className="prst-card prst-agenda-note">
   <div className="prst-card-head"><div><small>ALCANCE</small><h2>Fechas que sí utiliza la agenda</h2></div></div>
   <div className="prst-alert-rules">
    <span>Fecha de vencimiento de cada inversión.</span>
    <span>Fecha solicitada de inicio cuando existe.</span>
    <span>Fecha de vencimiento asociada a una decisión de renovación.</span>
    <span>Pendientes sin fecha límite se muestran como seguimiento de hoy.</span>
   </div>
   <div className="prst-note"><strong>No se agregan cuotas de rendimiento:</strong> todavía no conocemos la periodicidad real de pago, así que la agenda no crea fechas mensuales, trimestrales ni de otro tipo.</div>
  </article>
 </section>
}
