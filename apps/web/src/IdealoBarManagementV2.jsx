import {useCallback,useEffect,useMemo,useState} from 'react'
import IdealoBarControlCenter from './IdealoBarControlCenter.jsx'
import './idealo-bar-management.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const num=value=>Number(value||0)
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dateTime=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):''

const ROLES={
 owner:{label:'Propietario',icon:'👑',text:'Control total del bar.'},
 manager:{label:'Gerente',icon:'🧭',text:'Administración y supervisión.'},
 cashier:{label:'Cajero',icon:'💵',text:'Cobros y caja.'},
 waiter:{label:'Mesero',icon:'🍽️',text:'Mesas, pedidos y atención.'},
 kitchen:{label:'Cocina',icon:'🍳',text:'Comandas de cocina.'},
 bar:{label:'Barra',icon:'🍺',text:'Bebidas y despacho.'},
 warehouse:{label:'Bodega',icon:'📦',text:'Inventario y reposición.'},
}

const TABS=[
 ['Dashboard','▦'],
 ['Personal y permisos','👥'],
 ['Rentabilidad','📈'],
 ['Controles del bar','🛡️'],
 ['Reportes','📊'],
 ['Auditoría','🔎'],
 ['Configuración','⚙️'],
]

const DEFAULT_SETTINGS={
 business_name:'IDEALO BAR',
 timezone:'America/El_Salvador',
 opening_time:'',
 closing_time:'',
 suggested_tip_percent:10,
 default_guest_count:1,
 manual_discounts_enabled:true,
 max_manual_discount_percent:20,
 require_void_reason:true,
 require_manager_after_send:true,
 default_dte_environment:'test',
 default_dte_type:'01',
 low_stock_notifications:true,
}

function Metric({label,value,tone=''}){
 return <div className={`barm-metric ${tone}`}><span>{label}</span><b>{value}</b></div>
}
function Empty({children}){return <div className="barm-empty">{children}</div>}
function Title({title,text}){return <div className="barm-section-title"><div><h3>{title}</h3><p>{text}</p></div></div>}

export default function IdealoBarManagementV2({company,supabase}){
 const companyId=company?.id
 const [tab,setTab]=useState('Dashboard')
 const [uid,setUid]=useState('')
 const [staff,setStaff]=useState([])
 const [settings,setSettings]=useState(DEFAULT_SETTINGS)
 const [dashboard,setDashboard]=useState(null)
 const [profitability,setProfitability]=useState([])
 const [performance,setPerformance]=useState([])
 const [report,setReport]=useState({daily:[],hourly:[],payment_methods:[],order_types:[]})
 const [adminAudit,setAdminAudit]=useState([])
 const [orderAudit,setOrderAudit]=useState([])
 const [inventoryAudit,setInventoryAudit]=useState([])
 const [range,setRange]=useState(()=>({from:today(),to:today()}))
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const run=useCallback(async(task,success)=>{
  setWorking(true);setError('');setNotice('')
  try{await task();if(success)setNotice(success)}
  catch(err){setError(String(err?.message||err||'No se pudo completar la operación.'))}
  finally{setWorking(false)}
 },[])

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const user=await supabase.auth.getUser()
   const userId=user.data?.user?.id||''
   setUid(userId)
   const [staffR,settingsR,adminR,ordersR,inventoryR,dashR,profitR,perfR,reportR]=await Promise.all([
    supabase.from('bar_staff_assignments').select('*').eq('company_id',companyId).order('display_name'),
    supabase.from('bar_settings').select('*').eq('company_id',companyId).maybeSingle(),
    supabase.from('bar_admin_audit').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(250),
    supabase.from('bar_order_events').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(250),
    supabase.from('bar_inventory_events').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(250),
    supabase.rpc('bar_management_dashboard',{p_company_id:companyId,p_from:range.from,p_to:range.to}),
    supabase.rpc('bar_product_profitability',{p_company_id:companyId,p_from:range.from,p_to:range.to}),
    supabase.rpc('bar_staff_performance',{p_company_id:companyId,p_from:range.from,p_to:range.to}),
    supabase.rpc('bar_management_report',{p_company_id:companyId,p_from:range.from,p_to:range.to}),
   ])
   if(staffR.error)throw staffR.error
   if(settingsR.error)throw settingsR.error
   setStaff(staffR.data||[])
   setSettings(settingsR.data?{...DEFAULT_SETTINGS,...settingsR.data}:DEFAULT_SETTINGS)
   setAdminAudit(adminR.error?[]:(adminR.data||[]))
   setOrderAudit(ordersR.error?[]:(ordersR.data||[]))
   setInventoryAudit(inventoryR.error?[]:(inventoryR.data||[]))
   setDashboard(dashR.error?null:dashR.data)
   setProfitability(profitR.error?[]:(profitR.data||[]))
   setPerformance(perfR.error?[]:(perfR.data||[]))
   setReport(reportR.error?{daily:[],hourly:[],payment_methods:[],order_types:[]}:(reportR.data||{}))
  }catch(err){setError(String(err?.message||err||'No se pudo cargar Administración.'))}
  finally{setLoading(false)}
 },[companyId,supabase,range.from,range.to])

 useEffect(()=>{load()},[load])

 const currentStaff=staff.find(row=>row.user_id===uid)
 const canManage=['owner','manager'].includes(currentStaff?.bar_role)
 const staffMap=useMemo(()=>new Map(staff.map(row=>[row.user_id,row.display_name])),[staff])
 const audit=useMemo(()=>{
  const rows=[]
  adminAudit.forEach(row=>rows.push({id:`a-${row.id}`,at:row.created_at,area:row.area,action:row.action,actor:row.actor_user_id,detail:row.entity_type}))
  orderAudit.forEach(row=>rows.push({id:`o-${row.id}`,at:row.created_at,area:'OPERACIÓN',action:row.event_type,actor:row.created_by,detail:row.reason||'Evento de pedido'}))
  inventoryAudit.forEach(row=>rows.push({id:`i-${row.id}`,at:row.created_at,area:'INVENTARIO',action:row.event_type,actor:row.created_by,detail:`${row.reason||'Movimiento'} · ${money.format(num(row.estimated_cost))}`}))
  return rows.sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,300)
 },[adminAudit,orderAudit,inventoryAudit])

 const saveStaff=(row,patch)=>run(async()=>{
  const result=await supabase.from('bar_staff_assignments').update(patch).eq('id',row.id).eq('company_id',companyId)
  if(result.error)throw result.error
  await load()
 },'Personal actualizado.')

 const saveSettings=()=>run(async()=>{
  const payload={
   ...DEFAULT_SETTINGS,
   ...settings,
   company_id:companyId,
   opening_time:settings.opening_time||null,
   closing_time:settings.closing_time||null,
  }
  delete payload.id
  const result=await supabase.from('bar_settings').upsert(payload,{onConflict:'company_id'})
  if(result.error)throw result.error
  await load()
 },'Configuración guardada y aplicada.')

 if(loading)return <div className="barm-loading"><b>IDEALO BAR</b><span>Cargando Centro Gerencial…</span></div>
 if(!canManage)return <section className="barm"><div className="barm-no-access"><span>🔒</span><h2>Administración restringida</h2><p>Esta área corresponde a Propietario o Gerente. Tu rol actual es <b>{ROLES[currentStaff?.bar_role]?.label||'sin asignar'}</b>.</p></div></section>

 return <section className="barm">
  <header className="barm-head">
   <div>
    <small>IDEALO BAR · CONTROL DEL NEGOCIO</small>
    <h2>Centro Gerencial</h2>
    <p>{settings.business_name||company?.name} · administración, rentabilidad, personal, caja y auditoría</p>
   </div>
   <div className="barm-head-actions">
    <label>Desde<input type="date" value={range.from} onChange={e=>setRange(v=>({...v,from:e.target.value}))}/></label>
    <label>Hasta<input type="date" value={range.to} onChange={e=>setRange(v=>({...v,to:e.target.value}))}/></label>
    <button type="button" onClick={load} disabled={working}>↻ Actualizar</button>
   </div>
  </header>

  {error&&<div className="barm-alert error">{error}<button onClick={()=>setError('')}>×</button></div>}
  {notice&&<div className="barm-alert ok">✓ {notice}<button onClick={()=>setNotice('')}>×</button></div>}

  <div className="barm-layout">
   <aside className="barm-nav">
    <strong>Administración</strong>
    {TABS.map(([name,icon])=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}><span>{icon}</span>{name}</button>)}
   </aside>

   <main className="barm-content">
    {tab==='Dashboard'&&<div className="barm-panel">
     <Title title="▦ Dashboard del propietario" text="Ventas, costos, utilidad y alertas del período seleccionado."/>
     <div className="barm-metrics">
      <Metric label="Venta neta" value={money.format(num(dashboard?.revenue))} tone="orange"/>
      <Metric label="Utilidad bruta" value={money.format(num(dashboard?.gross_profit))} tone="green"/>
      <Metric label="Margen bruto" value={`${num(dashboard?.gross_margin_percent).toFixed(1)}%`}/>
      <Metric label="Costo vendido" value={money.format(num(dashboard?.cogs))}/>
      <Metric label="Pedidos" value={num(dashboard?.orders)}/>
      <Metric label="Ticket promedio" value={money.format(num(dashboard?.average_ticket))}/>
      <Metric label="Propinas" value={money.format(num(dashboard?.tips))}/>
      <Metric label="Pérdidas controladas" value={money.format(num(dashboard?.controlled_loss_cost))} tone="red"/>
      <Metric label="Efectivo" value={money.format(num(dashboard?.cash))}/>
      <Metric label="Tarjeta" value={money.format(num(dashboard?.card))}/>
      <Metric label="Transferencia" value={money.format(num(dashboard?.transfer))}/>
      <Metric label="Aporte tras pérdidas" value={money.format(num(dashboard?.contribution_after_losses))} tone="green"/>
     </div>
     <div className="barm-summary-grid">
      <article><span>🏆 Producto líder</span><b>{dashboard?.top_product?.name||'Sin ventas todavía'}</b><p>{num(dashboard?.top_product?.quantity)} unidades · {money.format(num(dashboard?.top_product?.sales))}</p></article>
      <article><span>👤 Mejor mesero</span><b>{dashboard?.top_waiter?.name||'Sin datos'}</b><p>{num(dashboard?.top_waiter?.orders)} pedidos · {money.format(num(dashboard?.top_waiter?.sales))}</p></article>
      <article><span>🕐 Hora fuerte</span><b>{dashboard?.busiest_hour?.hour!==undefined?`${String(dashboard.busiest_hour.hour).padStart(2,'0')}:00`:'Sin datos'}</b><p>{num(dashboard?.busiest_hour?.orders)} pedidos</p></article>
      <article className={num(dashboard?.low_stock_items)>0?'warn':''}><span>⚠️ Atención</span><b>{num(dashboard?.low_stock_items)} stock bajo · {num(dashboard?.pending_cash_postings)} cobros pendientes</b><p>{num(dashboard?.pending_dte)} DTE pendientes · {num(dashboard?.voided_items)} anulaciones</p></article>
     </div>
    </div>}

    {tab==='Personal y permisos'&&<div className="barm-panel">
     <Title title="👥 Personal y permisos" text="Cada usuario de la empresa recibe aquí una función específica dentro del bar."/>
     <div className="barm-role-cards">
      {Object.entries(ROLES).map(([key,info])=><article key={key}><span>{info.icon}</span><b>{info.label}</b><p>{info.text}</p></article>)}
     </div>
     <div className="barm-table-wrap"><table><thead><tr><th>Persona</th><th>Rol del bar</th><th>Estado</th><th>Función</th></tr></thead><tbody>
      {staff.map(row=><tr key={row.id}>
       <td><b>{row.display_name}</b><small>{row.user_id===uid?'Tu usuario':''}</small></td>
       <td><select value={row.bar_role} disabled={row.bar_role==='owner'||working} onChange={e=>saveStaff(row,{bar_role:e.target.value})}>{Object.entries(ROLES).map(([key,info])=><option key={key} value={key}>{info.label}</option>)}</select></td>
       <td><button className={`barm-state ${row.active?'on':'off'}`} disabled={row.bar_role==='owner'||working} onClick={()=>saveStaff(row,{active:!row.active})}>{row.active?'Activo':'Inactivo'}</button></td>
       <td>{ROLES[row.bar_role]?.text||row.bar_role}</td>
      </tr>)}
     </tbody></table></div>
     <p className="barm-note">Propietario y Gerente siguen respaldados por los permisos centrales de IDEALO SV. Un owner central siempre conserva el rol Propietario del bar.</p>
    </div>}

    {tab==='Rentabilidad'&&<div className="barm-panel">
     <Title title="📈 Rentabilidad por producto" text="Venta neta versus costo realmente consumido por las recetas."/>
     {profitability.length?<div className="barm-table-wrap"><table><thead><tr><th>Producto</th><th>Vendidos</th><th>Venta neta</th><th>Costo receta/u.</th><th>Costo real</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>
      {profitability.map(row=><tr key={row.product_id}><td><b>{row.product_name}</b><small>{row.category}</small></td><td>{num(row.sold_quantity)}</td><td>{money.format(num(row.net_sales))}</td><td>{money.format(num(row.standard_unit_cost))}</td><td>{money.format(num(row.actual_cost))}</td><td><b>{money.format(num(row.gross_profit))}</b></td><td><span className={num(row.margin_percent)<25?'barm-bad':'barm-good'}>{num(row.margin_percent).toFixed(1)}%</span></td></tr>)}
     </tbody></table></div>:<Empty>No hay ventas pagadas en este rango todavía.</Empty>}
    </div>}

    {tab==='Controles del bar'&&<div className="barm-panel">
     <Title title="🛡️ Controles administrativos" text="Promociones, Happy Hour, Baldes/Hielerazos, cortesías, mermas, consumo interno, Caja, DTE y reposición."/>
     <div className="barm-embedded-control"><IdealoBarControlCenter company={company} supabase={supabase}/></div>
    </div>}

    {tab==='Reportes'&&<div className="barm-panel">
     <Title title="📊 Reportes gerenciales" text="El rango superior controla ventas por día, hora, método de pago, canal y personal."/>
     <div className="barm-report-grid">
      <div className="barm-box"><h4>Ventas por día</h4>{(report.daily||[]).length?(report.daily||[]).map(row=><div className="barm-report-row" key={row.day}><span>{row.day}</span><b>{money.format(num(row.sales))}</b><small>{row.orders} pedidos</small></div>):<Empty>Sin ventas.</Empty>}</div>
      <div className="barm-box"><h4>Ventas por hora</h4>{(report.hourly||[]).length?(report.hourly||[]).map(row=><div className="barm-report-row" key={row.hour}><span>{String(row.hour).padStart(2,'0')}:00</span><b>{money.format(num(row.sales))}</b><small>{row.orders} pedidos</small></div>):<Empty>Sin ventas.</Empty>}</div>
      <div className="barm-box"><h4>Métodos de pago</h4>{(report.payment_methods||[]).length?(report.payment_methods||[]).map(row=><div className="barm-report-row" key={row.method}><span>{row.method}</span><b>{money.format(num(row.amount))}</b><small>{row.payments} pagos</small></div>):<Empty>Sin pagos.</Empty>}</div>
      <div className="barm-box"><h4>Canal de venta</h4>{(report.order_types||[]).length?(report.order_types||[]).map(row=><div className="barm-report-row" key={row.type}><span>{row.type==='table'?'Mesas':row.type==='takeaway'?'Para llevar':'Delivery'}</span><b>{money.format(num(row.sales))}</b><small>{row.orders} pedidos</small></div>):<Empty>Sin pedidos.</Empty>}</div>
     </div>
     <h4>Rendimiento del personal</h4>
     {performance.length?<div className="barm-table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Pedidos</th><th>Ventas</th><th>Ticket</th><th>Propinas</th><th>Descuentos</th><th>Anulaciones</th></tr></thead><tbody>
      {performance.map(row=><tr key={row.user_id}><td><b>{row.display_name}</b></td><td>{ROLES[row.bar_role]?.label||row.bar_role}</td><td>{row.orders_count}</td><td>{money.format(num(row.net_sales))}</td><td>{money.format(num(row.average_ticket))}</td><td>{money.format(num(row.tips))}</td><td>{money.format(num(row.discounts))}</td><td>{row.voided_items}</td></tr>)}
     </tbody></table></div>:<Empty>Sin actividad del personal en el rango.</Empty>}
    </div>}

    {tab==='Auditoría'&&<div className="barm-panel">
     <Title title="🔎 Auditoría completa" text="Une cambios administrativos, operación y movimientos no vendidos del inventario."/>
     {audit.length?<div className="barm-audit">{audit.map(row=><article key={row.id}><time>{dateTime(row.at)}</time><span>{row.area}</span><b>{row.action}</b><p>{row.detail}</p><small>{staffMap.get(row.actor)||row.actor||'Sistema'}</small></article>)}</div>:<Empty>No hay eventos todavía.</Empty>}
    </div>}

    {tab==='Configuración'&&<div className="barm-panel">
     <Title title="⚙️ Configuración del negocio" text="Estas reglas se guardan en base de datos y afectan descuentos y anulaciones."/>
     <div className="barm-form-grid settings">
      <label>Nombre comercial<input value={settings.business_name||''} onChange={e=>setSettings(v=>({...v,business_name:e.target.value}))}/></label>
      <label>Zona horaria<input value={settings.timezone||'America/El_Salvador'} disabled/></label>
      <label>Hora apertura<input type="time" value={(settings.opening_time||'').slice(0,5)} onChange={e=>setSettings(v=>({...v,opening_time:e.target.value}))}/></label>
      <label>Hora cierre<input type="time" value={(settings.closing_time||'').slice(0,5)} onChange={e=>setSettings(v=>({...v,closing_time:e.target.value}))}/></label>
      <label>Propina sugerida %<input type="number" min="0" max="100" step="0.5" value={settings.suggested_tip_percent} onChange={e=>setSettings(v=>({...v,suggested_tip_percent:num(e.target.value)}))}/></label>
      <label>Personas por defecto<input type="number" min="1" max="100" value={settings.default_guest_count} onChange={e=>setSettings(v=>({...v,default_guest_count:num(e.target.value)}))}/></label>
      <label>Máximo descuento manual %<input type="number" min="0" max="100" step="0.5" value={settings.max_manual_discount_percent} onChange={e=>setSettings(v=>({...v,max_manual_discount_percent:num(e.target.value)}))}/></label>
      <label>DTE por defecto<select value={settings.default_dte_type} onChange={e=>setSettings(v=>({...v,default_dte_type:e.target.value}))}><option value="01">Factura 01</option><option value="03">CCF 03</option></select></label>
      <label>Ambiente DTE<select value={settings.default_dte_environment} onChange={e=>setSettings(v=>({...v,default_dte_environment:e.target.value}))}><option value="test">TEST</option><option value="production">PRODUCCIÓN</option></select></label>
      <div className="barm-checks">
       <label><input type="checkbox" checked={!!settings.manual_discounts_enabled} onChange={e=>setSettings(v=>({...v,manual_discounts_enabled:e.target.checked}))}/> Permitir descuentos manuales</label>
       <label><input type="checkbox" checked={!!settings.require_void_reason} onChange={e=>setSettings(v=>({...v,require_void_reason:e.target.checked}))}/> Exigir motivo al anular</label>
       <label><input type="checkbox" checked={!!settings.require_manager_after_send} onChange={e=>setSettings(v=>({...v,require_manager_after_send:e.target.checked}))}/> Exigir gerente si ya fue enviado</label>
       <label><input type="checkbox" checked={!!settings.low_stock_notifications} onChange={e=>setSettings(v=>({...v,low_stock_notifications:e.target.checked}))}/> Alertas de stock bajo</label>
      </div>
      <div className="barm-form-action"><button className="primary" onClick={saveSettings} disabled={working}>Guardar y aplicar configuración</button></div>
     </div>
     <div className="barm-rule-note"><b>Reglas con efecto real</b><p>El motor de descuentos aplica el límite configurado y las anulaciones enviadas respetan la exigencia de autorización. Cada cambio queda en Auditoría.</p></div>
    </div>}
   </main>
  </div>

  {working&&<div className="barm-working"><span/> Procesando…</div>}
 </section>
}
