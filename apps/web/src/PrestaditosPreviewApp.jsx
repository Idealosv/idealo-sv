import { useMemo, useState } from 'react'
import './prestaditos-investors.css'
import './prestaditos-theme.css'
import PrestaditosDashboardPanel from './PrestaditosDashboardPanel.jsx'
import PrestaditosCameraCapture from './PrestaditosCameraCapture.jsx'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const TABS=['Dashboard','Notificaciones','Agenda','Inversionistas','Perfil 360','Solicitudes','Simulador','Inversiones','Contratos','Beneficiarios','Estado de cuenta','Rendimientos','Vencimientos','Renovaciones','Tesorería','Documentos','Reportes','Cierre mensual','Auditoría','Auditoría técnica','Exportaciones','Ayuda','Prueba integral','Preparación','Configuración']
const TAB_DESCRIPTIONS={
 Dashboard:'Resumen ejecutivo',Notificaciones:'Seguimiento operativo',Agenda:'Vencimientos y tareas',Inversionistas:'Expedientes y documentos','Perfil 360':'Vista integral del inversionista',Solicitudes:'Solicitudes de inversión',Simulador:'Tasas anuales por monto',Inversiones:'Capital y vigencias',Contratos:'PDF y firma',Beneficiarios:'Designaciones','Estado de cuenta':'Resumen por inversionista',Rendimientos:'Pagos al inversionista',Vencimientos:'Fechas críticas',Renovaciones:'Decisiones al vencimiento',Tesorería:'Entradas y salidas',Documentos:'Expediente privado',Reportes:'Indicadores gerenciales','Cierre mensual':'Snapshot del período',Auditoría:'Trazabilidad','Auditoría técnica':'Integridad y seguridad',Exportaciones:'Respaldo y CSV',Ayuda:'Manual y capacitación','Prueba integral':'3 casos ficticios',Preparación:'Cierre para producción',Configuración:'Reglas del vertical'
}
const MAIN_TABS=['Dashboard','Inversionistas','Solicitudes','Inversiones','Rendimientos','Vencimientos','Tesorería','Reportes']
const MODULE_ACTIONS={
 Dashboard:['Notificaciones','Agenda'],
 Inversionistas:['Perfil 360','Beneficiarios','Documentos'],
 Solicitudes:['Simulador'],
 Inversiones:['Contratos'],
 Rendimientos:['Estado de cuenta'],
 Vencimientos:['Renovaciones'],
 Tesorería:['Cierre mensual','Exportaciones'],
 Reportes:['Auditoría','Auditoría técnica'],
}
const SYSTEM_TABS=['Configuración','Ayuda','Prueba integral','Preparación']

const demo={
 investors:[
  {id:'i1',code:'INV-2026-001284',name:'Carlos Ernesto Mejía',dui:'01234567-8',phone:'7788-1122',email:'carlos@ejemplo.com',docs:'3/3',status:'Activo'},
  {id:'i2',code:'INV-2026-001517',name:'María Elena López',dui:'02345678-9',phone:'7211-4433',email:'maria@ejemplo.com',docs:'3/3',status:'Activo'},
  {id:'i3',code:'INV-2026-001793',name:'José Roberto Hernández',dui:'03456789-0',phone:'7654-3300',email:'jose@ejemplo.com',docs:'2/3',status:'Activo'},
 ],
 applications:[
  {code:'SOL-20260918-A2F811',name:'Carlos Ernesto Mejía',amount:15000,term:12,status:'Aprobada',place:'Transferencia bancaria'},
  {code:'SOL-20260920-B5C229',name:'María Elena López',amount:8000,term:6,status:'En revisión',place:'Oficina central'},
  {code:'SOL-20260921-C9D184',name:'José Roberto Hernández',amount:20000,term:18,status:'Pendiente',place:'Transferencia bancaria'},
 ],
 investments:[
  {code:'INVEST-20260901-A1B2C3',name:'Carlos Ernesto Mejía',capital:4000,term:12,granted:'01 sep 2026',maturity:'01 sep 2027',gain:400,rate:10,status:'Activa'},
  {code:'INVEST-20260815-D4E5F6',name:'María Elena López',capital:8000,term:6,granted:'15 ago 2026',maturity:'15 feb 2027',gain:960,rate:12,status:'Activa'},
  {code:'INVEST-20260310-G7H8I9',name:'José Roberto Hernández',capital:12000,term:6,granted:'10 mar 2026',maturity:'10 sep 2026',gain:1800,rate:15,status:'Vencida'},
 ],
 contracts:[
  {code:'CTR-20260901-AB12CD',number:'PS-2026-001',investor:'Carlos Ernesto Mejía',investment:'INVEST-20260901-A1B2C3',capital:4000,rate:10,status:'Firmado'},
  {code:'CTR-20260815-EF34GH',number:'PS-2026-002',investor:'María Elena López',investment:'INVEST-20260815-D4E5F6',capital:8000,rate:12,status:'Preparado'},
 ],
 beneficiaries:[
  {code:'BEN-20260901-11AB22',name:'Ana Mejía',investor:'Carlos Ernesto Mejía',relation:'Esposa',pct:60,status:'Activo'},
  {code:'BEN-20260901-33CD44',name:'Luis Mejía',investor:'Carlos Ernesto Mejía',relation:'Hijo',pct:40,status:'Activo'},
  {code:'BEN-20260815-55EF66',name:'Sofía López',investor:'María Elena López',relation:'Hija',pct:100,status:'Activo'},
 ],
 payments:[
  {code:'PAG-20260905-AA1122',name:'Carlos Ernesto Mejía',investment:'INVEST-20260901-A1B2C3',type:'Rendimiento',amount:150,date:'05 sep 2026',status:'Vigente'},
  {code:'PAG-20260915-BB3344',name:'María Elena López',investment:'INVEST-20260815-D4E5F6',type:'Rendimiento',amount:120,date:'15 sep 2026',status:'Vigente'},
  {code:'PAG-20260918-CC5566',name:'José Roberto Hernández',investment:'INVEST-20260310-G7H8I9',type:'Devolución de capital',amount:12000,date:'18 sep 2026',status:'Vigente'},
 ],
 renewals:[
  {code:'REN-20260910-AB1234',name:'José Roberto Hernández',investment:'INVEST-20260310-G7H8I9',decision:'Renovar capital',amount:12000,term:12,status:'Registrada'},
 ],
 documents:[
  {code:'DOC-20260901-AA1010',title:'Contrato de inversión firmado',investor:'Carlos Ernesto Mejía',relation:'INVEST-20260901-A1B2C3',type:'Contrato',size:'1.8 MB',status:'Activo'},
  {code:'DOC-20260905-BB2020',title:'Comprobante de transferencia',investor:'Carlos Ernesto Mejía',relation:'INVEST-20260901-A1B2C3',type:'Comprobante de pago',size:'462 KB',status:'Activo'},
  {code:'DOC-20260915-CC3030',title:'Formulario de beneficiarios',investor:'María Elena López',relation:'Expediente general',type:'Formulario',size:'820 KB',status:'Activo'},
 ],
 audit:[
  {date:'21 sep 2026 · 10:14',category:'Inversionistas',action:'Inversionista actualizado',investor:'Carlos Ernesto Mejía',actor:'Usuario 41a8c229'},
  {date:'21 sep 2026 · 10:32',category:'Solicitudes',action:'Solicitud aprobada',investor:'María Elena López',actor:'Usuario 41a8c229'},
  {date:'21 sep 2026 · 10:49',category:'Pagos',action:'Pago registrado',investor:'Carlos Ernesto Mejía',actor:'Usuario 41a8c229'},
  {date:'21 sep 2026 · 11:06',category:'Documentos',action:'Documento registrado',investor:'María Elena López',actor:'Usuario 41a8c229'},
 ],
}

function Status({children,tone='active'}){return <span className={`prst-status ${tone}`}>{children}</span>}
function Card({title,kicker='MÓDULO',children}){return <article className="prst-card"><div className="prst-card-head"><div><small>{kicker}</small><h2>{title}</h2></div></div>{children}</article>}
function Table({headers,rows}){return <div className="prst-table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>}

export default function PrestaditosPreviewApp(){
 const [tab,setTab]=useState('Dashboard')
 const [mobileNavOpen,setMobileNavOpen]=useState(false)
 const [selectedInvestorId,setSelectedInvestorId]=useState('i1')
 const capital=useMemo(()=>demo.investments.filter(x=>x.status==='Activa').reduce((s,x)=>s+x.capital,0),[])
 const projected=useMemo(()=>demo.investments.filter(x=>x.status==='Activa').reduce((s,x)=>s+x.gain,0),[])
 const yieldPaid=useMemo(()=>demo.payments.filter(x=>x.type==='Rendimiento').reduce((s,x)=>s+x.amount,0),[])
 const previewDashboard=useMemo(()=>{
  const investorIds={
   'Carlos Ernesto Mejía':'i1',
   'María Elena López':'i2',
   'José Roberto Hernández':'i3',
  }
  const investors=demo.investors.map(row=>{
   const parts=row.name.split(' ')
   return {id:row.id,first_names:parts.slice(0,2).join(' '),last_names:parts.slice(2).join(' '),investor_code:row.code,dui:row.dui,status:'ACTIVE'}
  })
  const applications=demo.applications.map((row,index)=>({
   id:'a'+(index+1),investor_id:investorIds[row.name],application_code:row.code,requested_amount:row.amount,requested_term_months:row.term,
   status:row.status==='Aprobada'?'APPROVED':row.status==='En revisión'?'REVIEW':'PENDING',
   created_at:['2026-09-18T10:00:00','2026-09-20T10:00:00','2026-09-21T10:00:00'][index],
  }))
  const investments=[
   {id:'n1',investor_id:'i1',investment_code:'INVEST-20260901-A1B2C3',principal:4000,term_months:12,granted_at:'2026-09-01',maturity_date:'2027-09-01',agreed_return_rate:10,status:'ACTIVE'},
   {id:'n2',investor_id:'i2',investment_code:'INVEST-20260815-D4E5F6',principal:8000,term_months:6,granted_at:'2026-08-15',maturity_date:'2027-02-15',agreed_return_rate:12,status:'ACTIVE'},
   {id:'n3',investor_id:'i3',investment_code:'INVEST-20260310-G7H8I9',principal:12000,term_months:6,granted_at:'2026-03-10',maturity_date:'2026-09-10',agreed_return_rate:15,status:'MATURED'},
  ]
  const payments=[
   {id:'p1',investor_id:'i1',investment_id:'n1',payment_code:'PAG-20260905-AA1122',payment_type:'YIELD',amount:150,payment_date:'2026-09-05',status:'POSTED'},
   {id:'p2',investor_id:'i2',investment_id:'n2',payment_code:'PAG-20260915-BB3344',payment_type:'YIELD',amount:120,payment_date:'2026-09-15',status:'POSTED'},
   {id:'p3',investor_id:'i3',investment_id:'n3',payment_code:'PAG-20260918-CC5566',payment_type:'CAPITAL_RETURN',amount:12000,payment_date:'2026-09-18',status:'POSTED'},
  ]
  const contracts=[
   {id:'c1',investor_id:'i1',investment_id:'n1',contract_code:'CTR-20260901-AB12CD',status:'SIGNED'},
   {id:'c2',investor_id:'i2',investment_id:'n2',contract_code:'CTR-20260815-EF34GH',status:'GENERATED'},
  ]
  const renewals=[{id:'r1',investor_id:'i3',investment_id:'n3',renewal_code:'REN-20260910-AB1234',status:'RECORDED'}]
  const documents=demo.documents.map((row,index)=>({id:'d'+(index+1),status:'ACTIVE'}))
  const alerts=[
   {id:'al1',priority:'CRITICAL',title:'Inversión vencida',detail:'José Roberto Hernández · 11 días vencida',tab:'Vencimientos',investor_id:'i3',investment_id:'n3'},
   {id:'al2',priority:'HIGH',title:'Contrato pendiente de firma',detail:'María Elena López · CTR-20260815-EF34GH',tab:'Contratos',investor_id:'i2',investment_id:'n2'},
   {id:'al3',priority:'MEDIUM',title:'Expediente incompleto',detail:'José Roberto Hernández · falta documento de identidad',tab:'Inversionistas',investor_id:'i3'},
  ]
  return {investors,applications,investments,payments,contracts,renewals,documents,alerts,investorMap:new Map(investors.map(row=>[row.id,row]))}
 },[])

 const selectTab=name=>{setTab(name);setMobileNavOpen(false)}
 const openInvestorTab=(name,investorId)=>{if(investorId)setSelectedInvestorId(investorId);selectTab(name)}
 const moduleParent=Object.entries(MODULE_ACTIONS).find(([,items])=>items.includes(tab))?.[0]||tab
 const moduleActions=MODULE_ACTIONS[moduleParent]||[]
 const navButton=name=><button key={name} type="button" className={moduleParent===name?'active':''} onClick={()=>selectTab(name)}><strong>{name}</strong><small>{TAB_DESCRIPTIONS[name]}</small></button>
 return <div className="prst-app">
  {mobileNavOpen&&<button type="button" className="prst-mobile-overlay" aria-label="Cerrar menú" onClick={()=>setMobileNavOpen(false)}/>}
  <aside className={`prst-sidebar ${mobileNavOpen?'mobile-open':''}`}>
   <div className="prst-brand"><span className="prst-mark">$</span><div><strong>PRESTADITO$</strong><small>El Préstamo a tu Crecimiento</small></div></div>
   <div className="prst-company"><span>IDEALO SV · VISTA PREVIA</span><strong>Prestadito$ El Salvador</strong><small>ERP de inversionistas</small></div>
   <nav>
    <div className="prst-nav-primary">{MAIN_TABS.map(navButton)}</div>
   </nav>
  </aside>

  <main className={`prst-main ${tab==='Perfil 360'?'profile360-active':''}`}>
   <header className="prst-topbar">
    <button type="button" className="prst-mobile-menu" onClick={()=>setMobileNavOpen(true)} aria-label="Abrir menú">☰</button>
    <div className="prst-top-title"><span>IDEALO SV · FINANCIERA / INVERSIONISTAS</span><h1>{tab}</h1><p>Vista previa con datos demostrativos. No modifica información real.</p></div>
    <PreviewSearch onOpen={()=>selectTab('Perfil 360')}/>
    <div className="prst-top-actions">
     <details className="prst-system-menu">
      <summary>Sistema</summary>
      <div>{SYSTEM_TABS.map(name=><button key={name} type="button" onClick={()=>selectTab(name)}>{name}</button>)}</div>
     </details>
     <button type="button" onClick={()=>selectTab('Dashboard')}>Inicio</button>
    </div>
   </header>
   {moduleActions.length>0&&<div className="prst-context-bar"><span>{moduleParent}</span><div>{moduleActions.map(name=><button key={name} type="button" className={tab===name?'active':''} onClick={()=>selectTab(name)}>{name}</button>)}</div></div>}
   <div className="prst-alert success">VISTA PREVIA · Esta pantalla sirve para revisar diseño, orden y funcionamiento visual antes de integrar Prestadito$ a producción.</div>
   <section className="prst-content">
    {tab==='Dashboard'&&<PrestaditosDashboardPanel {...previewDashboard} onGo={selectTab} onAlert={target=>selectTab(target)}/>} 
    {tab==='Notificaciones'&&<Notifications onGo={selectTab}/>} 
    {tab==='Agenda'&&<Agenda onGo={selectTab}/>} 
    {tab==='Inversionistas'&&<Investors onGo={selectTab} onOpenInvestor={openInvestorTab}/>} 
    {tab==='Perfil 360'&&<Profile360 investorId={selectedInvestorId} onGo={selectTab}/>} 
    {tab==='Solicitudes'&&<Applications/>}
    {tab==='Simulador'&&<Simulator/>}
    {tab==='Inversiones'&&<Investments/>}
    {tab==='Contratos'&&<Contracts/>}
    {tab==='Beneficiarios'&&<Beneficiaries/>}
    {tab==='Estado de cuenta'&&<Statement/>}
    {tab==='Rendimientos'&&<Payments/>}
    {tab==='Vencimientos'&&<Maturities/>}
    {tab==='Renovaciones'&&<Renewals/>}
    {tab==='Tesorería'&&<Treasury capital={capital} yieldPaid={yieldPaid}/>} 
    {tab==='Documentos'&&<Documents investorId={selectedInvestorId}/>} 
    {tab==='Reportes'&&<Reports/>}
    {tab==='Cierre mensual'&&<MonthlyCloseout/>}
    {tab==='Auditoría'&&<Audit/>}
    {tab==='Auditoría técnica'&&<TechnicalAudit/>}
    {tab==='Exportaciones'&&<Exports/>}
    {tab==='Ayuda'&&<Help/>}
    {tab==='Prueba integral'&&<EndToEndDemo/>}
    {tab==='Preparación'&&<Readiness/>}
    {tab==='Configuración'&&<Configuration/>}
   </section>
  </main>
 </div>
}

function Metric({label,value,hint,tone=''}){return <article className={`prst-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}

function Investors({onGo,onOpenInvestor}){
 const [investorRows,setInvestorRows]=useState(demo.investors)
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('ALL')
 const [docs,setDocs]=useState('ALL')
 const [editingId,setEditingId]=useState('')
 const [editDraft,setEditDraft]=useState(null)
 const [editNotice,setEditNotice]=useState('')
 const [faceCapture,setFaceCapture]=useState(null)
 const [duiFrontCapture,setDuiFrontCapture]=useState(null)
 const [duiBackCapture,setDuiBackCapture]=useState(null)
 const activeCapital={i1:4000,i2:8000,i3:0}
 const activeCount={i1:1,i2:1,i3:0}
 const q=query.trim().toLowerCase()
 const rows=investorRows.filter(x=>(status==='ALL'||x.status===status)&&(docs==='ALL'||(docs==='COMPLETE'?x.docs==='3/3':x.docs!=='3/3'))&&(!q||(x.name+' '+x.code+' '+x.dui+' '+x.phone+' '+x.email).toLowerCase().includes(q)))
 const pending=investorRows.filter(x=>x.docs!=='3/3')
 const updateNewCaptureDocs=(nextFace,nextFront,nextBack)=>{
  if(!editingId.startsWith('demo-'))return
  const count=[nextFace,nextFront,nextBack].filter(Boolean).length
  setEditDraft(current=>current?{...current,docs:`${count}/3`}:current)
 }

 const openEdit=x=>{
  setEditingId(x.id)
  setEditDraft({...x})
  setEditNotice('')
  window.setTimeout(()=>document.querySelector('.prst-preview-investor-edit')?.scrollIntoView({behavior:'smooth',block:'center'}),30)
 }
 const closeEdit=()=>{setEditingId('');setEditDraft(null);setEditNotice('');setFaceCapture(null);setDuiFrontCapture(null);setDuiBackCapture(null)}
 const updateDraft=e=>setEditDraft(current=>({...current,[e.target.name]:e.target.value}))
 const saveDraft=e=>{
  e.preventDefault()
  if(!editDraft)return
  setInvestorRows(current=>current.map(x=>x.id===editingId?{...x,...editDraft}:x))
  setEditNotice('Cambios guardados en esta vista previa.')
  window.setTimeout(()=>{setEditingId('');setEditDraft(null);setEditNotice('')},900)
 }
 const exportCsv=()=>{
  const header=['Código','Nombre','DUI','Teléfono','Correo','Documentos','Estado']
  const quote=v=>`"${String(v??'').replaceAll('"','""')}"`
  const csv='\ufeff'+[header,...rows.map(x=>[x.code,x.name,x.dui,x.phone,x.email,x.docs,x.status])].map(r=>r.map(quote).join(',')).join('\n')
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a')
  a.href=url;a.download='prestaditos-inversionistas-demo.csv';a.click();URL.revokeObjectURL(url)
 }
 const openNew=()=>{
  const id='demo-'+Date.now()
  setEditingId(id)
  setEditDraft({id,code:'INV-DEMO-NUEVO',name:'',dui:'',phone:'',email:'',docs:'0/3',status:'Activo'})
  setEditNotice('Nuevo expediente de demostración. No modifica información real.')
  setFaceCapture(null);setDuiFrontCapture(null);setDuiBackCapture(null)
  window.setTimeout(()=>document.querySelector('.prst-preview-investor-edit')?.scrollIntoView({behavior:'smooth',block:'center'}),30)
 }
 const saveNew=e=>{
  e.preventDefault()
  if(!editDraft?.name.trim())return
  setInvestorRows(current=>current.some(x=>x.id===editingId)?current.map(x=>x.id===editingId?{...x,...editDraft}:x):[{...editDraft},...current])
  setEditNotice('Expediente agregado únicamente a esta vista previa.')
  window.setTimeout(()=>{setEditingId('');setEditDraft(null);setEditNotice('')},900)
 }

 return <section className="prst-investor-module">
  <section className="prst-investor-command">
   <div><small>CONTROL DE EXPEDIENTES</small><h2>Directorio de inversionistas</h2><p>Consulta, documentación, capital activo y acceso rápido al expediente de cada inversionista.</p></div>
   <div className="prst-investor-command-actions">
    <button type="button" className="primary" onClick={openNew}>+ Nuevo inversionista</button>
    <details className="prst-action-menu top">
     <summary>Más</summary>
     <div>
      <button type="button" onClick={exportCsv}>Exportar CSV</button>
      <button type="button" onClick={()=>setDocs('PENDING')}>Ver pendientes <span>{pending.length}</span></button>
     </div>
    </details>
   </div>
  </section>

  <section className="prst-investor-summary prst-investor-summary-pro">
   <article><span>Inversionistas</span><strong>{investorRows.length}</strong><small>{investorRows.filter(x=>x.status==='Activo').length} activos</small></article>
   <article><span>Documentación pendiente</span><strong>{pending.length}</strong><small>{investorRows.filter(x=>x.docs==='3/3').length} expedientes completos</small></article>
   <article><span>Inversiones activas</span><strong>2</strong><small>vigentes actualmente</small></article>
   <article><span>Capital activo</span><strong>{money(12000)}</strong><small>capital vigente</small></article>
  </section>

  <article className="prst-card prst-investor-directory-card">
   <div className="prst-card-head prst-investor-directory-head"><div><small>DIRECTORIO</small><h2>Inversionistas registrados</h2><p>Filtrá por estado o documentación y abrí el expediente sin perder el contexto.</p></div><div className="prst-directory-count"><span>Resultados</span><strong>{rows.length}</strong></div></div>
   <div className="prst-directory-tools prst-directory-tools-pro">
    <input className="prst-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nombre, DUI, código, teléfono o correo"/>
    <select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Todos los estados</option><option value="Activo">Activos</option></select>
    <select value={docs} onChange={e=>setDocs(e.target.value)}><option value="ALL">Todos los documentos</option><option value="COMPLETE">Documentación completa</option><option value="PENDING">Documentación pendiente</option></select>
    {(query||status!=='ALL'||docs!=='ALL')&&<button type="button" className="prst-filter-clear" onClick={()=>{setQuery('');setStatus('ALL');setDocs('ALL')}}>Limpiar</button>}
   </div>
   <div className="prst-table-wrap prst-investor-table-wrap"><table className="prst-investor-table prst-investor-table-pro">
    <thead><tr><th>Inversionista</th><th>Identificación / contacto</th><th>Documentación</th><th>Inversiones</th><th>Capital activo</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>{rows.map(x=>{
     const n=Number(x.docs.split('/')[0]),pct=Math.round((n/3)*100)
     return <tr key={x.id}>
      <td><div className="prst-investor-name-cell"><span className="prst-investor-avatar">{x.name.split(' ').filter(Boolean).map(v=>v[0]).slice(0,2).join('')||'NV'}</span><span><b>{x.name||'Nuevo inversionista'}</b><small>{x.code}</small></span></div></td>
      <td><b>{x.dui||'DUI pendiente'}</b><small>{x.phone||x.email||'Sin contacto'}{x.email&&x.phone?` · ${x.email}`:''}</small></td>
      <td><div className="prst-doc-progress"><div><span style={{width:`${pct}%`}}/></div><small>{n===3?'Completo':`${n}/3 documentos`}</small></div></td>
      <td><b>{activeCount[x.id]||0}</b><small>{activeCount[x.id]?'vigentes':'sin inversión activa'}</small></td>
      <td><b>{money(activeCapital[x.id]||0)}</b><small>capital vigente</small></td>
      <td><Status>{x.status}</Status></td>
      <td><div className="prst-row-actions prst-investor-actions compact">
       <button type="button" className="primary" onClick={()=>onOpenInvestor?.('Perfil 360',x.id)}>Perfil 360</button>
       <details className="prst-action-menu">
        <summary>Más</summary>
        <div>
         <button type="button" onClick={()=>onOpenInvestor?.('Documentos',x.id)}>Documentos</button>
         {activeCount[x.id]>0&&<button type="button" onClick={()=>onOpenInvestor?.('Contratos',x.id)}>Contratos</button>}
         <button type="button" onClick={()=>openEdit(x)}>Editar</button>
        </div>
       </details>
      </div></td>
     </tr>
    })}</tbody>
   </table></div>
  </article>

  {editDraft&&<div className="prst-editor-backdrop" onMouseDown={e=>e.target===e.currentTarget&&closeEdit()}><form className="prst-card prst-preview-investor-edit prst-editor-modal prst-editor-modal-preview" onSubmit={editingId.startsWith('demo-')?saveNew:saveDraft}>
   <div className="prst-card-head"><div><small>VISTA PREVIA</small><h2>{editingId.startsWith('demo-')?'Nuevo inversionista':'Editar inversionista'}</h2><p>Probá el flujo visual. Estos cambios no modifican información real.</p></div><button type="button" className="prst-mini-button" onClick={closeEdit}>Cerrar</button></div>
   <div className="prst-form-grid">
    <label className="prst-field"><span>Nombre completo</span><input name="name" value={editDraft.name} onChange={updateDraft} required/></label>
    <label className="prst-field"><span>DUI</span><input name="dui" value={editDraft.dui} onChange={updateDraft}/></label>
    <label className="prst-field"><span>Teléfono</span><input name="phone" value={editDraft.phone} onChange={updateDraft}/></label>
    <label className="prst-field"><span>Correo</span><input name="email" type="email" value={editDraft.email} onChange={updateDraft}/></label>
    <label className="prst-field"><span>Estado</span><select name="status" value={editDraft.status} onChange={updateDraft}><option>Activo</option><option>Inactivo</option></select></label>
    <label className="prst-field"><span>Documentación</span><select name="docs" value={editDraft.docs} onChange={updateDraft} disabled={editingId.startsWith('demo-')}><option>0/3</option><option>1/3</option><option>2/3</option><option>3/3</option></select></label>
   </div>
   <div className="prst-preview-camera-section">
    <div className="prst-section-title">Captura de documentos</div>
    <div className="prst-preview-camera-grid">
     <div><span>Foto del rostro</span><PrestaditosCameraCapture label="Tomar foto del rostro" facingMode="user" fileName="rostro" onCapture={file=>{setFaceCapture(file);updateNewCaptureDocs(file,duiFrontCapture,duiBackCapture)}}/><small>{faceCapture?.name||'Usa la cámara frontal.'}</small></div>
     <div><span>DUI frente</span><PrestaditosCameraCapture label="Escanear DUI frente" facingMode="environment" fileName="dui-frente" onCapture={file=>{setDuiFrontCapture(file);updateNewCaptureDocs(faceCapture,file,duiBackCapture)}}/><small>{duiFrontCapture?.name||'Usa la cámara trasera.'}</small></div>
     <div><span>DUI reverso</span><PrestaditosCameraCapture label="Escanear DUI reverso" facingMode="environment" fileName="dui-reverso" onCapture={file=>{setDuiBackCapture(file);updateNewCaptureDocs(faceCapture,duiFrontCapture,file)}}/><small>{duiBackCapture?.name||'Usa la cámara trasera.'}</small></div>
    </div>
   </div>
   <div className="prst-preview-edit-actions"><span>{editNotice}</span><div><button type="button" onClick={closeEdit}>Cancelar</button><button type="submit" className="primary">Guardar demo</button></div></div>
  </form></div>}

 </section>
}

function Applications(){return <>
 <section className="prst-investor-summary"><article><span>Solicitudes</span><strong>3</strong><small>histórico</small></article><article><span>Pendientes / revisión</span><strong>2</strong><small>{money(28000)} solicitado</small></article><article><span>Aprobadas</span><strong>1</strong><small>lista para proceso</small></article><article><span>Formalizadas</span><strong>0</strong><small>desde esta muestra</small></article></section>
 <Card title="Bandeja de solicitudes" kicker="CONTROL">
  <Table headers={['Solicitud','Inversionista','Monto','Plazo','Lugar','Estado']} rows={demo.applications.map(x=><tr key={x.code}><td><b>{x.code}</b></td><td>{x.name}</td><td><b>{money(x.amount)}</b></td><td>{x.term} meses</td><td>{x.place}</td><td><Status tone={x.status==='Aprobada'?'active':x.status==='Pendiente'?'pending':'review'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Investments(){return <>
 <section className="prst-investor-summary"><article><span>Inversiones activas</span><strong>2</strong><small>vigentes</small></article><article><span>Capital activo</span><strong>{money(12000)}</strong><small>formalizado</small></article><article><span>Referencia anual</span><strong>{money(1360)}</strong><small>demostrativa</small></article><article><span>Vencidas</span><strong>1</strong><small>requiere gestión</small></article></section>
 <Card title="Portafolio de inversiones" kicker="INVERSIONES">
  <Table headers={['Inversión','Inversionista','Capital','Plazo','Tasa anual','Otorgada','Vence','Referencia anual','Estado']} rows={demo.investments.map(x=><tr key={x.code}><td><b>{x.code}</b></td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.term} meses</td><td><b>{x.rate}% anual</b><small>según monto de ejemplo</small></td><td>{x.granted}</td><td>{x.maturity}</td><td>{money(x.gain)}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Beneficiaries(){
 const RELATION_OPTIONS=['Esposa/o','Hijo/a','Madre','Padre','Hermano/a','Otro']
 const [rows,setRows]=useState(demo.beneficiaries)
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('ALL')
 const [draft,setDraft]=useState(null)
 const [notice,setNotice]=useState('')

 const assignedForInvestor=name=>
  rows
   .filter(x=>x.status==='Activo' && x.investor===name)
   .reduce((s,x)=>s+Number(x.pct||0),0)

 const availableForInvestor=name=>
  Math.max(0,Number((100-assignedForInvestor(name)).toFixed(2)))

 const q=query.trim().toLowerCase()
 const filtered=rows.filter(x=>
  (status==='ALL'||x.status===status)&&
  (!q||(x.name+' '+x.investor+' '+x.relation+' '+x.code).toLowerCase().includes(q))
 )

 const active=rows.filter(x=>x.status==='Activo')
 const covered=new Set(active.map(x=>x.investor)).size
 const totals=active.reduce((acc,x)=>{
  acc[x.investor]=(acc[x.investor]||0)+Number(x.pct||0)
  return acc
 },{})
 const complete=Object.values(totals).filter(v=>Math.abs(v-100)<0.01).length

 const openNew=()=>{
  const defaultInvestor=demo.investors[0]?.name||''
  const available=availableForInvestor(defaultInvestor)
  setDraft({
   code:'BEN-DEMO-'+String(Date.now()).slice(-6),
   name:'',
   investor:defaultInvestor,
   relation:'Esposa/o',
   customRelation:'',
   pct:available>0?available:0,
   status:'Activo'
  })
  setNotice('')
 }

 const close=()=>{
  setDraft(null)
  setNotice('')
 }

 const save=e=>{
  e.preventDefault()
  if(!draft)return

  const pct=Number(draft.pct||0)
  const available=availableForInvestor(draft.investor)
  const finalRelation=draft.relation==='Otro'?draft.customRelation.trim():draft.relation

  if(!draft.name.trim()){
   setNotice('Completá el nombre del beneficiario.')
   return
  }
  if(!finalRelation){
   setNotice('Seleccioná o escribí la relación.')
   return
  }
  if(available<=0){
   setNotice('Este inversionista ya tiene el 100% asignado.')
   return
  }
  if(pct<=0){
   setNotice('El porcentaje debe ser mayor que 0%.')
   return
  }
  if(pct>available){
   setNotice(`Solo hay ${available.toFixed(2)}% disponible para ${draft.investor}.`)
   return
  }

  setRows(current=>[{
   code:draft.code,
   name:draft.name.trim(),
   investor:draft.investor,
   relation:finalRelation,
   pct,
   status:'Activo'
  },...current])
  setDraft(null)
  setNotice('')
 }

 const assignedDraft=draft?assignedForInvestor(draft.investor):0
 const availableDraft=draft?availableForInvestor(draft.investor):0

 return <section className="prst-beneficiaries-module">
  <section className="prst-beneficiary-command">
   <div><small>BENEFICIARIOS</small><h2>Designaciones</h2><p>Administrá beneficiarios sin salir del expediente del inversionista.</p></div>
   <button type="button" className="primary" onClick={openNew}>+ Nuevo beneficiario</button>
  </section>

  <section className="prst-investor-summary prst-beneficiary-summary">
   <article><span>Beneficiarios activos</span><strong>{active.length}</strong><small>designaciones</small></article>
   <article><span>Inversionistas cubiertos</span><strong>{covered}</strong><small>con beneficiarios</small></article>
   <article><span>Asignación completa</span><strong>{complete}</strong><small>100% distribuido</small></article>
   <article><span>Inactivos</span><strong>{rows.filter(x=>x.status!=='Activo').length}</strong><small>histórico</small></article>
  </section>

  <Card title="Beneficiarios registrados" kicker="DESIGNACIONES">
   <div className="prst-beneficiary-tools">
    <input className="prst-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar beneficiario, inversionista o relación"/>
    <select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Todos los estados</option><option value="Activo">Activos</option><option value="Inactivo">Inactivos</option></select>
    <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
   </div>
   <Table headers={['Beneficiario','Inversionista','Relación','Porcentaje','Estado']} rows={filtered.map(x=><tr key={x.code}><td><b>{x.name}</b><small>{x.code}</small></td><td>{x.investor}</td><td>{x.relation}</td><td><b>{Number(x.pct).toFixed(2)}%</b></td><td><Status>{x.status}</Status></td></tr>)}/>
  </Card>

  {draft&&<div className="prst-editor-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><form className="prst-card prst-editor-modal prst-beneficiary-modal" onSubmit={save}>
   <div className="prst-card-head"><div><small>VISTA PREVIA</small><h2>Nuevo beneficiario</h2><p>La suma activa por inversionista no puede superar el 100%.</p></div><button type="button" className="prst-mini-button" onClick={close}>Cerrar</button></div>

   <div className="prst-beneficiary-allocation">
    <span>Asignado: <b>{assignedDraft.toFixed(2)}%</b></span>
    <span>Disponible: <b>{availableDraft.toFixed(2)}%</b></span>
   </div>

   <div className="prst-form-grid">
    <label className="prst-field"><span>Nombre completo</span><input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} required/></label>
    <label className="prst-field"><span>Inversionista</span><select value={draft.investor} onChange={e=>{const investor=e.target.value;const available=availableForInvestor(investor);setDraft(current=>({...current,investor,pct:available>0?Math.min(Number(current?.pct||0)||available,available):0}));setNotice('')}}>{demo.investors.map(x=><option key={x.id}>{x.name}</option>)}</select></label>
    <label className="prst-field"><span>Relación</span><select value={draft.relation} onChange={e=>setDraft({...draft,relation:e.target.value})}>{RELATION_OPTIONS.map(option=><option key={option}>{option}</option>)}</select></label>
    <label className="prst-field"><span>Porcentaje</span><input type="number" min="0" max={availableDraft} step="0.01" value={draft.pct} onChange={e=>setDraft({...draft,pct:e.target.value})} disabled={availableDraft<=0}/><small>Máximo disponible: {availableDraft.toFixed(2)}%</small></label>
    {draft.relation==='Otro'&&<label className="prst-field span-2"><span>Especificar relación</span><input value={draft.customRelation} onChange={e=>setDraft({...draft,customRelation:e.target.value})} placeholder="Escribí la relación" required/></label>}
   </div>

   {notice&&<div className="prst-beneficiary-notice">{notice}</div>}
   <div className="prst-preview-edit-actions"><span>Solo modifica esta vista previa.</span><div><button type="button" onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={availableDraft<=0}>Guardar demo</button></div></div>
  </form></div>}
 </section>
}

function Payments(){return <>
 <section className="prst-investor-summary"><article><span>Rendimientos pagados</span><strong>{money(270)}</strong><small>vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>registrado</small></article><article><span>Movimientos</span><strong>3</strong><small>en la muestra</small></article><article><span>Revertidos</span><strong>0</strong><small>auditoría</small></article></section>
 <Card title="Libro de pagos" kicker="RENDIMIENTOS / PAGOS">
  <Table headers={['Pago','Fecha','Inversionista','Inversión','Tipo','Monto','Estado']} rows={demo.payments.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.date}</td><td>{x.name}</td><td>{x.investment}</td><td>{x.type}</td><td><b>{money(x.amount)}</b></td><td><Status>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Maturities(){return <>
 <section className="prst-investor-summary"><article><span>Vencidas</span><strong>1</strong><small>requiere decisión</small></article><article><span>Próximos 7 días</span><strong>0</strong><small>atención inmediata</small></article><article><span>Próximos 30 días</span><strong>0</strong><small>gestión preventiva</small></article><article><span>Próximos 90 días</span><strong>0</strong><small>planificación</small></article></section>
 <Card title="Control de vencimientos" kicker="CALENDARIO">
  <Table headers={['Inversión','Inversionista','Capital','Vencimiento','Situación']} rows={demo.investments.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.maturity}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status==='Vencida'?'Vencida':'Vigente'}</Status></td></tr>)}/>
 </Card>
 </>}

function Renewals(){return <>
 <section className="prst-investor-summary"><article><span>Por gestionar</span><strong>1</strong><small>vencida / ≤30 días</small></article><article><span>Decisiones registradas</span><strong>1</strong><small>pendiente de ejecución</small></article><article><span>Intención de renovar</span><strong>1</strong><small>capital</small></article><article><span>No renovar</span><strong>0</strong><small>retiros</small></article></section>
 <Card title="Decisiones de renovación" kicker="RENOVACIONES">
  <Table headers={['Código','Inversionista','Inversión','Decisión','Monto','Nuevo plazo','Estado']} rows={demo.renewals.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td>{x.investment}</td><td>{x.decision}</td><td><b>{money(x.amount)}</b></td><td>{x.term} meses</td><td><Status tone="review">{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Treasury({capital,yieldPaid}){return <>
 <section className="prst-investor-summary"><article><span>Capital recibido</span><strong>{money(24000)}</strong><small>formalizado</small></article><article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>salidas vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>devoluciones</small></article><article><span>Posición neta</span><strong>{money(11730)}</strong><small>entradas menos salidas</small></article></section>
 <Card title="Libro consolidado de tesorería" kicker="MOVIMIENTOS">
  <Table headers={['Fecha','Movimiento','Inversionista','Inversión','Entrada','Salida','Estado']} rows={[
   <tr key="t1"><td>01 sep 2026</td><td>Entrada de capital</td><td>Carlos Ernesto Mejía</td><td>INVEST-20260901-A1B2C3</td><td><b className="prst-money-in">{money(4000)}</b></td><td>—</td><td><Status>Vigente</Status></td></tr>,
   <tr key="t2"><td>05 sep 2026</td><td>Pago de rendimiento</td><td>Carlos Ernesto Mejía</td><td>INVEST-20260901-A1B2C3</td><td>—</td><td><b className="prst-money-out">{money(150)}</b></td><td><Status>Vigente</Status></td></tr>,
   <tr key="t3"><td>18 sep 2026</td><td>Devolución de capital</td><td>José Roberto Hernández</td><td>INVEST-20260310-G7H8I9</td><td>—</td><td><b className="prst-money-out">{money(12000)}</b></td><td><Status>Vigente</Status></td></tr>,
  ]}/>
 </Card>
 </>}


function Documents({investorId='i1'}){
 const investor=demo.investors.find(x=>x.id===investorId)||demo.investors[0]
 const [showAll,setShowAll]=useState(false)
 const rows=showAll?demo.documents:demo.documents.filter(x=>x.investor===investor.name)
 const contracts=rows.filter(x=>x.type==='Contrato').length
 const proofs=rows.filter(x=>x.type==='Comprobante de pago').length
 return <>
 <section className="prst-investor-summary"><article><span>Documentos mostrados</span><strong>{rows.length}</strong><small>{showAll?'repositorio completo':investor.name}</small></article><article><span>Contratos</span><strong>{contracts}</strong><small>documentos contractuales</small></article><article><span>Comprobantes</span><strong>{proofs}</strong><small>respaldo de pago</small></article><article><span>Expediente</span><strong>{investor.docs}</strong><small>rostro + DUI</small></article></section>
 <Card title={showAll?'Repositorio documental':`Documentos · ${investor.name}`} kicker="EXPEDIENTE PRIVADO">
  <div className="prst-document-context"><div><span>Inversionista seleccionado</span><strong>{investor.name}</strong><small>{investor.code} · DUI {investor.dui}</small></div><button type="button" onClick={()=>setShowAll(x=>!x)}>{showAll?'Ver solo este inversionista':'Ver todos los documentos'}</button></div>
  {rows.length?<Table headers={['Documento','Inversionista','Relación','Tipo','Archivo','Estado']} rows={rows.map(x=><tr key={x.code}><td><b>{x.title}</b><small>{x.code}</small></td><td>{x.investor}</td><td>{x.relation}</td><td>{x.type}</td><td>{x.size}</td><td><Status>{x.status}</Status></td></tr>)}/>:<div className="prst-empty"><strong>Sin documentos cargados</strong><p>No hay documentos de repositorio para este inversionista en la vista previa.</p></div>}
 </Card>
 </>}

function Reports(){return <>
 <section className="prst-metrics">
  <Metric label="Inversionistas activos" value="3" hint="expedientes habilitados"/>
  <Metric label="Capital activo" value={money(12000)} hint="inversiones vigentes" tone="money"/>
  <Metric label="Referencia anual" value={money(1360)} hint="referencia anual" tone="money"/>
  <Metric label="Rendimientos pagados" value={money(270)} hint="pagos vigentes"/>
  <Metric label="Capital devuelto" value={money(12000)} hint="devoluciones"/>
  <Metric label="Vencidas" value="1" hint="requiere seguimiento" tone="warn"/>
 </section>
 <Card title="Inversiones" kicker="REPORTES GERENCIALES">
  <label className="prst-report-picker"><span>Tipo de reporte</span><select defaultValue="INVESTMENTS"><option value="INVESTMENTS">Inversiones</option><option value="INVESTORS">Inversionistas</option><option value="APPLICATIONS">Solicitudes</option><option value="PAYMENTS">Pagos</option><option value="MATURITIES">Vencimientos</option><option value="RENEWALS">Renovaciones</option><option value="DOCUMENTS">Documentos</option></select></label>
  <Table headers={['Código','Inversionista','Capital','Plazo','Otorgada','Vence','Ganancia','Estado']} rows={demo.investments.map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td><b>{money(x.capital)}</b></td><td>{x.term} meses</td><td>{x.granted}</td><td>{x.maturity}</td><td>{money(x.gain)}</td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}

function Audit(){return <>
 <section className="prst-investor-summary"><article><span>Eventos cargados</span><strong>4</strong><small>últimos movimientos</small></article><article><span>Expedientes</span><strong>1</strong><small>cambios de inversionistas</small></article><article><span>Financieros</span><strong>2</strong><small>solicitudes y pagos</small></article><article><span>Documentales</span><strong>1</strong><small>archivos</small></article></section>
 <Card title="Auditoría del ERP" kicker="TRAZABILIDAD">
  <Table headers={['Fecha y hora','Categoría','Acción','Inversionista','Responsable']} rows={demo.audit.map((x,i)=><tr key={i}><td><b>{x.date}</b></td><td><span className="prst-audit-category">{x.category}</span></td><td>{x.action}</td><td>{x.investor}</td><td>{x.actor}</td></tr>)}/>
 </Card>
 </>}


function Configuration(){return <>
 <section className="prst-investor-summary prst-config-summary">
  <article><span>Empresa</span><strong>Prestadito$ El Salvador</strong><small>vertical de inversionistas</small></article>
  <article><span>Tu rol</span><strong>owner</strong><small>permisos efectivos</small></article>
  <article><span>Plazos configurados</span><strong>3</strong><small>6, 12, 18 meses</small></article>
  <article><span>Rendimiento</span><strong>10 · 12 · 15%</strong><small>tasas anuales por monto</small></article>
 </section>
 <Card title="Reglas y catálogos de Prestadito$" kicker="CONFIGURACIÓN OPERATIVA">
  <div className="prst-config-sections">
   <section><div className="prst-section-title">Plazos disponibles</div><p className="prst-copy">Opciones sugeridas para solicitudes y renovaciones.</p><div className="prst-chip-list"><span>6 meses</span><span>12 meses</span><span>18 meses</span></div></section>
   <section><div className="prst-section-title">Formas de pago</div><p className="prst-copy">Catálogo de uso operativo.</p><div className="prst-chip-list"><span>Transferencia bancaria</span><span>Depósito</span><span>Efectivo</span></div></section>
   <section><div className="prst-section-title">Lugares de pago</div><p className="prst-copy">Nombres consistentes en el ERP.</p><div className="prst-chip-list"><span>Oficina central</span><span>Banco</span></div></section>
   <section><div className="prst-section-title">Rendimiento financiero</div><div className="prst-config-locked"><div><span>Tasas anuales</span><strong>10% · 12% · 15% anual</strong></div><p>Ejemplos provisionales por monto hasta recibir la tabla real.</p><div className="prst-rate-tier-list"><span>$1,000 a $4,999.99 → <b>10% anual</b></span><span>$5,000 a $9,999.99 → <b>12% anual</b></span><span>$10,000 en adelante → <b>15% anual</b></span></div></div></section>
  </div>
 </Card>
 <Card title="Matriz de acceso" kicker="PERMISOS EFECTIVOS">
  <Table headers={['Acción','Propietario','Administrador','Personal','Otros']} rows={[
   ['Consultar información','Sí','Sí','Sí','Sí'],
   ['Registrar solicitudes','Sí','Sí','Sí','No'],
   ['Aprobar solicitudes','Sí','Sí','No','No'],
   ['Formalizar inversiones','Sí','Sí','No','No'],
   ['Registrar / revertir pagos','Sí','Sí','No','No'],
   ['Modificar configuración','Sí','Sí','No','No'],
  ].map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{j===0?<b>{cell}</b>:cell}</td>)}</tr>)}/>
 </Card>
 </>}


function Contracts(){return <>
 <section className="prst-investor-summary prst-contracts-summary"><article><span>Contratos preparados</span><strong>2</strong><small>documentos operativos</small></article><article><span>Firmados</span><strong>1</strong><small>con documento archivado</small></article><article><span>Pendientes de firma</span><strong>1</strong><small>requieren seguimiento</small></article><article><span>Porcentajes disponibles</span><strong>10 · 12 · 15%</strong><small>tasas anuales</small></article></section>
 <Card title="Control contractual" kicker="CONTRATOS / PDF / FIRMA">
  <div className="prst-note"><strong>Confirmado:</strong> 10%, 12% y 15% son tasas anuales. Por ahora usamos como ejemplo: $1,000–$4,999.99 = 10%, $5,000–$9,999.99 = 12% y $10,000+ = 15%.</div>
  <Table headers={['Contrato','Inversionista','Inversión','Capital','Porcentaje','Estado']} rows={demo.contracts.map(x=><tr key={x.code}><td><b>{x.code}</b><small>{x.number}</small></td><td>{x.investor}</td><td>{x.investment}</td><td>{money(x.capital)}</td><td><b>{x.rate}% anual</b><small>según monto de ejemplo</small></td><td><Status tone={x.status==='Firmado'?'active':'review'}>{x.status}</Status></td></tr>)}/>
 </Card>
 </>}


function Simulator(){
 const [amount,setAmount]=useState('5000')
 const [term,setTerm]=useState('12')
 const value=Number(amount||0)
 const rate=value>=10000?15:value>=5000?12:value>=1000?10:10
 const annual=value*rate/100
 const selected=Number(term)===12?annual:null
 return <>
  <section className="prst-investor-summary prst-simulator-summary">
   <article><span>Monto simulado</span><strong>{money(value)}</strong><small>capital de referencia</small></article>
   <article><span>Tasa anual</span><strong>{rate}%</strong><small>rango provisional</small></article>
   <article><span>Referencia anual</span><strong>{money(annual)}</strong><small>capital × tasa anual</small></article>
   <article><span>Plazo</span><strong>{term} meses</strong><small>{selected==null?'prorrateo pendiente':'equivale a un año'}</small></article>
  </section>
  <section className="prst-grid form-list">
   <Card title="Simular una inversión" kicker="SIMULADOR">
    <div className="prst-form-grid">
     <label className="prst-field"><span>Monto a invertir</span><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     <label className="prst-field"><span>Plazo</span><div className="prst-input-suffix"><input type="number" value={term} onChange={e=>setTerm(e.target.value)}/><span>meses</span></div></label>
    </div>
    <div className="prst-rate-reference"><span><b>Tasa anual sugerida</b><strong>{rate}%</strong></span><span><b>Ganancia anual de referencia</b><strong>{money(annual)}</strong></span><span><b>Ganancia del plazo seleccionado</b><strong>{selected==null?'Pendiente de regla':money(selected)}</strong></span><span><b>Total a 12 meses</b><strong>{money(value+annual)}</strong></span><small>{Number(term)===12?'Para 12 meses la referencia anual coincide con el plazo simulado.':'Para este plazo todavía no se calcula automáticamente el rendimiento hasta recibir la regla de prorrateo.'}</small></div>
   </Card>
   <Card title="Tasas anuales por monto" kicker="EJEMPLOS PROVISIONALES">
    <div className="prst-simulator-examples"><article><span>$1,000 a $4,999.99</span><strong>10% anual</strong><small>Ejemplo: $2,000 → $200 al año</small></article><article><span>$5,000 a $9,999.99</span><strong>12% anual</strong><small>Ejemplo: $7,500 → $900 al año</small></article><article><span>$10,000 en adelante</span><strong>15% anual</strong><small>Ejemplo: $15,000 → $2,250 al año</small></article></div>
   </Card>
  </section>
 </>}

function Statement(){return <>
 <section className="prst-investor-summary prst-statement-summary"><article><span>Capital vigente</span><strong>{money(4000)}</strong><small>saldo actual</small></article><article><span>Capital histórico</span><strong>{money(4000)}</strong><small>formalizado</small></article><article><span>Rendimientos pagados</span><strong>{money(150)}</strong><small>movimientos vigentes</small></article><article><span>Capital devuelto</span><strong>{money(0)}</strong><small>devoluciones</small></article></section>
 <Card title="Estado de cuenta · Carlos Ernesto Mejía" kicker="ESTADO DE CUENTA">
  <div className="prst-profile-grid"><article><small>Código</small><b>INV-2026-001284</b><span>DUI 01234567-8</span></article><article><small>Inversiones</small><b>1</b><span>1 vigente</span></article><article><small>Tasa</small><b>10% anual</b><span>rango provisional</span></article><article><small>Beneficiarios</small><b>2</b><span>100% asignado</span></article></div>
  <Table headers={['Inversión','Capital','Tasa anual','Inicio','Vence','Capital pendiente','Estado']} rows={[<tr key="s1"><td>INVEST-20260901-A1B2C3</td><td>{money(4000)}</td><td>10% anual</td><td>01 sep 2026</td><td>01 sep 2027</td><td><b>{money(4000)}</b></td><td><Status>Activa</Status></td></tr>]}/>
  <div className="prst-note"><strong>PDF:</strong> en la versión operativa se puede imprimir o guardar este estado de cuenta como PDF.</div>
 </Card>
 </>}

function MonthlyCloseout(){return <>
 <section className="prst-investor-summary prst-closeout-summary"><article><span>Cierres guardados</span><strong>2</strong><small>todas las versiones</small></article><article><span>Meses cerrados</span><strong>1</strong><small>septiembre 2026</small></article><article><span>Último período</span><strong>sep 2026</strong><small>CIE-202609-V02</small></article><article><span>Modo</span><strong>Snapshot</strong><small>no bloquea movimientos</small></article></section>
 <Card title="CIE-202609-V02 · septiembre 2026" kicker="CIERRE MENSUAL">
  <section className="prst-metrics prst-closeout-detail"><article><span>Nuevas inversiones</span><strong>1</strong><small>formalizadas</small></article><article><span>Capital formalizado</span><strong>{money(4000)}</strong><small>del período</small></article><article><span>Rendimientos pagados</span><strong>{money(270)}</strong><small>vigentes</small></article><article><span>Capital devuelto</span><strong>{money(12000)}</strong><small>vigente</small></article><article><span>Vencimientos</span><strong>1</strong><small>del período</small></article><article><span>Renovaciones</span><strong>1</strong><small>ejecutadas</small></article></section>
  <div className="prst-note"><strong>No destructivo:</strong> el cierre conserva versiones y no modifica inversiones, pagos ni contratos.</div>
 </Card>
 </>}

function TechnicalAudit(){return <>
 <section className="prst-investor-summary prst-tech-audit-summary"><article><span>Estado general</span><strong>Correcto</strong><small>sin inconsistencias demo</small></article><article><span>Errores</span><strong>0</strong><small>integridad crítica</small></article><article><span>Advertencias</span><strong>0</strong><small>requieren verificación</small></article><article><span>Controles</span><strong>6</strong><small>seguridad implementada</small></article></section>
 <Card title="Integridad del vertical" kicker="AUDITORÍA TÉCNICA"><div className="prst-tech-ok"><strong>Sin inconsistencias detectadas.</strong><span>Inversiones, pagos, contratos, documentos y renovaciones mantienen consistencia en la muestra.</span></div></Card>
 <Card title="Controles implementados" kicker="ARQUITECTURA DE SEGURIDAD"><div className="prst-security-checks">{['Aislamiento por empresa','Pagos protegidos','Inversiones protegidas','Documentos privados','Contratos auditados','Cierres no destructivos'].map(x=><article key={x}><span>✓</span><div><strong>{x}</strong><small>Control activo en el vertical de inversionistas.</small></div></article>)}</div></Card>
 </>}

function Notifications({onGo}){
 const typeLabels={MATURITY:'Vencimiento',CONTRACT:'Contrato',APPLICATION:'Solicitud',DOCUMENTS:'Documentación',PAYMENT:'Liquidación',RENEWAL:'Renovación'}
 const priorityLabels={CRITICAL:'Crítica',HIGH:'Alta',MEDIUM:'Media'}
 const items=[
  {id:'n1',priority:'CRITICAL',type:'MATURITY',title:'Inversión vencida',detail:'José Roberto Hernández · INVEST-20260310-G7H8I9 · 11 días vencida',tab:'Vencimientos'},
  {id:'n2',priority:'HIGH',type:'CONTRACT',title:'Contrato pendiente de firma',detail:'María Elena López · CTR-20260815-EF34GH',tab:'Contratos'},
  {id:'n3',priority:'HIGH',type:'APPLICATION',title:'Solicitud pendiente de firma',detail:'Carlos Ernesto Mejía · SOL-20260918-A2F811',tab:'Solicitudes'},
  {id:'n4',priority:'MEDIUM',type:'DOCUMENTS',title:'Expediente revisado',detail:'José Roberto Hernández · documentación en seguimiento',tab:'Inversionistas'},
  {id:'n5',priority:'MEDIUM',type:'DOCUMENTS',title:'Documento archivado',detail:'Carlos Ernesto Mejía · comprobante anterior',tab:'Documentos'},
  {id:'n6',priority:'MEDIUM',type:'RENEWAL',title:'Seguimiento archivado',detail:'José Roberto Hernández · renovación registrada',tab:'Renovaciones'},
 ]
 const [states,setStates]=useState({n1:'OPEN',n2:'OPEN',n3:'OPEN',n4:'READ',n5:'DISMISSED',n6:'DISMISSED'})
 const [view,setView]=useState('OPEN')
 const [search,setSearch]=useState('')
 const [priority,setPriority]=useState('ALL')
 const [type,setType]=useState('ALL')
 const counts={
  OPEN:items.filter(x=>states[x.id]==='OPEN').length,
  READ:items.filter(x=>states[x.id]==='READ').length,
  DISMISSED:items.filter(x=>states[x.id]==='DISMISSED').length,
 }
 const priorityCount=value=>items.filter(x=>states[x.id]==='OPEN'&&x.priority===value).length
 const q=search.trim().toLowerCase()
 const rows=items.filter(x=>states[x.id]===view)
 const filtered=rows.filter(x=>(priority==='ALL'||x.priority===priority)&&(type==='ALL'||x.type===type)&&(!q||(x.title+' '+x.detail+' '+typeLabels[x.type]).toLowerCase().includes(q)))
 const move=(id,next)=>setStates(current=>({...current,[id]:next}))
 const hasFilters=Boolean(search.trim()||priority!=='ALL'||type!=='ALL')
 const clearFilters=()=>{setSearch('');setPriority('ALL');setType('ALL')}
 const viewLabels={OPEN:'Abiertas',READ:'Revisadas',DISMISSED:'Archivadas'}

 return <section className="prst-alerts-module">
  <section className="prst-investor-summary prst-alert-summary">
   <article><span>Críticas abiertas</span><strong>{priorityCount('CRITICAL')}</strong><small>acción inmediata</small></article>
   <article><span>Altas abiertas</span><strong>{priorityCount('HIGH')}</strong><small>requieren atención</small></article>
   <article><span>Revisadas</span><strong>{counts.READ}</strong><small>siguen activas</small></article>
   <article><span>Archivadas</span><strong>{counts.DISMISSED}</strong><small>historial personal</small></article>
  </section>

  <article className="prst-card prst-notification-center-card">
   <div className="prst-card-head prst-notification-head">
    <div><small>SEGUIMIENTO OPERATIVO</small><h2>Centro de notificaciones</h2><p>Atendé primero lo importante, revisá pendientes y conservá un historial personal sin modificar la operación financiera.</p></div>
    <div className="prst-notification-head-status"><span>Abiertas</span><strong>{counts.OPEN}</strong></div>
   </div>

   <div className="prst-notification-commandbar">
    <div className="prst-notification-tabs">{Object.entries(viewLabels).map(([value,label])=><button key={value} type="button" className={view===value?'active':''} onClick={()=>setView(value)}>{label}<span>{counts[value]}</span></button>)}</div>
    <div className="prst-alert-filters">
     <input className="prst-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar notificación o inversionista"/>
     <select value={priority} onChange={e=>setPriority(e.target.value)}><option value="ALL">Todas las prioridades</option><option value="CRITICAL">Críticas</option><option value="HIGH">Altas</option><option value="MEDIUM">Medias</option></select>
     <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Todos los tipos</option>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
     {hasFilters&&<button type="button" className="prst-filter-clear" onClick={clearFilters}>Limpiar</button>}
    </div>
   </div>

   <div className="prst-notification-workspace">
    <section className="prst-notification-feed">
     <header className="prst-notification-feed-head"><div><span>BANDEJA</span><strong>{viewLabels[view]}</strong></div><b>{filtered.length} resultado{filtered.length===1?'':'s'}</b></header>
     {!filtered.length?<div className="prst-empty"><strong>Sin notificaciones</strong><p>No hay elementos que coincidan con los filtros actuales.</p></div>:<div className="prst-alert-list">
      {filtered.map(row=><article key={row.id} className={'prst-operational-alert '+row.priority.toLowerCase()}>
       <div className="prst-alert-icon">{row.priority==='CRITICAL'?'!':row.priority==='HIGH'?'↑':'•'}</div>
       <div className="prst-alert-copy"><div><span>{typeLabels[row.type]}</span><b>{priorityLabels[row.priority]}</b></div><strong>{row.title}</strong><small>{row.detail}</small></div>
       <div className="prst-notification-actions">
        {view!=='DISMISSED'&&<button type="button" className="primary" onClick={()=>onGo?.(row.tab)}>Abrir</button>}
        {view==='OPEN'&&<button type="button" className="secondary" onClick={()=>move(row.id,'READ')}>Marcar revisada</button>}
        {view!=='DISMISSED'&&<button type="button" className="archive" onClick={()=>move(row.id,'DISMISSED')}>Archivar</button>}
        {view==='DISMISSED'&&<button type="button" className="restore" onClick={()=>move(row.id,'OPEN')}>Restaurar</button>}
       </div>
      </article>)}
     </div>}
    </section>

    <aside className="prst-notification-insights">
     <section className="prst-notification-side-block">
      <small>PRIORIDADES ABIERTAS</small><h3>Atención operativa</h3>
      <div className="prst-priority-overview">
       <div className="critical"><i></i><span><b>Críticas</b><small>Atención inmediata</small></span><strong>{priorityCount('CRITICAL')}</strong></div>
       <div className="high"><i></i><span><b>Altas</b><small>Requieren seguimiento</small></span><strong>{priorityCount('HIGH')}</strong></div>
       <div className="medium"><i></i><span><b>Medias</b><small>Control preventivo</small></span><strong>{priorityCount('MEDIUM')}</strong></div>
      </div>
     </section>

     <section className="prst-notification-side-block">
      <small>VIGILANCIA AUTOMÁTICA</small><h3>Qué está revisando</h3>
      <div className="prst-notification-rule-list">
       <div><b>01</b><span>Inversiones vencidas y próximas a vencer en 30 días.</span></div>
       <div><b>02</b><span>Contratos pendientes de preparación o firma.</span></div>
       <div><b>03</b><span>Expedientes con foto o DUI incompletos.</span></div>
       <div><b>04</b><span>Fondos recibidos sin formalizar.</span></div>
       <div><b>05</b><span>Capital pendiente de devolución.</span></div>
       <div><b>06</b><span>Renovaciones pendientes de ejecutar.</span></div>
      </div>
     </section>

     <div className="prst-notification-scope-note"><strong>Rendimientos</strong><span>No se inventan fechas ni cuotas mientras falte la regla real para plazos distintos de 12 meses.</span></div>
    </aside>
   </div>
  </article>
 </section>
}

function PreviewSearch({onOpen}){
 const [query,setQuery]=useState('')
 const rows=useMemo(()=>{
  const q=query.trim().toLowerCase()
  if(q.length<2)return []
  const results=[]
  demo.investors.forEach(x=>{if((x.name+' '+x.dui+' '+x.code).toLowerCase().includes(q))results.push({type:'Inversionista',title:x.name,sub:x.code+' · '+x.dui})})
  demo.investments.forEach(x=>{if((x.code+' '+x.name).toLowerCase().includes(q))results.push({type:'Inversión',title:x.code,sub:x.name+' · '+money(x.capital)})})
  demo.contracts.forEach(x=>{if((x.code+' '+x.number+' '+x.investor).toLowerCase().includes(q))results.push({type:'Contrato',title:x.code,sub:x.investor+' · '+x.number})})
  demo.payments.forEach(x=>{if((x.code+' '+x.name+' '+x.investment).toLowerCase().includes(q))results.push({type:'Pago',title:x.code,sub:x.name+' · '+money(x.amount)})})
  demo.documents.forEach(x=>{if((x.code+' '+x.title+' '+x.investor).toLowerCase().includes(q))results.push({type:'Documento',title:x.code,sub:x.investor+' · '+x.title})})
  return results.slice(0,8)
 },[query])
 return <div className="prst-global-search">
  <div className="prst-global-search-input"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nombre, DUI, inversión, contrato, pago o documento"/>{query?<button type="button" onClick={()=>setQuery('')}>×</button>:<span/>}</div>
  {query.trim().length>=2&&<div className="prst-global-search-results"><div className="prst-global-search-head"><b>{rows.length} resultados</b><span>Vista previa</span></div>{rows.length?rows.map((row,i)=><button type="button" key={i} onClick={()=>{onOpen();setQuery('')}}><span className="prst-search-icon">{row.type[0]}</span><span className="prst-search-copy"><b>{row.title}</b><small>{row.sub}</small></span><span className="prst-search-type">{row.type}</span></button>):<div className="prst-global-search-empty">Sin coincidencias.</div>}</div>}
 </div>
}

function Agenda({onGo}){
 const items=[
  {id:'g1',date:'10 sep',state:'overdue',window:'TODAY',type:'Vencimiento',priority:'Crítica',title:'Vencimiento de inversión',detail:'José Roberto Hernández · INVEST-20260310-G7H8I9',tab:'Vencimientos'},
  {id:'g2',date:'Hoy',state:'high',window:'TODAY',type:'Contrato',priority:'Alta',title:'Contrato pendiente de firma',detail:'María Elena López · CTR-20260815-EF34GH',tab:'Contratos'},
  {id:'g3',date:'Hoy',state:'medium',window:'TODAY',type:'Documentación',priority:'Media',title:'Completar expediente',detail:'José Roberto Hernández · falta DUI reverso',tab:'Perfil 360'},
  {id:'g4',date:'24 sep',state:'high',window:'WEEK',type:'Revisión',priority:'Alta',title:'Revisar solicitud',detail:'Carlos Ernesto Mejía · SOL-20260918-A2F811',tab:'Solicitudes'},
  {id:'g5',date:'05 oct',state:'medium',window:'MONTH',type:'Renovación',priority:'Media',title:'Gestionar renovación',detail:'José Roberto Hernández · REN-20260910-AB1234',tab:'Renovaciones'},
 ]
 const [view,setView]=useState('WEEK')
 const [search,setSearch]=useState('')
 const [type,setType]=useState('ALL')
 const rank={TODAY:0,WEEK:1,MONTH:2}
 const counts={
  TODAY:items.filter(x=>rank[x.window]<=0).length,
  WEEK:items.filter(x=>rank[x.window]<=1).length,
  MONTH:items.length,
 }
 const q=search.trim().toLowerCase()
 const rows=items
  .filter(x=>rank[x.window]<=rank[view])
  .filter(x=>(type==='ALL'||x.type===type)&&(!q||(x.title+' '+x.detail+' '+x.type).toLowerCase().includes(q)))
 return <section className="prst-agenda-module">
  <section className="prst-investor-summary prst-agenda-summary">
   <article><span>Vencidos</span><strong>1</strong><small>fechas anteriores a hoy</small></article>
   <article><span>Para hoy</span><strong>2</strong><small>seguimientos pendientes</small></article>
   <article><span>Próximos 7 días</span><strong>{counts.WEEK}</strong><small>agenda operativa</small></article>
   <article><span>Total activos</span><strong>{items.length}</strong><small>eventos derivados del ERP</small></article>
  </section>

  <article className="prst-card prst-agenda-center-card">
   <div className="prst-card-head"><div><small>AGENDA OPERATIVA</small><h2>Seguimiento diario y semanal</h2><p>Una vista de fechas críticas y pendientes operativos del proceso de inversión.</p></div></div>

   <div className="prst-agenda-view-tabs">
    {[['TODAY','Hoy / vencidos'],['WEEK','7 días'],['MONTH','30 días']].map(([value,label])=><button key={value} type="button" className={view===value?'active':''} onClick={()=>setView(value)}>{label}<span>{counts[value]}</span></button>)}
   </div>

   <div className="prst-agenda-filters">
    <input className="prst-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar evento o inversionista"/>
    <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">Todos los tipos</option>{['Vencimiento','Contrato','Documentación','Revisión','Renovación'].map(label=><option key={label} value={label}>{label}</option>)}</select>
    <span>{rows.length} evento{rows.length===1?'':'s'}</span>
   </div>

   {!rows.length?<div className="prst-empty"><strong>Agenda despejada</strong><p>No hay eventos para los filtros actuales.</p></div>:<div className="prst-agenda-list">
    {rows.map(row=><article key={row.id} className={row.state}>
     <div className="prst-agenda-date"><b>{row.date}</b><small>{row.state==='overdue'?'Vencido':row.date==='Hoy'?'Hoy':'Programado'}</small></div>
     <div className="prst-agenda-copy"><div><span>{row.type}</span><b>{row.priority}</b></div><strong>{row.title}</strong><small>{row.detail}</small></div>
     <button type="button" onClick={()=>onGo?.(row.tab)}>Abrir</button>
    </article>)}
   </div>}
  </article>

  <article className="prst-card prst-agenda-note prst-agenda-scope-card">
   <div className="prst-card-head"><div><small>ALCANCE</small><h2>Qué fechas utiliza la agenda</h2><p>Solo muestra fechas existentes en el ERP y pendientes sin fecha límite.</p></div></div>
   <div className="prst-alert-rules">
    <span>Vencimiento de cada inversión.</span>
    <span>Inicio solicitado cuando existe.</span>
    <span>Vencimiento ligado a renovaciones.</span>
    <span>Pendientes sin fecha se muestran como seguimiento de hoy.</span>
   </div>
  </article>
 </section>
}

function Profile360({investorId='i1',onGo}){
 const investor=demo.investors.find(x=>x.id===investorId)||demo.investors[0]
 const invs=demo.investments.filter(x=>x.name===investor.name)
 const payments=demo.payments.filter(x=>x.name===investor.name)
 const contracts=demo.contracts.filter(x=>x.investor===investor.name)
 const beneficiaries=demo.beneficiaries.filter(x=>x.investor===investor.name)
 const documents=demo.documents.filter(x=>x.investor===investor.name)
 const renewals=demo.renewals.filter(x=>x.name===investor.name)
 const active=invs.filter(x=>x.status==='Activa')
 const capital=active.reduce((s,x)=>s+x.capital,0)
 const yields=payments.filter(x=>x.type==='Rendimiento').reduce((s,x)=>s+x.amount,0)
 const returned=payments.filter(x=>x.type==='Devolución de capital').reduce((s,x)=>s+x.amount,0)
 const next=active[0]
 return <div className="prst-profile360-page">
 <Card title={investor.name} kicker="PERFIL 360">
  <div className="prst-profile360-context"><span>{investor.code}</span><b>DUI {investor.dui}</b><small>{investor.phone} · {investor.email}</small></div>
  <div className="prst-profile360-actions"><button type="button" onClick={()=>onGo?.('Estado de cuenta')}><b>Estado de cuenta</b><small>Resumen y PDF</small></button><button type="button" onClick={()=>onGo?.('Contratos')}><b>Contrato</b><small>{contracts[0]?.code||'Sin contrato activo'}</small></button><button type="button" onClick={()=>onGo?.('Rendimientos')}><b>Registrar pago</b><small>Rendimiento o capital</small></button><button type="button" onClick={()=>onGo?.('Renovaciones')}><b>Renovación</b><small>Gestionar vencimiento</small></button><button type="button" onClick={()=>onGo?.('Documentos')}><b>Documentos</b><small>Expediente privado</small></button></div>
 </Card>
 <section className="prst-investor-summary prst-profile360-summary"><article><span>Capital vigente</span><strong>{money(capital)}</strong><small>{active.length} inversión{active.length===1?'':'es'} vigente{active.length===1?'':'s'}</small></article><article><span>Rendimientos pagados</span><strong>{money(yields)}</strong><small>pagos vigentes</small></article><article><span>Capital devuelto</span><strong>{money(returned)}</strong><small>histórico</small></article><article><span>Próximo vencimiento</span><strong>{next?.maturity||'Sin fecha próxima'}</strong><small>{next?.code||'sin inversión activa'}</small></article></section>
 <section className="prst-grid two">
  <Card title="Expediente del inversionista" kicker="DATOS PERSONALES"><div className="prst-profile-grid"><article><small>Nombre</small><b>{investor.name}</b><span>DUI {investor.dui}</span></article><article><small>Contacto</small><b>{investor.phone}</b><span>{investor.email}</span></article><article><small>Documentación</small><b>{investor.docs==='3/3'?'Completa':'Pendiente'}</b><span>{investor.docs} · rostro + DUI</span></article><article><small>Estado</small><b>{investor.status}</b><span>{investor.code}</span></article></div></Card>
  <Card title="Expediente relacionado" kicker="RESUMEN"><div className="prst-profile360-counters"><div><span>Solicitudes</span><strong>{demo.applications.filter(x=>x.name===investor.name).length}</strong></div><div><span>Contratos</span><strong>{contracts.length}</strong></div><div><span>Beneficiarios</span><strong>{beneficiaries.length}</strong></div><div><span>Documentos</span><strong>{documents.length}</strong></div><div><span>Pagos</span><strong>{payments.length}</strong></div><div><span>Renovaciones</span><strong>{renewals.length}</strong></div></div></Card>
 </section>
 <Card title="Capital y vigencias" kicker="INVERSIONES">{invs.length?<Table headers={['Inversión','Capital','Tasa anual','Inicio','Vence','Referencia anual','Estado']} rows={invs.map(x=><tr key={x.code}><td><b>{x.code}</b></td><td>{money(x.capital)}</td><td>{x.rate}% anual</td><td>{x.granted}</td><td>{x.maturity}</td><td><b>{money(x.gain)}</b></td><td><Status tone={x.status==='Vencida'?'rejected':'active'}>{x.status}</Status></td></tr>)}/>:<div className="prst-empty"><strong>Sin inversiones</strong><p>Este inversionista no tiene inversiones cargadas en la vista previa.</p></div>}</Card>
 </div>}

function EndToEndDemo(){const cases=[{amount:2000,rate:10,gain:200,name:'Ana Lucía Prueba',end:'Retiro finalizado'},{amount:7500,rate:12,gain:900,name:'Brenda Sofía Ejemplo',end:'Renovación ejecutada'},{amount:15000,rate:15,gain:2250,name:'Carlos Andrés Demostración',end:'No renovación y cierre'}];return <>
 <section className="prst-investor-summary prst-e2e-summary"><article><span>Casos ficticios</span><strong>3</strong><small>10%, 12% y 15% anual</small></article><article><span>Plazo</span><strong>12 meses</strong><small>sin asumir prorrateo</small></article><article><span>Recorrido</span><strong>Completo</strong><small>hasta cierre/renovación</small></article><article><span>Base real</span><strong>No usada</strong><small>prueba sin costo</small></article></section>
 <Card title="Recorrido integral con datos ficticios" kicker="PRUEBA SIN COSTO">
  <div className="prst-e2e-case-grid">{cases.map(row=><article key={row.rate}><span>{row.rate}% anual</span><strong>{row.name}</strong><b>{money(row.amount)} → {money(row.gain)} referencia anual</b><small>Expediente → Solicitud → Aprobación → Fondos → Inversión → Contrato → Pago → Vencimiento → {row.end} → Cierre mensual</small></article>)}</div>
  <div className="prst-note"><strong>Sin Supabase de pago:</strong> estos escenarios son locales y no modifican el proyecto principal.</div>
 </Card>
 </>}

function Readiness(){const rows=[['Listo','ERP funcional'],['Listo','Tasas 10%, 12% y 15% anual'],['Pendiente','Rangos reales por monto'],['Pendiente','Prorrateo para otros plazos'],['Pendiente','Contrato legal definitivo'],['Bloqueado','Base aislada de staging sin costo'],['Listo','CI general verde'],['Listo','Android / iPhone validados']];return <>
 <section className="prst-investor-summary prst-readiness-summary"><article><span>Listos</span><strong>2</strong><small>controles cerrados</small></article><article><span>Pendientes</span><strong>4</strong><small>requieren definición</small></article><article><span>Bloqueados</span><strong>1</strong><small>decisión externa</small></article><article><span>Producción</span><strong>No todavía</strong><small>rama protegida</small></article></section>
 <Card title="Checklist de liberación" kicker="CIERRE PARA PRODUCCIÓN"><div className="prst-readiness-list">{rows.map(([status,area])=><article key={area}><span className={'prst-readiness-status '+(status==='Listo'?'ready':status==='Bloqueado'?'blocked':'pending')}>{status}</span><div><strong>{area}</strong><small>{status==='Listo'?'Control cerrado.':'Debe resolverse antes de producción.'}</small></div></article>)}</div><div className="prst-note"><strong>Regla:</strong> mientras haya pendientes o bloqueos, no se considera lista para producción.</div></Card>
 </>}


function Exports(){return <>
 <section className="prst-investor-summary prst-export-summary"><article><span>Registros exportables</span><strong>31</strong><small>muestra cargada</small></article><article><span>Conjuntos</span><strong>11</strong><small>datos estructurados</small></article><article><span>Rol</span><strong>Propietario</strong><small>exportación permitida</small></article><article><span>Archivos privados</span><strong>3</strong><small>metadatos únicamente</small></article></section>
 <Card title="Exportación total de Prestadito$" kicker="RESPALDO Y EXPORTACIÓN"><div className="prst-note"><strong>JSON completo:</strong> inversionistas, solicitudes, inversiones, beneficiarios, pagos, contratos, renovaciones, documentos, auditoría y cierres. Los binarios privados no se incluyen.</div><div className="prst-export-grid">{['inversionistas','solicitudes','inversiones','beneficiarios','pagos','contratos','renovaciones','documentos','auditoría','cierres mensuales'].map(name=><article key={name}><div><strong>{name}</strong><small>datos de ejemplo</small></div><button>CSV</button></article>)}</div></Card>
 </>}

function Help(){return <>
 <section className="prst-investor-summary prst-help-summary"><article><span>Guías</span><strong>6</strong><small>procesos principales</small></article><article><span>Capacitación</span><strong>Disponible</strong><small>checklist paso a paso</small></article><article><span>Preguntas rápidas</span><strong>5</strong><small>reglas importantes</small></article><article><span>Avance</span><strong>—</strong><small>activá capacitación</small></article></section>
 <section className="prst-grid help-layout"><Card title="Manual de operación" kicker="AYUDA INTERNA"><div className="prst-help-guide-list">{['Registrar un inversionista','Registrar una solicitud','Formalizar una inversión','Registrar un pago','Gestionar una renovación','Generar cierre mensual'].map((x,i)=><button key={x} className={i===0?'active':''}><strong>{x}</strong><small>Guía paso a paso</small></button>)}</div></Card><Card title="Registrar un inversionista" kicker="GUÍA PASO A PASO"><div className="prst-training-steps">{['Abrí Inversionistas.','Completá nombres, apellidos y DUI.','Cargá rostro y DUI frente/reverso.','Revisá OCR si lo usás.','Guardá y verificá estado Activo.'].map((x,i)=><label key={x}><span>{i+1}</span><div><b>{x}</b></div></label>)}</div></Card></section>
 </>}
