import { useMemo, useState } from 'react'
import { buildPrestaditosAlerts } from './prestaditos-alerts.js'

const labels={CRITICAL:'Crítica',HIGH:'Alta',MEDIUM:'Media',LOW:'Baja'}
const typeLabels={DOCUMENTS:'Documentación',APPLICATION:'Solicitud',MATURITY:'Vencimiento',CONTRACT:'Contrato',PAYMENT:'Liquidación',RENEWAL:'Renovación'}

function Empty(){return <div className="prst-empty"><strong>Sin alertas operativas</strong><p>No hay situaciones pendientes con los criterios actuales.</p></div>}

export default function PrestaditosAlertsPanel({investors,applications,investments,contracts,payments,renewals,investorMap,onGo}){
 const [priority,setPriority]=useState('ALL')
 const [type,setType]=useState('ALL')
 const [search,setSearch]=useState('')

 const alerts=useMemo(()=>buildPrestaditosAlerts({investors,applications,investments,contracts,payments,renewals,investorMap}),[investors,applications,investments,contracts,payments,renewals,investorMap])
 const filtered=useMemo(()=>{
  const q=search.trim().toLowerCase()
  return alerts.filter(row=>(priority==='ALL'||row.priority===priority)&&(type==='ALL'||row.type===type)&&(!q||(row.title+' '+row.detail+' '+(typeLabels[row.type]||row.type)).toLowerCase().includes(q)))
 },[alerts,priority,type,search])

 const count=p=>alerts.filter(x=>x.priority===p).length

 return <section className="prst-alerts-module">
  <section className="prst-investor-summary prst-alert-summary">
   <article><span>Críticas</span><strong>{count('CRITICAL')}</strong><small>acción inmediata</small></article>
   <article><span>Altas</span><strong>{count('HIGH')}</strong><small>requieren atención</small></article>
   <article><span>Medias</span><strong>{count('MEDIUM')}</strong><small>seguimiento preventivo</small></article>
   <article><span>Total abiertas</span><strong>{alerts.length}</strong><small>calculadas en tiempo real</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>SEGUIMIENTO OPERATIVO</small><h2>Alertas de Prestadito$</h2><p>Se generan automáticamente a partir del estado actual de expedientes, contratos, pagos, vencimientos y renovaciones.</p></div></div>
   <div className="prst-alert-filters">
    <input className="prst-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar alerta o inversionista"/>
    <select value={priority} onChange={e=>setPriority(e.target.value)}><option value="ALL">Todas las prioridades</option><option value="CRITICAL">Críticas</option><option value="HIGH">Altas</option><option value="MEDIUM">Medias</option></select>
    <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Todos los tipos</option>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
   </div>

   {!filtered.length?<Empty/>:<div className="prst-alert-list">{filtered.map(row=><article key={row.id} className={'prst-operational-alert '+row.priority.toLowerCase()}>
    <div className="prst-alert-icon">{row.priority==='CRITICAL'?'!':row.priority==='HIGH'?'↑':'•'}</div>
    <div className="prst-alert-copy"><div><span>{typeLabels[row.type]||row.type}</span><b>{labels[row.priority]||row.priority}</b></div><strong>{row.title}</strong><small>{row.detail}</small></div>
    <button type="button" onClick={()=>onGo?.(row.tab,row)}>Ir a {row.tab}</button>
   </article>)}</div>}
  </article>

  <article className="prst-card prst-alert-scope">
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
