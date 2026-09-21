import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './prestaditos-investors.css'
import PrestaditosInvestorsPanel from './PrestaditosInvestorsPanel.jsx'
import PrestaditosApplicationsPanel from './PrestaditosApplicationsPanel.jsx'
import PrestaditosInvestmentsPanel from './PrestaditosInvestmentsPanel.jsx'
import PrestaditosContractsPanel from './PrestaditosContractsPanel.jsx'
import PrestaditosPaymentsPanel from './PrestaditosPaymentsPanel.jsx'
import PrestaditosMaturitiesPanel from './PrestaditosMaturitiesPanel.jsx'
import PrestaditosBeneficiariesPanel from './PrestaditosBeneficiariesPanel.jsx'
import PrestaditosRenewalsPanel from './PrestaditosRenewalsPanel.jsx'
import PrestaditosTreasuryPanel from './PrestaditosTreasuryPanel.jsx'
import PrestaditosDocumentsPanel from './PrestaditosDocumentsPanel.jsx'
import PrestaditosReportsPanel from './PrestaditosReportsPanel.jsx'
import PrestaditosAuditPanel from './PrestaditosAuditPanel.jsx'
import PrestaditosConfigurationPanel from './PrestaditosConfigurationPanel.jsx'
import PrestaditosSimulatorPanel from './PrestaditosSimulatorPanel.jsx'
import PrestaditosAlertsPanel from './PrestaditosAlertsPanel.jsx'
import { buildPrestaditosAlerts } from './prestaditos-alerts.js'

const API=(import.meta.env.VITE_API_URL||'http://localhost:4000').replace(/\/$/,'')
const TABS=[
 ['Dashboard','Resumen de inversiones'],
 ['Alertas','Seguimiento operativo'],
 ['Inversionistas','Expedientes y documentos'],
 ['Solicitudes','Solicitudes de inversión'],
 ['Simulador','Tasas anuales por monto'],
 ['Inversiones','Capital y vigencias'],
 ['Contratos','PDF y firma'],
 ['Beneficiarios','Beneficiarios registrados'],
 ['Rendimientos','Pagos al inversionista'],
 ['Vencimientos','Próximas fechas'],
 ['Renovaciones','Continuidad de inversiones'],
 ['Tesorería','Entradas y salidas'],
 ['Documentos','DUI, rostro y contratos'],
 ['Reportes','Indicadores gerenciales'],
 ['Auditoría','Trazabilidad'],
 ['Configuración','Reglas del vertical'],
]

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const fullName=investor=>[investor?.first_names,investor?.last_names].filter(Boolean).join(' ')||'—'
const daysUntil=value=>value?Math.ceil((new Date(`${value}T12:00:00`).getTime()-new Date(`${today()}T12:00:00`).getTime())/86400000):null
const safeText=error=>String(error?.message||error||'Ocurrió un error inesperado.')

function Metric({label,value,hint,tone=''}){return <article className={`prst-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}
function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}
function Status({value}){const map={PENDING:'Pendiente',REVIEW:'En revisión',APPROVED:'Aprobada',REJECTED:'Rechazada',SIGNATURE:'Firma',FUNDS_RECEIVED:'Fondos recibidos',ACTIVE:'Activa',INACTIVE:'Inactivo',BLOCKED:'Bloqueado',MATURING:'Próxima a vencer',MATURED:'Vencida',RENEWED:'Renovada',CLOSED:'Cerrada',CANCELLED:'Cancelada'};return <span className={`prst-status ${String(value||'').toLowerCase()}`}>{map[value]||value||'—'}</span>}

export default function PrestaditosInvestorAppHost(){
 const enabled=window.location.pathname==='/investors'||window.location.pathname.startsWith('/investors/')
 const queryCompany=enabled?new URLSearchParams(window.location.search).get('company')||'':''
 const [company,setCompany]=useState(null)
 const [role,setRole]=useState('')
 const [tab,setTab]=useState('Dashboard')
 const [loading,setLoading]=useState(enabled)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [investors,setInvestors]=useState([])
 const [applications,setApplications]=useState([])
 const [investments,setInvestments]=useState([])
 const [beneficiaries,setBeneficiaries]=useState([])
 const [payments,setPayments]=useState([])
 const [audit,setAudit]=useState([])
 const [renewals,setRenewals]=useState([])
 const [documents,setDocuments]=useState([])
 const [settings,setSettings]=useState(null)
 const [contracts,setContracts]=useState([])
 const [query,setQuery]=useState('')
 const [applicationToFormalize,setApplicationToFormalize]=useState('')
 const [renewalToManage,setRenewalToManage]=useState('')

 const resolveContext=useCallback(async()=>{
  if(!enabled||!supabase)return
  setLoading(true);setError('')
  try{
   const {data:{session}}=await supabase.auth.getSession()
   if(!session?.access_token)throw new Error('Iniciá sesión para entrar a Prestadito$.')
   const preferred=queryCompany||window.__IDEALO_ACTIVE_COMPANY__?.id||''
   const response=await fetch(`${API}/api/investors/context${preferred?`?company_id=${encodeURIComponent(preferred)}`:''}`,{headers:{Authorization:`Bearer ${session.access_token}`}})
   const body=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(body.message||'No se pudo resolver la empresa de inversionistas.')
   setCompany(body.company);setRole(body.role||'')
   window.__IDEALO_ACTIVE_COMPANY__={...(window.__IDEALO_ACTIVE_COMPANY__||{}),...body.company}
   window.dispatchEvent(new CustomEvent('idealo-company-resolved',{detail:window.__IDEALO_ACTIVE_COMPANY__}))
   const url=new URL(window.location.href)
   if(url.searchParams.get('company')!==body.company.id){url.searchParams.set('company',body.company.id);window.history.replaceState({},'',url.pathname+url.search+url.hash)}
  }catch(err){setError(safeText(err))}
  finally{setLoading(false)}
 },[enabled,queryCompany])

 useEffect(()=>{resolveContext()},[resolveContext])

 const load=useCallback(async()=>{
  if(!enabled||!company?.id||!supabase)return
  setLoading(true);setError('')
  try{
   const [i,a,n,b,p,l,rn,d,s,c]=await Promise.all([
    supabase.from('inv_investors').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_applications').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_investments').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_beneficiaries').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_payments').select('*').eq('company_id',company.id).order('payment_date',{ascending:false}).limit(250),
    supabase.from('inv_audit_log').select('*').eq('company_id',company.id).order('created_at',{ascending:false}).limit(250),
    supabase.from('inv_renewal_decisions').select('*').eq('company_id',company.id).order('decided_at',{ascending:false}),
    supabase.from('inv_documents').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_company_settings').select('*').eq('company_id',company.id).maybeSingle(),
    supabase.from('inv_contracts').select('*').eq('company_id',company.id).order('generated_at',{ascending:false}),
   ])
   for(const r of [i,a,n,b,p,l,rn,d,s,c])if(r.error)throw r.error
   setInvestors(i.data||[]);setApplications(a.data||[]);setInvestments(n.data||[]);setBeneficiaries(b.data||[]);setPayments(p.data||[]);setAudit(l.data||[]);setRenewals(rn.data||[]);setDocuments(d.data||[]);setSettings(s.data||null);setContracts(c.data||[])
  }catch(err){setError(safeText(err))}
  finally{setLoading(false)}
 },[enabled,company?.id])

 useEffect(()=>{load()},[load])

 const investorMap=useMemo(()=>new Map(investors.map(x=>[x.id,x])),[investors])
 const activeInvestments=investments.filter(x=>['ACTIVE','MATURING'].includes(x.status))
 const totalPrincipal=activeInvestments.reduce((s,x)=>s+Number(x.principal||0),0)
 const projectedGain=activeInvestments.reduce((s,x)=>s+Number(x.projected_gain||0),0)
 const yieldPaid=payments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const pendingApps=applications.filter(x=>['PENDING','REVIEW','APPROVED','SIGNATURE','FUNDS_RECEIVED'].includes(x.status)).length
 const nextMaturity=[...activeInvestments].filter(x=>x.maturity_date).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date)))[0]
 const operationalAlerts=useMemo(()=>buildPrestaditosAlerts({investors,applications,investments,contracts,payments,renewals,investorMap}),[investors,applications,investments,contracts,payments,renewals,investorMap])

 if(!enabled)return null

 const goFromAlert=(target,row)=>{
  if(target==='Renovaciones'&&row?.investment_id)setRenewalToManage(row.investment_id)
  if(target==='Inversionistas'&&row?.investor_id){const investor=investorMap.get(row.investor_id);setQuery(investor?fullName(investor):'')}
  setTab(target)
 }

 const act=async(fn,success)=>{
  setSaving(true);setError('');setNotice('')
  try{await fn();setNotice(success);await load()}
  catch(err){setError(safeText(err))}
  finally{setSaving(false)}
 }

 return <div className="prst-app">
  <aside className="prst-sidebar">
   <div className="prst-brand">
    <span className="prst-mark">$</span>
    <div><strong>PRESTADITO$</strong><small>El Préstamo a tu Crecimiento</small></div>
   </div>
   <div className="prst-company"><span>EMPRESA</span><strong>{company?.name||'Prestadito$ El Salvador'}</strong><small>{role||'Usuario autorizado'}</small></div>
   <nav>{TABS.map(([name,desc])=><button key={name} type="button" className={tab===name?'active':''} onClick={()=>setTab(name)}><strong>{name}</strong><small>{desc}</small></button>)}</nav>
   <a className="prst-back" href="/master">← Administrador IDEALO SV</a>
  </aside>

  <main className="prst-main">
   <header className="prst-topbar">
    <div><span>IDEALO SV · FINANCIERA / INVERSIONISTAS</span><h1>{tab}</h1><p>ERP exclusivo para inversionistas e inversiones.</p></div>
    <div className="prst-top-actions"><button type="button" onClick={load} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button></div>
   </header>
   {error&&<div className="prst-alert error">{error}</div>}
   {notice&&<div className="prst-alert success">{notice}</div>}

   <section className="prst-content">
    {tab==='Dashboard'&&<Dashboard investors={investors} applications={applications} investments={investments} payments={payments} totalPrincipal={totalPrincipal} projectedGain={projectedGain} yieldPaid={yieldPaid} pendingApps={pendingApps} nextMaturity={nextMaturity} investorMap={investorMap} onGo={setTab}/>}
    {tab==='Alertas'&&<PrestaditosAlertsPanel investors={investors} applications={applications} investments={investments} contracts={contracts} payments={payments} renewals={renewals} investorMap={investorMap} onGo={goFromAlert}/>} 
    {tab==='Inversionistas'&&<PrestaditosInvestorsPanel company={company} investors={investors} investments={investments} beneficiaries={beneficiaries} payments={payments} query={query} setQuery={setQuery} saving={saving} act={act}/>}
    {tab==='Solicitudes'&&<PrestaditosApplicationsPanel company={company} role={role} settings={settings} investors={investors} applications={applications} investments={investments} investorMap={investorMap} saving={saving} act={act} onFormalize={applicationId=>{setApplicationToFormalize(applicationId);setTab('Inversiones')}}/>}
    {tab==='Simulador'&&<PrestaditosSimulatorPanel settings={settings}/>} 
    {tab==='Inversiones'&&<PrestaditosInvestmentsPanel company={company} role={role} settings={settings} applications={applications} investments={investments} beneficiaries={beneficiaries} payments={payments} investorMap={investorMap} saving={saving} act={act} preselectedApplicationId={applicationToFormalize} onFormalized={()=>setApplicationToFormalize('')}/>} 
    {tab==='Contratos'&&<PrestaditosContractsPanel company={company} role={role} investments={investments} contracts={contracts} investorMap={investorMap} saving={saving} act={act}/>}
    {tab==='Beneficiarios'&&<PrestaditosBeneficiariesPanel company={company} role={role} investors={investors} beneficiaries={beneficiaries} investorMap={investorMap} saving={saving} act={act}/>}
    {tab==='Rendimientos'&&<PrestaditosPaymentsPanel company={company} role={role} settings={settings} investments={investments} payments={payments} investorMap={investorMap} saving={saving} act={act}/>}
    {tab==='Vencimientos'&&<PrestaditosMaturitiesPanel investments={investments} payments={payments} investorMap={investorMap} onGoRenewals={investmentId=>{setRenewalToManage(investmentId);setTab('Renovaciones')}}/>}
    {tab==='Renovaciones'&&<PrestaditosRenewalsPanel company={company} role={role} settings={settings} investments={investments} payments={payments} renewals={renewals} investorMap={investorMap} saving={saving} act={act} preselectedInvestmentId={renewalToManage} onHandled={()=>setRenewalToManage('')}/>}
    {tab==='Tesorería'&&<PrestaditosTreasuryPanel investments={investments} payments={payments} investorMap={investorMap}/>}
    {tab==='Documentos'&&<PrestaditosDocumentsPanel company={company} role={role} investors={investors} applications={applications} investments={investments} documents={documents} investorMap={investorMap} saving={saving} act={act}/>}
    {tab==='Reportes'&&<PrestaditosReportsPanel company={company} investors={investors} applications={applications} investments={investments} payments={payments} renewals={renewals} documents={documents} investorMap={investorMap}/>}
    {tab==='Auditoría'&&<PrestaditosAuditPanel company={company} audit={audit} investorMap={investorMap}/>}
    {tab==='Configuración'&&<PrestaditosConfigurationPanel company={company} role={role} settings={settings} saving={saving} act={act}/>}
   </section>
  </main>
 </div>
}

function Dashboard({investors,applications,investments,payments,totalPrincipal,projectedGain,yieldPaid,pendingApps,nextMaturity,investorMap,alerts,onGo,onAlert}){
 const maturityDays=nextMaturity?daysUntil(nextMaturity.maturity_date):null
 const recent=applications.slice(0,5)
 return <>
  <section className="prst-metrics">
   <Metric label="Inversionistas" value={investors.length} hint="Expedientes registrados"/>
   <Metric label="Capital activo" value={money(totalPrincipal)} hint={`${investments.filter(x=>['ACTIVE','MATURING'].includes(x.status)).length} inversiones activas`} tone="money"/>
   <Metric label="Solicitudes pendientes" value={pendingApps} hint="Por revisar o formalizar" tone="warn"/>
   <Metric label="Ganancia proyectada" value={projectedGain?money(projectedGain):'—'} hint={projectedGain?'Según inversiones formalizadas':'Se calculará con la regla acordada'} tone="money"/>
   <Metric label="Rendimientos pagados" value={money(yieldPaid)} hint="Pagos tipo rendimiento"/>
   <Metric label="Próximo vencimiento" value={nextMaturity?date(nextMaturity.maturity_date):'—'} hint={maturityDays===null?'Sin vencimientos':maturityDays<0?'Vencido':`${maturityDays} días restantes`} tone={maturityDays!==null&&maturityDays<=30?'warn':''}/>
  </section>
  <section className="prst-grid two">
   <article className="prst-card">
    <div className="prst-card-head"><div><small>FLUJO PRINCIPAL</small><h2>Operación de inversionistas</h2></div></div>
    <div className="prst-flow">
     <button onClick={()=>onGo('Inversionistas')}><b>1</b><span><strong>Registrar inversionista</strong><small>Generales, rostro y DUI</small></span></button>
     <button onClick={()=>onGo('Solicitudes')}><b>2</b><span><strong>Recibir solicitud</strong><small>Monto, plazo y lugar de pago</small></span></button>
     <button onClick={()=>onGo('Inversiones')}><b>3</b><span><strong>Formalizar inversión</strong><small>Otorgamiento, vencimiento y contrato</small></span></button>
     <button onClick={()=>onGo('Rendimientos')}><b>4</b><span><strong>Registrar pagos</strong><small>Rendimientos y devolución de capital</small></span></button>
    </div>
   </article>
   <article className="prst-card">
    <div className="prst-card-head"><div><small>SOLICITUDES RECIENTES</small><h2>Actividad</h2></div></div>
    {!recent.length?<Empty title="Aún no hay solicitudes">Cuando un inversionista envíe una solicitud aparecerá aquí.</Empty>:<div className="prst-list">{recent.map(x=><article key={x.id}><div><b>{fullName(investorMap.get(x.investor_id))}</b><small>{money(x.requested_amount)} · {x.requested_term_months} meses</small></div><Status value={x.status}/></article>)}</div>}
   </article>
  </section>
 </>}

