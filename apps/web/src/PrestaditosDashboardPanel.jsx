import { useMemo } from 'react'
import './prestaditos-dashboard.css'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=investor=>[investor?.first_names,investor?.last_names].filter(Boolean).join(' ')||'—'
const today=()=>new Date().toISOString().slice(0,10)
const daysUntil=value=>value?Math.ceil((new Date(`${String(value).slice(0,10)}T12:00:00`).getTime()-new Date(`${today()}T12:00:00`).getTime())/86400000):null
const posted=payment=>(payment.status||'POSTED')==='POSTED'

const applicationLabel=status=>({
 PENDING:'Pendiente',
 REVIEW:'En revisión',
 APPROVED:'Aprobada',
 REJECTED:'Rechazada',
 SIGNATURE:'Firma',
 FUNDS_RECEIVED:'Fondos recibidos',
 ACTIVE:'Formalizada',
}[status]||status||'—')

const applicationTone=status=>({
 APPROVED:'success',
 FUNDS_RECEIVED:'info',
 ACTIVE:'success',
 REVIEW:'warning',
 PENDING:'pending',
 SIGNATURE:'purple',
 REJECTED:'danger',
}[status]||'neutral')

const investmentLabel=status=>({
 PENDING:'Pendiente',
 ACTIVE:'Activa',
 MATURING:'Próxima a vencer',
 MATURED:'Vencida',
 RENEWED:'Renovada',
 CLOSED:'Cerrada',
 CANCELLED:'Cancelada',
}[status]||status||'—')

const flowSteps=[
 {number:'01',title:'Registrar inversionista',subtitle:'Expediente, rostro y DUI',target:'Inversionistas',tone:'blue'},
 {number:'02',title:'Recibir solicitud',subtitle:'Monto, plazo y referencias',target:'Solicitudes',tone:'orange'},
 {number:'03',title:'Aprobar y formalizar',subtitle:'Capital, tasa y contrato',target:'Inversiones',tone:'red'},
 {number:'04',title:'Registrar pagos',subtitle:'Rendimientos y devolución',target:'Rendimientos',tone:'green'},
 {number:'05',title:'Gestionar vencimiento',subtitle:'Renovar o retirar',target:'Renovaciones',tone:'purple'},
]

function Kpi({tone,icon,label,value,hint,onClick}){
 const content=<><span className="prst-dash-kpi-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></>
 return onClick?<button type="button" className={`prst-dash-kpi ${tone}`} onClick={onClick}>{content}</button>:<article className={`prst-dash-kpi ${tone}`}>{content}</article>
}

function Empty({children}){return <div className="prst-dash-empty">{children}</div>}

function MiniBar({label,value,max,tone,hint}){
 const width=max>0?Math.max(value>0?5:0,Math.min(100,(Number(value||0)/max)*100)):0
 return <div className="prst-dash-bar">
  <div><span>{label}</span><b>{money(value)}</b></div>
  <div className="prst-dash-bar-track"><i className={tone} style={{width:`${width}%`}}/></div>
  <small>{hint}</small>
 </div>
}

export default function PrestaditosDashboardPanel({
 investors=[],
 applications=[],
 investments=[],
 payments=[],
 contracts=[],
 renewals=[],
 documents=[],
 investorMap=new Map(),
 alerts=[],
 onGo,
 onAlert,
}){
 const activeInvestments=useMemo(()=>investments.filter(x=>['ACTIVE','MATURING'].includes(x.status)),[investments])
 const postedPayments=useMemo(()=>payments.filter(posted),[payments])

 const activeCapital=activeInvestments.reduce((sum,row)=>sum+Number(row.principal||0),0)
 const annualReference=activeInvestments.reduce((sum,row)=>sum+(Number(row.principal||0)*Number(row.agreed_return_rate||0)/100),0)
 const yieldPaid=postedPayments.filter(x=>x.payment_type==='YIELD').reduce((sum,row)=>sum+Number(row.amount||0),0)
 const capitalReturned=postedPayments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((sum,row)=>sum+Number(row.amount||0),0)
 const pendingApps=applications.filter(x=>['PENDING','REVIEW','APPROVED','SIGNATURE','FUNDS_RECEIVED'].includes(x.status)).length
 const nextMaturity=[...activeInvestments].filter(x=>x.maturity_date).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date)))[0]||null
 const maturityDays=nextMaturity?daysUntil(nextMaturity.maturity_date):null

 const recentApplications=[...applications].sort((a,b)=>String(b.created_at||b.requested_at||'').localeCompare(String(a.created_at||a.requested_at||''))).slice(0,5)
 const upcomingMaturities=[...activeInvestments].filter(x=>x.maturity_date).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date))).slice(0,5)

 const rates=[10,12,15].map(rate=>{
  const rows=activeInvestments.filter(x=>Number(x.agreed_return_rate)===rate)
  return {rate,count:rows.length,capital:rows.reduce((sum,row)=>sum+Number(row.principal||0),0)}
 })
 const maxRate=Math.max(1,...rates.map(x=>x.capital))

 const statusRows=[
  {key:'ACTIVE',label:'Activas',tone:'green'},
  {key:'MATURING',label:'Por vencer',tone:'orange'},
  {key:'MATURED',label:'Vencidas',tone:'red'},
  {key:'RENEWED',label:'Renovadas',tone:'purple'},
  {key:'CLOSED',label:'Cerradas',tone:'blue'},
 ].map(row=>({...row,count:investments.filter(x=>x.status===row.key).length}))
 const maxStatus=Math.max(1,...statusRows.map(x=>x.count))

 const pendingRenewals=renewals.filter(x=>x.status==='RECORDED').length
 const pendingContracts=contracts.filter(x=>x.status==='GENERATED').length
 const activeDocuments=documents.filter(x=>x.status==='ACTIVE').length
 const criticalAlerts=alerts.filter(x=>x.priority==='CRITICAL').length
 const highAlerts=alerts.filter(x=>x.priority==='HIGH').length

 return <section className="prst-dashboard-premium">
  <section className="prst-dash-hero">
   <div>
    <span>RESUMEN EJECUTIVO</span>
    <h2>Control financiero de inversionistas</h2>
    <p>Capital, solicitudes, pagos, vencimientos y alertas importantes en una sola pantalla.</p>
   </div>
   <div className="prst-dash-hero-actions">
    <button type="button" onClick={()=>onGo?.('Simulador')}>Simular inversión</button>
    <button type="button" className="primary" onClick={()=>onGo?.('Inversionistas')}>Nuevo expediente</button>
   </div>
  </section>

  <section className="prst-dash-kpis">
   <Kpi tone="blue" icon="INV" label="Inversionistas" value={investors.length} hint="expedientes registrados" onClick={()=>onGo?.('Inversionistas')}/>
   <Kpi tone="red" icon="$" label="Capital activo" value={money(activeCapital)} hint={`${activeInvestments.length} inversiones vigentes`} onClick={()=>onGo?.('Inversiones')}/>
   <Kpi tone="orange" icon="SOL" label="Solicitudes pendientes" value={pendingApps} hint="por revisar o completar" onClick={()=>onGo?.('Solicitudes')}/>
   <Kpi tone="indigo" icon="%" label="Referencia anual" value={money(annualReference)} hint="capital × tasa anual"/>
   <Kpi tone="green" icon="PAG" label="Rendimientos pagados" value={money(yieldPaid)} hint="solo movimientos vigentes" onClick={()=>onGo?.('Rendimientos')}/>
   <Kpi tone="purple" icon="CAL" label="Próximo vencimiento" value={nextMaturity?date(nextMaturity.maturity_date):'—'} hint={maturityDays===null?'sin vencimientos':maturityDays<0?`${Math.abs(maturityDays)} días vencida`:`${maturityDays} días restantes`} onClick={()=>onGo?.('Vencimientos')}/>
  </section>

  <section className="prst-dash-grid primary-grid">
   <article className="prst-dash-panel prst-dash-alert-panel">
    <header><div><span>ALERTAS OPERATIVAS</span><h3>Atención requerida</h3><p>{criticalAlerts?criticalAlerts+' crítica'+(criticalAlerts===1?'':'s'):'Sin alertas críticas'} · {highAlerts} alta{highAlerts===1?'':'s'}</p></div><button type="button" onClick={()=>onGo?.('Notificaciones')}>Ver todas</button></header>
    {!alerts.length?<Empty>No hay alertas abiertas. La operación está al día.</Empty>:<div className="prst-dash-alert-list">{alerts.slice(0,5).map(row=><button key={row.id} type="button" className={String(row.priority||'MEDIUM').toLowerCase()} onClick={()=>onAlert?.(row.tab,row)}>
     <span className="prst-dash-alert-dot"/>
     <div><strong>{row.title}</strong><small>{row.detail}</small></div>
     <b>{row.priority==='CRITICAL'?'Crítica':row.priority==='HIGH'?'Alta':'Media'}</b>
    </button>)}</div>}
   </article>

   <article className="prst-dash-panel">
    <header><div><span>OPERACIÓN DE INVERSIONISTAS</span><h3>Flujo principal</h3><p>Accesos rápidos a los cinco pasos principales.</p></div></header>
    <div className="prst-dash-flow">{flowSteps.map(step=><button key={step.number} type="button" className={step.tone} onClick={()=>onGo?.(step.target)}>
     <span>{step.number}</span><div><strong>{step.title}</strong><small>{step.subtitle}</small></div><b>→</b>
    </button>)}</div>
   </article>
  </section>

  <section className="prst-dash-grid secondary-grid">
   <article className="prst-dash-panel">
    <header><div><span>ACTIVIDAD</span><h3>Solicitudes recientes</h3><p>Últimos movimientos de entrada al proceso.</p></div><button type="button" onClick={()=>onGo?.('Solicitudes')}>Abrir módulo</button></header>
    {!recentApplications.length?<Empty>Aún no hay solicitudes registradas.</Empty>:<div className="prst-dash-list">{recentApplications.map(row=>{
     const investor=investorMap.get(row.investor_id)
     return <button key={row.id} type="button" onClick={()=>onGo?.('Solicitudes')}>
      <div><strong>{fullName(investor)}</strong><small>{money(row.requested_amount)} · {row.requested_term_months||'—'} meses</small></div>
      <span className={`prst-dash-pill ${applicationTone(row.status)}`}>{applicationLabel(row.status)}</span>
     </button>
    })}</div>}
   </article>

   <article className="prst-dash-panel">
    <header><div><span>CALENDARIO</span><h3>Próximos vencimientos</h3><p>Fechas que requieren seguimiento preventivo.</p></div><button type="button" onClick={()=>onGo?.('Vencimientos')}>Ver calendario</button></header>
    {!upcomingMaturities.length?<Empty>No hay vencimientos activos programados.</Empty>:<div className="prst-dash-list maturity-list">{upcomingMaturities.map(row=>{
     const investor=investorMap.get(row.investor_id)
     const days=daysUntil(row.maturity_date)
     return <button key={row.id} type="button" onClick={()=>onAlert?.('Vencimientos',{investment_id:row.id,investor_id:row.investor_id})}>
      <div><strong>{fullName(investor)}</strong><small>{row.investment_code} · {money(row.principal)}</small></div>
      <span className={`prst-dash-days ${days!==null&&days<=30?'urgent':''}`}><b>{date(row.maturity_date)}</b><small>{days===null?'—':days<0?`${Math.abs(days)} días vencida`:`${days} días`}</small></span>
     </button>
    })}</div>}
   </article>
  </section>

  <section className="prst-dash-grid analytics-grid">
   <article className="prst-dash-panel">
    <header><div><span>ANÁLISIS POR TASA</span><h3>Capital vigente por tasa anual</h3><p>Distribución actual entre 10%, 12% y 15% anual.</p></div></header>
    <div className="prst-dash-bars">{rates.map((row,index)=><MiniBar key={row.rate} label={row.rate+'% anual'} value={row.capital} max={maxRate} tone={['blue','orange','red'][index]} hint={row.count+' inversión'+(row.count===1?'':'es')}/>)}</div>
   </article>

   <article className="prst-dash-panel">
    <header><div><span>ESTADO GENERAL</span><h3>Situación de inversiones</h3><p>Conteo por estado operativo.</p></div></header>
    <div className="prst-dash-status-grid">{statusRows.map(row=><div key={row.key}><div><span className={row.tone}/><b>{row.label}</b><strong>{row.count}</strong></div><div className="track"><i className={row.tone} style={{width:`${row.count?Math.max(8,(row.count/maxStatus)*100):0}%`}}/></div></div>)}</div>
   </article>
  </section>

  <article className="prst-dash-panel prst-dash-financial">
   <header><div><span>RESUMEN FINANCIERO</span><h3>Vista general del vertical</h3><p>Indicadores operativos con información registrada en el ERP.</p></div></header>
   <div className="prst-dash-summary">
    <div><span>Capital vigente</span><strong>{money(activeCapital)}</strong><small>inversiones activas y por vencer</small></div>
    <div><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>excluye pagos revertidos</small></div>
    <div><span>Capital devuelto</span><strong>{money(capitalReturned)}</strong><small>devoluciones registradas</small></div>
    <div><span>Renovaciones pendientes</span><strong>{pendingRenewals}</strong><small>decisiones registradas</small></div>
    <div><span>Contratos por firmar</span><strong>{pendingContracts}</strong><small>contratos preparados</small></div>
    <div><span>Documentos activos</span><strong>{activeDocuments}</strong><small>expediente privado</small></div>
   </div>
  </article>

  <div className="prst-dash-footnote"><strong>Referencia anual:</strong> usa las tasas anuales registradas en cada inversión. Para plazos distintos de 12 meses, el Dashboard no inventa prorrateos ni capitalización.</div>
 </section>
}
