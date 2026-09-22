import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './prestaditos-investors.css'
import './prestaditos-theme.css'
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
import PrestaditosInvestorStatementPanel from './PrestaditosInvestorStatementPanel.jsx'
import PrestaditosMonthlyCloseoutPanel from './PrestaditosMonthlyCloseoutPanel.jsx'
import PrestaditosTechnicalAuditPanel from './PrestaditosTechnicalAuditPanel.jsx'
import PrestaditosInvestor360Panel from './PrestaditosInvestor360Panel.jsx'
import PrestaditosAgendaPanel from './PrestaditosAgendaPanel.jsx'
import PrestaditosGlobalSearch from './PrestaditosGlobalSearch.jsx'
import PrestaditosEndToEndDemoPanel from './PrestaditosEndToEndDemoPanel.jsx'
import PrestaditosProductionReadinessPanel from './PrestaditosProductionReadinessPanel.jsx'
import PrestaditosExportPanel from './PrestaditosExportPanel.jsx'
import PrestaditosHelpPanel from './PrestaditosHelpPanel.jsx'
import PrestaditosDashboardPanel from './PrestaditosDashboardPanel.jsx'

const API=(import.meta.env.VITE_API_URL||'http://localhost:4000').replace(/\/$/,'')
const TABS=[
 ['Dashboard','Resumen de inversiones'],
 ['Notificaciones','Seguimiento operativo'],
 ['Agenda','Vencimientos y tareas'],
 ['Inversionistas','Expedientes y documentos'],
 ['Perfil 360','Vista integral del inversionista'],
 ['Solicitudes','Solicitudes de inversión'],
 ['Simulador','Tasas anuales por monto'],
 ['Inversiones','Capital y vigencias'],
 ['Contratos','PDF y firma'],
 ['Beneficiarios','Beneficiarios registrados'],
 ['Estado de cuenta','Resumen por inversionista'],
 ['Rendimientos','Pagos al inversionista'],
 ['Vencimientos','Próximas fechas'],
 ['Renovaciones','Continuidad de inversiones'],
 ['Tesorería','Entradas y salidas'],
 ['Documentos','DUI, rostro y contratos'],
 ['Reportes','Indicadores gerenciales'],
 ['Cierre mensual','Snapshot del período'],
 ['Auditoría','Trazabilidad'],
 ['Auditoría técnica','Integridad y seguridad'],
 ['Exportaciones','Respaldo y CSV'],
 ['Ayuda','Manual y capacitación'],
 ['Prueba integral','3 casos ficticios'],
 ['Preparación','Cierre para producción'],
 ['Configuración','Reglas del vertical'],
]

const MAIN_TABS=['Dashboard','Inversionistas','Solicitudes','Inversiones','Rendimientos','Vencimientos','Tesorería','Reportes']
const MODULE_ACTIONS={
 Inversionistas:['Perfil 360','Beneficiarios','Estado de cuenta','Documentos'],
 Solicitudes:['Simulador'],
 Inversiones:['Contratos','Renovaciones'],
 Rendimientos:['Estado de cuenta'],
 Vencimientos:['Renovaciones','Agenda'],
 Tesorería:['Cierre mensual','Exportaciones'],
 Reportes:['Cierre mensual','Auditoría','Auditoría técnica','Exportaciones'],
}
const SYSTEM_TABS=['Notificaciones','Agenda','Configuración','Ayuda','Prueba integral','Preparación']
const TAB_DESCRIPTIONS=Object.fromEntries(TABS)

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
 const [notificationStates,setNotificationStates]=useState([])
 const [closeouts,setCloseouts]=useState([])
 const [query,setQuery]=useState('')
 const [applicationToFormalize,setApplicationToFormalize]=useState('')
 const [renewalToManage,setRenewalToManage]=useState('')
 const [focusInvestorId,setFocusInvestorId]=useState('')
 const [focusInvestmentId,setFocusInvestmentId]=useState('')
 const [mobileNavOpen,setMobileNavOpen]=useState(false)

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
   const [i,a,n,b,p,l,rn,d,s,c,ns,co]=await Promise.all([
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
    supabase.from('inv_notification_states').select('*').eq('company_id',company.id).order('updated_at',{ascending:false}),
    supabase.from('inv_monthly_closeouts').select('*').eq('company_id',company.id).order('period_month',{ascending:false}).order('version',{ascending:false}),
   ])
   for(const r of [i,a,n,b,p,l,rn,d,s,c,ns,co])if(r.error)throw r.error
   setInvestors(i.data||[]);setApplications(a.data||[]);setInvestments(n.data||[]);setBeneficiaries(b.data||[]);setPayments(p.data||[]);setAudit(l.data||[]);setRenewals(rn.data||[]);setDocuments(d.data||[]);setSettings(s.data||null);setContracts(c.data||[]);setNotificationStates(ns.data||[]);setCloseouts(co.data||[])
  }catch(err){setError(safeText(err))}
  finally{setLoading(false)}
 },[enabled,company?.id])

 useEffect(()=>{load()},[load])

 const investorMap=useMemo(()=>new Map(investors.map(x=>[x.id,x])),[investors])
 const activeInvestments=investments.filter(x=>['ACTIVE','MATURING'].includes(x.status))
 const totalPrincipal=activeInvestments.reduce((s,x)=>s+Number(x.principal||0),0)
 const projectedGain=activeInvestments.reduce((s,x)=>s+Number(x.projected_gain||0),0)
 const yieldPaid=payments.filter(x=>x.payment_type==='YIELD'&&(x.status||'POSTED')==='POSTED').reduce((s,x)=>s+Number(x.amount||0),0)
 const pendingApps=applications.filter(x=>['PENDING','REVIEW','APPROVED','SIGNATURE','FUNDS_RECEIVED'].includes(x.status)).length
 const nextMaturity=[...activeInvestments].filter(x=>x.maturity_date).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date)))[0]
 const operationalAlerts=useMemo(()=>buildPrestaditosAlerts({investors,applications,investments,contracts,payments,renewals,investorMap}),[investors,applications,investments,contracts,payments,renewals,investorMap])
 const notificationStateMap=useMemo(()=>new Map(notificationStates.map(x=>[x.alert_key,x])),[notificationStates])
 const openAlerts=useMemo(()=>operationalAlerts.filter(x=>!notificationStateMap.has(x.id)),[operationalAlerts,notificationStateMap])

 if(!enabled)return null

 const selectTab=name=>{setTab(name);setMobileNavOpen(false)}
 const goFromAlert=(target,row={})=>{
  if(row?.investor_id)setFocusInvestorId(row.investor_id)
  if(row?.investment_id)setFocusInvestmentId(row.investment_id)
  if(target==='Renovaciones'&&row?.investment_id)setRenewalToManage(row.investment_id)
  if(target==='Inversionistas'&&row?.investor_id){const investor=investorMap.get(row.investor_id);setQuery(investor?fullName(investor):'')}
  selectTab(target)
 }
 const moduleParent=Object.entries(MODULE_ACTIONS).find(([,items])=>items.includes(tab))?.[0]||tab
 const moduleActions=MODULE_ACTIONS[moduleParent]||[]
 const navButton=name=><button key={name} type="button" className={moduleParent===name?'active':''} onClick={()=>selectTab(name)}><strong>{name}</strong><small>{TAB_DESCRIPTIONS[name]}</small></button>

 const chooseGlobalResult=row=>{
  if(row?.investor_id)setFocusInvestorId(row.investor_id)
  if(row?.investment_id)setFocusInvestmentId(row.investment_id)
  selectTab(row?.tab||'Perfil 360')
 }

 const act=async(fn,success)=>{
  setSaving(true);setError('');setNotice('')
  try{await fn();setNotice(success);await load()}
  catch(err){setError(safeText(err))}
  finally{setSaving(false)}
 }

 return <div className="prst-app">
  {mobileNavOpen&&<button type="button" className="prst-mobile-overlay" aria-label="Cerrar menú" onClick={()=>setMobileNavOpen(false)}/>}
  <aside className={`prst-sidebar ${mobileNavOpen?'mobile-open':''}`}>
   <div className="prst-brand">
    <span className="prst-mark">$</span>
    <div><strong>PRESTADITO$</strong><small>El Préstamo a tu Crecimiento</small></div>
   </div>
   <div className="prst-company"><span>EMPRESA</span><strong>{company?.name||'Prestadito$ El Salvador'}</strong><small>{role||'Usuario autorizado'}</small></div>
   <nav>
    <div className="prst-nav-primary">{MAIN_TABS.map(navButton)}</div>
   </nav>
   <a className="prst-back" href="/master">← Administrador IDEALO SV</a>
  </aside>

  <main className="prst-main">
   <header className="prst-topbar">
    <button type="button" className="prst-mobile-menu" onClick={()=>setMobileNavOpen(true)} aria-label="Abrir menú">☰</button>
    <div className="prst-top-title"><span>IDEALO SV · FINANCIERA / INVERSIONISTAS</span><h1>{tab}</h1><p>ERP exclusivo para inversionistas e inversiones.</p></div>
    <PrestaditosGlobalSearch investors={investors} applications={applications} investments={investments} contracts={contracts} payments={payments} documents={documents} beneficiaries={beneficiaries} onChoose={chooseGlobalResult}/>
    <div className="prst-top-actions">
     <details className="prst-system-menu">
      <summary>Sistema</summary>
      <div>{SYSTEM_TABS.map(name=><button key={name} type="button" onClick={()=>selectTab(name)}>{name}</button>)}</div>
     </details>
     <button type="button" onClick={load} disabled={loading}>{loading?'Actualizando…':'Actualizar'}</button>
    </div>
   </header>
   {moduleActions.length>0&&<div className="prst-context-bar"><span>{moduleParent}</span><div>{moduleActions.map(name=><button key={name} type="button" className={tab===name?'active':''} onClick={()=>selectTab(name)}>{name}</button>)}</div></div>}
   {error&&<div className="prst-alert error">{error}</div>}
   {notice&&<div className="prst-alert success">{notice}</div>}

   <section className="prst-content">
    {tab==='Dashboard'&&<PrestaditosDashboardPanel investors={investors} applications={applications} investments={investments} payments={payments} contracts={contracts} renewals={renewals} documents={documents} investorMap={investorMap} alerts={openAlerts} onGo={selectTab} onAlert={goFromAlert}/>} 
    {tab==='Notificaciones'&&<PrestaditosAlertsPanel company={company} investors={investors} applications={applications} investments={investments} contracts={contracts} payments={payments} renewals={renewals} investorMap={investorMap} notificationStates={notificationStates} act={act} onGo={goFromAlert}/>} 
    {tab==='Agenda'&&<PrestaditosAgendaPanel investors={investors} applications={applications} investments={investments} contracts={contracts} renewals={renewals} investorMap={investorMap} onGo={goFromAlert}/>} 
    {tab==='Inversionistas'&&<PrestaditosInvestorsPanel company={company} role={role} investors={investors} investments={investments} beneficiaries={beneficiaries} payments={payments} query={query} setQuery={setQuery} saving={saving} act={act} onNavigate={goFromAlert}/>}
    {tab==='Perfil 360'&&<PrestaditosInvestor360Panel investors={investors} applications={applications} investments={investments} contracts={contracts} beneficiaries={beneficiaries} payments={payments} documents={documents} renewals={renewals} selectedInvestorId={focusInvestorId} selectedInvestmentId={focusInvestmentId} onSelectInvestor={setFocusInvestorId} onNavigate={goFromAlert}/>} 
    {tab==='Solicitudes'&&<PrestaditosApplicationsPanel company={company} role={role} settings={settings} investors={investors} applications={applications} investments={investments} investorMap={investorMap} saving={saving} act={act} onFormalize={applicationId=>{setApplicationToFormalize(applicationId);selectTab('Inversiones')}}/>}
    {tab==='Simulador'&&<PrestaditosSimulatorPanel settings={settings}/>} 
    {tab==='Inversiones'&&<PrestaditosInvestmentsPanel company={company} role={role} settings={settings} applications={applications} investments={investments} beneficiaries={beneficiaries} payments={payments} investorMap={investorMap} saving={saving} act={act} preselectedApplicationId={applicationToFormalize} onFormalized={()=>setApplicationToFormalize('')}/>} 
    {tab==='Contratos'&&<PrestaditosContractsPanel company={company} role={role} investments={investments} contracts={contracts} investorMap={investorMap} saving={saving} act={act} preselectedInvestmentId={focusInvestmentId}/>}
    {tab==='Beneficiarios'&&<PrestaditosBeneficiariesPanel company={company} role={role} investors={investors} beneficiaries={beneficiaries} investorMap={investorMap} saving={saving} act={act}/>} 
    {tab==='Estado de cuenta'&&<PrestaditosInvestorStatementPanel company={company} investors={investors} investments={investments} payments={payments} beneficiaries={beneficiaries} contracts={contracts} selectedInvestorId={focusInvestorId}/>}
    {tab==='Rendimientos'&&<PrestaditosPaymentsPanel company={company} role={role} settings={settings} investments={investments} payments={payments} investorMap={investorMap} saving={saving} act={act} preselectedInvestmentId={focusInvestmentId}/>}
    {tab==='Vencimientos'&&<PrestaditosMaturitiesPanel investments={investments} payments={payments} investorMap={investorMap} onGoRenewals={investmentId=>{setRenewalToManage(investmentId);selectTab('Renovaciones')}}/>}
    {tab==='Renovaciones'&&<PrestaditosRenewalsPanel company={company} role={role} settings={settings} investments={investments} payments={payments} renewals={renewals} investorMap={investorMap} saving={saving} act={act} preselectedInvestmentId={renewalToManage||focusInvestmentId} onHandled={()=>setRenewalToManage('')}/>}
    {tab==='Tesorería'&&<PrestaditosTreasuryPanel investments={investments} payments={payments} investorMap={investorMap}/>}
    {tab==='Documentos'&&<PrestaditosDocumentsPanel company={company} role={role} investors={investors} applications={applications} investments={investments} documents={documents} investorMap={investorMap} saving={saving} act={act} preselectedInvestorId={focusInvestorId}/>}
    {tab==='Reportes'&&<PrestaditosReportsPanel company={company} investors={investors} applications={applications} investments={investments} payments={payments} renewals={renewals} documents={documents} investorMap={investorMap}/>} 
    {tab==='Cierre mensual'&&<PrestaditosMonthlyCloseoutPanel company={company} role={role} closeouts={closeouts} saving={saving} act={act}/>}
    {tab==='Auditoría'&&<PrestaditosAuditPanel company={company} audit={audit} investorMap={investorMap}/>} 
    {tab==='Auditoría técnica'&&<PrestaditosTechnicalAuditPanel investors={investors} applications={applications} investments={investments} beneficiaries={beneficiaries} payments={payments} renewals={renewals} documents={documents} contracts={contracts}/>}
    {tab==='Exportaciones'&&<PrestaditosExportPanel company={company} role={role} investors={investors} applications={applications} investments={investments} beneficiaries={beneficiaries} payments={payments} renewals={renewals} documents={documents} contracts={contracts} audit={audit} settings={settings} notificationStates={notificationStates} closeouts={closeouts}/>} 
    {tab==='Ayuda'&&<PrestaditosHelpPanel onGo={selectTab}/>} 
    {tab==='Prueba integral'&&<PrestaditosEndToEndDemoPanel/>} 
    {tab==='Preparación'&&<PrestaditosProductionReadinessPanel/>} 
    {tab==='Configuración'&&<PrestaditosConfigurationPanel company={company} role={role} settings={settings} saving={saving} act={act}/>}
   </section>
  </main>
 </div>
}
