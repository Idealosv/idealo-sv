import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './prestaditos-investors.css'
import PrestaditosInvestorsPanel from './PrestaditosInvestorsPanel.jsx'
import PrestaditosApplicationsPanel from './PrestaditosApplicationsPanel.jsx'
import PrestaditosInvestmentsPanel from './PrestaditosInvestmentsPanel.jsx'
import PrestaditosPaymentsPanel from './PrestaditosPaymentsPanel.jsx'

const API=(import.meta.env.VITE_API_URL||'http://localhost:4000').replace(/\/$/,'')
const TABS=[
 ['Dashboard','Resumen de inversiones'],
 ['Inversionistas','Expedientes y documentos'],
 ['Solicitudes','Solicitudes de inversión'],
 ['Inversiones','Contratos y vigencias'],
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
 const [query,setQuery]=useState('')
 const [applicationToFormalize,setApplicationToFormalize]=useState('')

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
   const [i,a,n,b,p,l]=await Promise.all([
    supabase.from('inv_investors').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_applications').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_investments').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_beneficiaries').select('*').eq('company_id',company.id).order('created_at',{ascending:false}),
    supabase.from('inv_payments').select('*').eq('company_id',company.id).order('payment_date',{ascending:false}).limit(250),
    supabase.from('inv_audit_log').select('*').eq('company_id',company.id).order('created_at',{ascending:false}).limit(250),
   ])
   for(const r of [i,a,n,b,p,l])if(r.error)throw r.error
   setInvestors(i.data||[]);setApplications(a.data||[]);setInvestments(n.data||[]);setBeneficiaries(b.data||[]);setPayments(p.data||[]);setAudit(l.data||[])
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

 if(!enabled)return null

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
    {tab==='Inversionistas'&&<PrestaditosInvestorsPanel company={company} investors={investors} investments={investments} beneficiaries={beneficiaries} payments={payments} query={query} setQuery={setQuery} saving={saving} act={act}/>}
    {tab==='Solicitudes'&&<PrestaditosApplicationsPanel company={company} role={role} investors={investors} applications={applications} investments={investments} investorMap={investorMap} saving={saving} act={act} onFormalize={applicationId=>{setApplicationToFormalize(applicationId);setTab('Inversiones')}}/>}
    {tab==='Inversiones'&&<PrestaditosInvestmentsPanel company={company} role={role} applications={applications} investments={investments} beneficiaries={beneficiaries} payments={payments} investorMap={investorMap} saving={saving} act={act} preselectedApplicationId={applicationToFormalize} onFormalized={()=>setApplicationToFormalize('')}/>}
    {tab==='Beneficiarios'&&<BeneficiariesPanel company={company} investors={investors} beneficiaries={beneficiaries} investorMap={investorMap} saving={saving} act={act}/>}
    {tab==='Rendimientos'&&<PrestaditosPaymentsPanel company={company} role={role} investments={investments} payments={payments} investorMap={investorMap} saving={saving} act={act}/>}
    {tab==='Vencimientos'&&<MaturitiesPanel investments={investments} investorMap={investorMap}/>}
    {tab==='Renovaciones'&&<RenewalsPanel investments={investments} investorMap={investorMap}/>}
    {tab==='Tesorería'&&<TreasuryPanel investments={investments} payments={payments}/>}
    {tab==='Documentos'&&<DocumentsPanel investors={investors}/>}
    {tab==='Reportes'&&<ReportsPanel investors={investors} applications={applications} investments={investments} payments={payments}/>}
    {tab==='Auditoría'&&<AuditPanel audit={audit} investorMap={investorMap}/>}
    {tab==='Configuración'&&<ConfigurationPanel/>}
   </section>
  </main>
 </div>
}

function Dashboard({investors,applications,investments,payments,totalPrincipal,projectedGain,yieldPaid,pendingApps,nextMaturity,investorMap,onGo}){
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

function BeneficiariesPanel({company,investors,beneficiaries,investorMap,saving,act}){
 const [form,setForm]=useState({investor_id:'',full_name:'',dui:'',birth_date:'',relationship:'',phone:'',address:'',percentage:''})
 useEffect(()=>{if(!form.investor_id&&investors[0])setForm(x=>({...x,investor_id:investors[0].id}))},[investors,form.investor_id])
 const submit=e=>{e.preventDefault();act(async()=>{const {error}=await supabase.from('inv_beneficiaries').insert({...form,company_id:company.id,percentage:Number(form.percentage)});if(error)throw error;await supabase.from('inv_audit_log').insert({company_id:company.id,investor_id:form.investor_id,action:'BENEFICIARY_ADDED',detail:{full_name:form.full_name,percentage:Number(form.percentage)}});setForm({...form,full_name:'',dui:'',birth_date:'',relationship:'',phone:'',address:'',percentage:''})},'Beneficiario agregado.')}
 return <section className="prst-grid form-list">
  <form className="prst-card prst-form" onSubmit={submit}>
   <div className="prst-card-head"><div><small>BENEFICIARIO</small><h2>Agregar beneficiario</h2><p>El total de porcentajes por inversionista no puede superar 100%.</p></div></div>
   <Field label="Inversionista *"><select value={form.investor_id} onChange={e=>setForm({...form,investor_id:e.target.value})} required>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)}</option>)}</select></Field>
   <div className="prst-form-grid">
    <Field label="Nombre completo *"><input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required/></Field>
    <Field label="DUI"><input value={form.dui} onChange={e=>setForm({...form,dui:e.target.value})}/></Field>
    <Field label="Fecha de nacimiento"><input type="date" value={form.birth_date} onChange={e=>setForm({...form,birth_date:e.target.value})}/></Field>
    <Field label="Parentesco / relación"><input value={form.relationship} onChange={e=>setForm({...form,relationship:e.target.value})}/></Field>
    <Field label="Teléfono"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field>
    <Field label="Porcentaje *"><input type="number" min="0.01" max="100" step="0.01" value={form.percentage} onChange={e=>setForm({...form,percentage:e.target.value})} required/></Field>
    <Field label="Dirección" className="span-2"><textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></Field>
   </div>
   <button className="prst-primary" disabled={saving||!investors.length}>{saving?'Guardando…':'Guardar beneficiario'}</button>
  </form>
  <article className="prst-card">
   <div className="prst-card-head"><div><small>REGISTRO</small><h2>Beneficiarios</h2></div></div>
   {!beneficiaries.length?<Empty title="Sin beneficiarios registrados"/>:<div className="prst-table-wrap"><table><thead><tr><th>Inversionista</th><th>Beneficiario</th><th>Relación</th><th>Porcentaje</th></tr></thead><tbody>{beneficiaries.map(x=><tr key={x.id}><td>{fullName(investorMap.get(x.investor_id))}</td><td><b>{x.full_name}</b><small>{x.dui||'Sin DUI'}</small></td><td>{x.relationship||'—'}</td><td><b>{Number(x.percentage).toFixed(2)}%</b></td></tr>)}</tbody></table></div>}
  </article>
 </section>}

function MaturitiesPanel({investments,investorMap}){
 const rows=[...investments].filter(x=>x.maturity_date&&!['CLOSED','CANCELLED'].includes(x.status)).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date)))
 return <article className="prst-card"><div className="prst-card-head"><div><small>CONTROL</small><h2>Vencimientos</h2><p>Seguimiento de inversiones próximas a vencer.</p></div></div>{!rows.length?<Empty title="Sin vencimientos pendientes"/>:<div className="prst-table-wrap"><table><thead><tr><th>Inversionista</th><th>Capital</th><th>Vencimiento</th><th>Días restantes</th><th>Estado</th></tr></thead><tbody>{rows.map(x=>{const d=daysUntil(x.maturity_date);return <tr key={x.id}><td>{fullName(investorMap.get(x.investor_id))}</td><td>{money(x.principal)}</td><td>{date(x.maturity_date)}</td><td><b className={d<=30?'prst-danger-text':''}>{d}</b></td><td><Status value={d<0?'MATURED':d<=30?'MATURING':x.status}/></td></tr>})}</tbody></table></div>}</article>}

function RenewalsPanel({investments,investorMap}){
 const rows=investments.filter(x=>['MATURING','MATURED','ACTIVE'].includes(x.status)&&daysUntil(x.maturity_date)<=30)
 return <article className="prst-card"><div className="prst-card-head"><div><small>RENOVACIONES</small><h2>Decisiones al vencimiento</h2><p>La lógica de renovar capital, capital + rendimiento o retirar se habilitará sobre estas inversiones.</p></div></div>{!rows.length?<Empty title="No hay inversiones dentro de la ventana de 30 días"/>:<div className="prst-list">{rows.map(x=><article key={x.id}><div><b>{fullName(investorMap.get(x.investor_id))}</b><small>{money(x.principal)} · vence {date(x.maturity_date)}</small></div><Status value={daysUntil(x.maturity_date)<0?'MATURED':'MATURING'}/></article>)}</div>}</article>}

function TreasuryPanel({investments,payments}){
 const capital=investments.filter(x=>!['CANCELLED'].includes(x.status)).reduce((s,x)=>s+Number(x.principal||0),0)
 const yieldOut=payments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const capitalOut=payments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 return <><section className="prst-metrics"><Metric label="Capital recibido" value={money(capital)} hint="Inversiones formalizadas"/><Metric label="Rendimientos pagados" value={money(yieldOut)} hint="Salidas por rendimiento"/><Metric label="Capital devuelto" value={money(capitalOut)} hint="Devoluciones registradas"/><Metric label="Capital neto" value={money(capital-capitalOut)} hint="Capital menos devoluciones"/></section><article className="prst-card"><div className="prst-card-head"><div><small>TESORERÍA</small><h2>Movimientos exclusivos de inversionistas</h2><p>Este vertical no mezcla operaciones de clientes, préstamos ni facturación comercial.</p></div></div></article></>}

function DocumentsPanel({investors}){
 return <article className="prst-card"><div className="prst-card-head"><div><small>EXPEDIENTES</small><h2>Documentos del inversionista</h2></div></div>{!investors.length?<Empty title="Sin expedientes"/>:<div className="prst-table-wrap"><table><thead><tr><th>Inversionista</th><th>Rostro</th><th>DUI frente</th><th>DUI reverso</th></tr></thead><tbody>{investors.map(x=><tr key={x.id}><td><b>{fullName(x)}</b><small>{x.investor_code}</small></td><td>{x.face_photo_path?'✓ Guardado':'Pendiente'}</td><td>{x.dui_front_path?'✓ Guardado':'Pendiente'}</td><td>{x.dui_back_path?'✓ Guardado':'Pendiente'}</td></tr>)}</tbody></table></div>}</article>}

function ReportsPanel({investors,applications,investments,payments}){
 const active=investments.filter(x=>['ACTIVE','MATURING'].includes(x.status))
 return <><section className="prst-metrics"><Metric label="Inversionistas activos" value={investors.filter(x=>x.status==='ACTIVE').length} hint="Expedientes habilitados"/><Metric label="Solicitudes" value={applications.length} hint="Histórico"/><Metric label="Inversiones activas" value={active.length} hint={money(active.reduce((s,x)=>s+Number(x.principal||0),0))}/><Metric label="Pagos realizados" value={payments.length} hint={money(payments.reduce((s,x)=>s+Number(x.amount||0),0))}/></section><article className="prst-card"><div className="prst-card-head"><div><small>REPORTES</small><h2>Base gerencial creada</h2><p>Los filtros por período, exportación y reportes PDF se agregarán sobre estos datos reales.</p></div></div></article></>}

function AuditPanel({audit,investorMap}){
 return <article className="prst-card"><div className="prst-card-head"><div><small>TRAZABILIDAD</small><h2>Auditoría del vertical</h2></div></div>{!audit.length?<Empty title="Sin eventos de auditoría"/>:<div className="prst-table-wrap"><table><thead><tr><th>Fecha</th><th>Inversionista</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>{audit.map(x=><tr key={x.id}><td>{date(x.created_at)}</td><td>{fullName(investorMap.get(x.investor_id))}</td><td><b>{x.action}</b></td><td><small>{JSON.stringify(x.detail)}</small></td></tr>)}</tbody></table></div>}</article>}

function ConfigurationPanel(){
 return <section className="prst-grid two"><article className="prst-card"><div className="prst-card-head"><div><small>REGLAS</small><h2>Configuración financiera</h2></div></div><div className="prst-note"><strong>Rendimiento:</strong> todavía no se ha fijado una fórmula automática. El campo de ganancia proyectada queda manual hasta que Prestadito$ defina cómo calcula el rendimiento según monto y plazo.</div><div className="prst-note"><strong>Enfoque:</strong> este ERP contiene únicamente inversionistas e inversiones. No se habilitan módulos de clientes, préstamos o cartera.</div></article><article className="prst-card"><div className="prst-card-head"><div><small>SEGURIDAD</small><h2>Documentos privados</h2></div></div><p className="prst-copy">Las fotografías del rostro y DUI se almacenan en un bucket privado separado por empresa. El acceso depende de la membresía de IDEALO SV y de pertenecer a la empresa.</p></article></section>}
