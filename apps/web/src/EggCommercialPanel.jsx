import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const plans=[
 {name:'Básico',activation:150,monthly:30,items:['Operación mayorista','Precios y rentabilidad','Devoluciones y pérdidas','Reportes','Usuarios y roles']},
 {name:'Profesional',activation:250,monthly:60,items:['Todo Básico','Rutas y logística','Facturación Electrónica DTE','Gestión de crédito y cobros']},
 {name:'Empresarial',activation:350,monthly:90,items:['Todo Profesional','Clasificadora/pesadora','Integración UV','Reparto móvil Android/iPhone','Suite completa']}
]

export default function EggCommercialPanel({companyId}){
 const [audit,setAudit]=useState(null)
 const [history,setHistory]=useState([])
 const [stats,setStats]=useState({prices:0,customers:0,inventory:0,dteProcessed:0,routes:0})
 const [demo,setDemo]=useState(false)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [a,p,c,i,d,r,co]=await Promise.all([
   supabase.from('egg_audit_runs').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(8),
   supabase.from('egg_price_rules').select('id',{count:'exact',head:true}).eq('company_id',companyId).eq('active',true),
   supabase.from('egg_customers').select('id',{count:'exact',head:true}).eq('company_id',companyId).eq('active',true),
   supabase.from('egg_inventory_stock').select('stock_eggs').eq('company_id',companyId),
   supabase.from('egg_order_dte_links').select('id,dte_documents(status)').eq('company_id',companyId),
   supabase.from('egg_routes').select('id',{count:'exact',head:true}).eq('company_id',companyId),
   supabase.from('companies').select('demo_mode').eq('id',companyId).maybeSingle()
  ])
  for(const x of [a,p,c,i,d,r,co])if(x.error)throw x.error
  const runs=a.data||[];setHistory(runs);setAudit(runs[0]?{score:runs[0].score,status:runs[0].status,findings:runs[0].findings,metrics:runs[0].metrics}:null)
  setStats({prices:p.count||0,customers:c.count||0,inventory:(i.data||[]).reduce((s,x)=>s+Number(x.stock_eggs||0),0),dteProcessed:(d.data||[]).filter(x=>x.dte_documents?.status==='PROCESSED').length,routes:r.count||0})
  setDemo(Boolean(co.data?.demo_mode))
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(String(e?.message||e)))},[load])

 const runAudit=async()=>{
  setLoading(true);setError('');setNotice('')
  const {data,error}=await supabase.rpc('egg_run_audit',{p_company_id:companyId})
  if(error)setError(String(error.message||error));else{setAudit(data);setNotice('Auditoría alta completada: '+data.score+'/100 · '+data.status);await load()}
  setLoading(false)
 }

 const seedDemo=async()=>{
  if(!window.confirm('Esto cargará proveedores, clientes, lotes, inventario, precios, ventas y una ruta ficticia para demostración. ¿Continuar?'))return
  setLoading(true);setError('');setNotice('')
  const {data,error}=await supabase.rpc('egg_seed_commercial_demo',{p_company_id:companyId})
  if(error)setError(String(error.message||error));else{setNotice(data?.message||'Demo profesional cargada.');await load();await runAudit()}
  setLoading(false)
 }

 const checklist=useMemo(()=>[
  {label:'Integridad de datos',ok:audit?.status==='PASS',detail:audit?audit.score+'/100':'Auditoría pendiente'},
  {label:'Precios mayoristas',ok:stats.prices>0,detail:stats.prices+' reglas activas'},
  {label:'Clientes de muestra / reales',ok:stats.customers>0,detail:stats.customers+' clientes'},
  {label:'Inventario operativo',ok:stats.inventory>0,detail:Math.round(stats.inventory)+' huevos'},
  {label:'Logística',ok:stats.routes>0,detail:stats.routes+' rutas'},
  {label:'DTE TEST procesado',ok:stats.dteProcessed>0,detail:stats.dteProcessed>0?stats.dteProcessed+' aceptados':'Aún pendiente de validación MH TEST'}
 ],[audit,stats])
 const ready=checklist.filter(x=>x.ok).length

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <section className="eggs-commercial-hero">
   <div><small>PRODUCTO COMERCIAL IDEALO SV</small><h2>IDEALO Eggs</h2><p>Venta, distribución, clasificación, reparto y facturación electrónica para empresas mayoristas de huevos.</p></div>
   <div className="eggs-commercial-score"><span>Preparación comercial</span><strong>{ready}/{checklist.length}</strong><small>{ready===checklist.length?'Listo para demostración y validación final':'Hay validaciones pendientes'}</small></div>
  </section>

  <section className="eggs-two-column">
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>AUDITORÍA ALTA</small><h2>Integridad del sistema</h2><p>Comprueba inventario, lotes, ventas, cobros, rutas y consistencia financiera.</p></div><button onClick={runAudit} disabled={loading}>Ejecutar auditoría</button></div>
    {audit?<div className="eggs-audit-result">
     <div className={'eggs-audit-score '+String(audit.status||'').toLowerCase()}><strong>{audit.score}</strong><span>/100</span><small>{audit.status}</small></div>
     <div className="eggs-audit-findings">{(audit.findings||[]).length?(audit.findings||[]).map((f,i)=><div key={i}><span className={'eggs-pill '+(f.severity==='CRITICAL'||f.severity==='HIGH'?'danger':f.severity==='INFO'?'neutral':'warn')}>{f.severity}</span><p>{f.message}</p></div>):<p>Sin hallazgos.</p>}</div>
    </div>:<div className="eggs-empty">Ejecutá la primera auditoría.</div>}
   </article>

   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>DEMO PROFESIONAL</small><h2>Datos para presentación</h2><p>Proveedores, clientes, lotes, precios, ventas, inventario y ruta ficticia coherente.</p></div></div>
    <div className="eggs-demo-summary"><div><span>Modo</span><b>{demo?'DEMO / desarrollo':'Empresa real'}</b></div><div><span>Clientes</span><b>{stats.customers}</b></div><div><span>Inventario</span><b>{Math.round(stats.inventory)}</b></div><div><span>Precios</span><b>{stats.prices}</b></div></div>
    <button className="eggs-primary" disabled={loading||!demo} onClick={seedDemo}>{demo?'Cargar / completar demo profesional':'Disponible solo en entornos DEMO'}</button>
   </article>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>CHECKLIST DE SALIDA</small><h2>Preparación para cliente real</h2></div></div>
   <div className="eggs-readiness-grid">{checklist.map(x=><div key={x.label} className={x.ok?'ok':'pending'}><span>{x.ok?'✓':'!'}</span><div><b>{x.label}</b><small>{x.detail}</small></div></div>)}</div>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>PLANES DE VENTA</small><h2>Membresías IDEALO Eggs</h2><p>Configuración comercial para vender este vertical como parte de IDEALO SV.</p></div></div>
   <div className="eggs-plan-grid">{plans.map(plan=><article key={plan.name}><span>{plan.name}</span><div className="eggs-plan-price"><b>{money(plan.activation)}</b><small>activación</small></div><div className="eggs-plan-price"><b>{money(plan.monthly)}</b><small>mensual</small></div><ul>{plan.items.map(i=><li key={i}>{i}</li>)}</ul></article>)}</div>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Últimas auditorías</h2></div></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Puntaje</th><th>Estado</th><th>Hallazgos</th></tr></thead><tbody>
    {history.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('es-SV')}</td><td><b>{r.score}/100</b></td><td><span className={'eggs-pill '+(r.status==='PASS'?'good':r.status==='FAIL'?'danger':'warn')}>{r.status}</span></td><td>{(r.findings||[]).length}</td></tr>)}
    {!history.length&&<tr><td colSpan="4"><div className="eggs-empty">Sin auditorías registradas.</div></td></tr>}
   </tbody></table></div>
  </section>
 </div>
}
