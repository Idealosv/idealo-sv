import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-system-health.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const n=value=>Number(value||0)
const integrityLabels={
 duplicate_active_table_orders:'Mesas con más de un pedido activo',
 paid_total_mismatch:'Ventas pagadas que no cuadran con sus cobros',
 overpaid_orders:'Pedidos con sobrepago contable',
 available_table_with_open_order:'Mesas disponibles que aún tienen pedido abierto',
 busy_table_without_open_order:'Mesas ocupadas sin pedido activo',
 orphan_payments:'Cobros sin pedido válido',
 invalid_payments:'Cobros con monto o método inválido',
 broken_menu_products:'Productos activos de Carta con vínculo roto',
 active_menu_without_price:'Productos activos sin precio',
 active_menu_without_recipe:'Productos activos sin receta o consumo de inventario',
 broken_recipe_inventory:'Recetas con insumos inválidos',
 negative_inventory:'Insumos con existencia negativa',
 negative_location_stock:'Ubicaciones con existencia negativa',
 pending_cash_postings:'Cobros pendientes de conciliación financiera',
 stale_print_jobs:'Comandas pendientes de impresión por más de 15 minutos',
 rejected_dte:'DTE del bar rechazados',
}
const securityLabels={
 bar_tables_without_rls:'Tablas BAR sin RLS',
 bar_policies_for_anon:'Políticas BAR expuestas a anónimo',
 bar_functions_executable_by_anon:'Funciones BAR ejecutables sin iniciar sesión',
 direct_product_guard:'Protección de edición directa de productos',
 direct_inventory_guard:'Protección de edición directa de inventario',
 reservation_overlap_guard:'Protección contra reservas cruzadas',
 automatic_menu_rank:'Ranking automático por consumo',
}

export default function IdealoBarSystemHealth({company,supabase,access}){
 const companyId=company?.id
 const permissions=Array.isArray(access?.permissions)?access.permissions:[]
 const can=p=>permissions.includes('*')||permissions.includes(p)
 const canAdmin=can('admin.manage')
 const [health,setHealth]=useState(null)
 const [smoke,setSmoke]=useState(null)
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  setLoading(true);setError('')
  const {data,error:e}=await supabase.rpc('bar_release_health',{p_company_id:companyId})
  if(e)setError(e.message);else setHealth(data||null)
  setLoading(false)
 },[companyId,supabase])
 useEffect(()=>{load()},[load])

 const run=async(task,success)=>{
  setWorking(true);setError('');setNotice('')
  try{const result=await task();if(success)setNotice(typeof success==='function'?success(result):success);await load();return result}
  catch(e){setError(e.message||String(e));return null}
  finally{setWorking(false)}
 }
 const optimize=()=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_refresh_menu_popularity',{p_company_id:companyId});if(e)throw e;return data},r=>r?.message||'Carta optimizada.')
 const smokeTest=()=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_operational_smoke_test',{p_company_id:companyId});if(e)throw e;setSmoke(data||null);return data},r=>r?.ok?'Prueba integral terminada correctamente.':'La prueba integral detectó un problema.')

 const integrityIssues=useMemo(()=>Object.entries(health?.integrity||{}).filter(([,value])=>n(value)>0),[health])
 const securityRows=useMemo(()=>Object.entries(health?.security||{}),[health])
 const readinessChecks=Array.isArray(health?.readiness?.checks)?health.readiness.checks:[]
 const requiredPending=readinessChecks.filter(row=>row.required&&!row.ok)
 const optionalPending=readinessChecks.filter(row=>!row.required&&!row.ok)
 const techScore=n(health?.score)
 const setupScore=n(health?.readiness?.score)

 if(loading)return <section className="bar-health"><div className="bar-health-loading">Auditando IDEALO BAR…</div></section>

 return <section className="bar-health">
  <header className="bar-health-head">
   <div><span>CONTROL FINAL</span><h2>Salud integral de IDEALO BAR</h2><p>Seguridad, integridad, operación, inventario, caja y preparación comercial reunidos en una sola auditoría.</p></div>
   <button type="button" onClick={load} disabled={working}>↻ Auditar ahora</button>
  </header>

  {error&&<div className="bar-health-alert error">{error}</div>}
  {notice&&<div className="bar-health-alert ok">{notice}</div>}

  <div className="bar-health-score-grid">
   <article className={techScore===100?'ok':'warn'}><small>SALUD TÉCNICA</small><strong>{techScore}%</strong><span>{health?.healthy?'Sin fallas críticas detectadas':`${n(health?.critical_issues)} problema(s) crítico(s)`}</span></article>
   <article className={setupScore===100?'ok':'warn'}><small>PREPARACIÓN DEL NEGOCIO</small><strong>{setupScore}%</strong><span>{health?.readiness?.ready_for_sales?'Listo para vender':'Aún faltan datos reales para operar'}</span></article>
   <article><small>PEDIDOS ABIERTOS</small><strong>{n(health?.operations?.open_orders)}</strong><span>{n(health?.operations?.today_paid_orders)} pagado(s) hoy</span></article>
   <article><small>VENTAS DE HOY</small><strong>{money.format(n(health?.operations?.today_sales))}</strong><span>{n(health?.operations?.active_menu_items)} productos activos</span></article>
  </div>

  <div className="bar-health-grid">
   <article className="bar-health-card">
    <div className="bar-health-card-head"><div><small>INTEGRIDAD</small><h3>Datos y operación</h3></div><b className={integrityIssues.length?'bad':'good'}>{integrityIssues.length?`${integrityIssues.length} alertas`:'Correcto'}</b></div>
    {integrityIssues.length===0?<p className="bar-health-empty">No encontré ventas descuadradas, sobrepagos, inventario negativo, vínculos rotos ni mesas inconsistentes.</p>:<div className="bar-health-list">{integrityIssues.map(([key,value])=><div key={key}><span>{integrityLabels[key]||key}</span><strong>{String(value)}</strong></div>)}</div>}
   </article>

   <article className="bar-health-card">
    <div className="bar-health-card-head"><div><small>SEGURIDAD</small><h3>Protecciones activas</h3></div><b className={n(health?.security?.bar_functions_executable_by_anon)===0?'good':'bad'}>{n(health?.security?.bar_functions_executable_by_anon)===0?'Protegido':'Revisar'}</b></div>
    <div className="bar-health-list">{securityRows.map(([key,value])=>{const countKey=typeof value==='number';const ok=countKey?n(value)===0:Boolean(value);return <div key={key}><span>{securityLabels[key]||key}</span><strong className={ok?'good-text':'bad-text'}>{countKey?String(value):(value?'ACTIVO':'FALTA')}</strong></div>})}</div>
   </article>

   <article className="bar-health-card">
    <div className="bar-health-card-head"><div><small>PUESTA EN MARCHA</small><h3>Lo que falta realmente</h3></div><b className={requiredPending.length?'bad':'good'}>{requiredPending.length?`${requiredPending.length} obligatorio(s)`:'Obligatorios completos'}</b></div>
    {requiredPending.length===0?<p className="bar-health-empty">Los requisitos obligatorios de la empresa están completos.</p>:<div className="bar-health-list">{requiredPending.map(row=><div key={row.id}><span>{row.label}<small>{row.detail}</small></span><strong className="bad-text">PENDIENTE</strong></div>)}</div>}
    {optionalPending.length>0&&<details className="bar-health-details"><summary>{optionalPending.length} pendiente(s) de producción / equipo físico</summary>{optionalPending.map(row=><p key={row.id}><b>{row.label}</b><br/>{row.detail}</p>)}</details>}
   </article>

   <article className="bar-health-card">
    <div className="bar-health-card-head"><div><small>OPERACIÓN</small><h3>Estado en vivo</h3></div><b className={health?.runtime?.runtime_ready?'good':'bad'}>{health?.runtime?.runtime_ready?'Runtime listo':'Revisar runtime'}</b></div>
    <div className="bar-health-list">
     <div><span>Mesas activas</span><strong>{n(health?.operations?.active_tables)}</strong></div>
     <div><span>Cajas abiertas</span><strong>{n(health?.operations?.open_cash_sessions)}</strong></div>
     <div><span>Comandas pendientes</span><strong>{n(health?.operations?.pending_print_jobs)}</strong></div>
     <div><span>Advertencias</span><strong>{n(health?.warnings)}</strong></div>
    </div>
   </article>
  </div>

  {canAdmin&&<div className="bar-health-actions">
   <button type="button" onClick={optimize} disabled={working}>★ Reordenar Carta por consumo real</button>
   <button type="button" onClick={smokeTest} disabled={working}>✓ Ejecutar prueba integral reversible</button>
  </div>}

  {smoke&&<div className={`bar-health-smoke ${smoke.ok?'ok':'error'}`}><b>{smoke.ok?'PRUEBA INTEGRAL: OK':'PRUEBA INTEGRAL: ERROR'}</b><span>{smoke.ok?`Pedido ${smoke.order_status||'validado'} · mesa ${smoke.table_status||'validada'} · ${Number(smoke.split_paid||0)} pago(s) dividido(s) · cambio ${money.format(n(smoke.cash_change_test?.change))}`:(smoke.error||'Revisa los detalles de la auditoría.')}</span></div>}

  <footer className="bar-health-foot">Esta pantalla no inventa existencias, datos fiscales ni dispositivos físicos. Lo que depende del negocio real se muestra como pendiente en lugar de marcarlo falsamente como terminado.</footer>
 </section>
}
