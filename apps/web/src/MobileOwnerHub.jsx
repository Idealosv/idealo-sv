import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const CACHE_KEY=id=>`idealo-mobile-owner-hub-${id}`
const empty={products:[],inventory:[],accounts:[],moves:[],cash:[],ar:{},ap:{},rec:{},dte:[]}

export default function MobileOwnerHub({company,supabase,session,role,online,pending,busy,onSync,onSignOut,onNotifications}){
 const [section,setSection]=useState('Inicio'),[data,setData]=useState(empty),[loading,setLoading]=useState(false),[error,setError]=useState(''),[cachedAt,setCachedAt]=useState(null)
 const owner=['owner','admin'].includes(role)
 const load=async()=>{
  if(!company)return
  if(!online){const saved=localStorage.getItem(CACHE_KEY(company.id));if(saved){try{const parsed=JSON.parse(saved);setData(parsed.data||empty);setCachedAt(parsed.at||null)}catch{}}return}
  setLoading(true);setError('')
  const [p,i,a,m,c,r,pa,re,d]=await Promise.all([
   supabase.from('finished_products').select('id,name,category,unit,sale_price,active').eq('company_id',company.id).eq('active',true).order('name').limit(100),
   supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,unit,active').eq('company_id',company.id).eq('active',true).order('name').limit(100),
   supabase.from('cash_account_balances').select('cash_account_id,name,account_type,active,current_balance,income_today,expense_today').eq('company_id',company.id),
   supabase.from('cash_movements').select('id,movement_date,movement_type,amount,concept,cash_account_id').eq('company_id',company.id).order('movement_date',{ascending:false}).limit(100),
   supabase.from('financial_cash_monthly').select('period,cash_in,cash_out,net_cash').eq('company_id',company.id).order('period',{ascending:false}).limit(6),
   supabase.from('financial_receivables_summary').select('*').eq('company_id',company.id).maybeSingle(),
   supabase.from('financial_payables_summary').select('*').eq('company_id',company.id).maybeSingle(),
   supabase.from('financial_reconciliation_summary').select('*').eq('company_id',company.id).maybeSingle(),
   supabase.from('dte_documents').select('id,dte_type,control_number,status,created_at').eq('company_id',company.id).in('dte_type',['01','03']).order('created_at',{ascending:false}).limit(15)
  ])
  const firstError=[p,i,a,m,c,r,pa,re,d].find(x=>x.error)?.error
  if(firstError)setError(firstError.message)
  const next={products:p.data||[],inventory:i.data||[],accounts:a.data||[],moves:m.data||[],cash:c.data||[],ar:r.data||{},ap:pa.data||{},rec:re.data||{},dte:d.data||[]}
  setData(next);const at=new Date().toISOString();setCachedAt(at);localStorage.setItem(CACHE_KEY(company.id),JSON.stringify({at,data:next}));setLoading(false)
 }
 useEffect(()=>{load()},[company?.id,online])
 const summary=useMemo(()=>{const low=data.inventory.filter(x=>Number(x.current_stock||0)<=Number(x.minimum_stock||0)),totalCash=data.accounts.filter(x=>x.active!==false).reduce((s,x)=>s+Number(x.current_balance||0),0),income=data.accounts.reduce((s,x)=>s+Number(x.income_today||0),0),expense=data.accounts.reduce((s,x)=>s+Number(x.expense_today||0),0);return{low,totalCash,income,expense}},[data])
 const openDte=()=>document.querySelector('.mobile-dte-fab')?.click()
 if(!owner)return <section className="mobile-card mobile-full"><h2>Más</h2><div className="mobile-empty">Estos controles están disponibles para Propietario/Administrador.</div></section>
 const goHome=()=>setSection('Inicio')
 const ModuleHeader=({title,subtitle})=><div className="mobile-owner-section-head"><button type="button" onClick={goHome}>‹</button><div><h2>{title}</h2>{subtitle&&<small>{subtitle}</small>}</div></div>
 return <section className="mobile-owner-hub">
  {error&&<div className="mobile-error">{error}</div>}
  {section==='Inicio'&&<>
   <div className="mobile-owner-simple-head"><div><p>MÁS</p><h2>Gestión</h2><small>{online?'Actualizado en línea':cachedAt?`Datos guardados · ${new Date(cachedAt).toLocaleString('es-SV')}`:'Sin conexión'}</small></div><button type="button" onClick={load} disabled={!online||loading}>{loading?'…':'↻'}</button></div>
   <div className="mobile-owner-glance"><div><span>Disponible</span><strong>{money(summary.totalCash)}</strong></div><div><span>Stock bajo</span><strong>{summary.low.length}</strong></div></div>
   <div className="mobile-owner-menu">
    <button onClick={()=>setSection('Productos')}><span>Productos</span><small>Catálogo y precios</small><b>›</b></button>
    <button onClick={()=>setSection('Inventario')}><span>Inventario</span><small>Existencias y mínimos</small><b>›</b></button>
    <button onClick={()=>setSection('Caja')}><span>Caja y bancos</span><small>Saldos y movimientos</small><b>›</b></button>
    <button onClick={()=>setSection('Reportes')}><span>Reportes</span><small>Resumen financiero</small><b>›</b></button>
    <button onClick={openDte}><span>Facturación / DTE</span><small>Emitir y revisar documentos</small><b>›</b></button>
    <button onClick={()=>setSection('Perfil')}><span>Perfil</span><small>Cuenta y sincronización</small><b>›</b></button>
   </div>
  </>}
  {section==='Productos'&&<><ModuleHeader title="Productos" subtitle="Catálogo activo"/><div className="mobile-owner-list">{data.products.length?data.products.map(x=><div className="mobile-owner-item" key={x.id}><div><strong>{x.name}</strong><small>{x.category||'Sin categoría'} · {x.unit||'unidad'}</small></div><b>{money(x.sale_price)}</b></div>):<div className="mobile-empty">No hay productos activos.</div>}</div></>}
  {section==='Inventario'&&<><ModuleHeader title="Inventario" subtitle="Existencias y mínimos"/><div className="mobile-owner-list">{data.inventory.length?data.inventory.map(x=>{const low=Number(x.current_stock||0)<=Number(x.minimum_stock||0);return <div className={`mobile-owner-item ${low?'is-risk':''}`} key={x.id}><div><strong>{x.name}</strong><small>Mínimo {Number(x.minimum_stock||0)} {x.unit||''}</small></div><b>{Number(x.current_stock||0)} {x.unit||''}{low?' · Bajo':''}</b></div>}):<div className="mobile-empty">No hay inventario activo.</div>}</div></>}
  {section==='Caja'&&<><ModuleHeader title="Caja y bancos" subtitle="Control del día"/><div className="mobile-owner-glance"><div><span>Disponible</span><strong>{money(summary.totalCash)}</strong></div><div><span>Neto hoy</span><strong>{money(summary.income-summary.expense)}</strong></div></div><div className="mobile-owner-list"><h3>Cuentas</h3>{data.accounts.map(x=><div className={`mobile-owner-item ${Number(x.current_balance||0)<0?'is-risk':''}`} key={x.cash_account_id}><div><strong>{x.name}</strong><small>{x.account_type}</small></div><b>{money(x.current_balance)}</b></div>)}<h3>Últimos movimientos</h3>{data.moves.slice(0,6).map(x=><div className="mobile-owner-item" key={x.id}><div><strong>{x.concept||x.movement_type}</strong><small>{new Date(x.movement_date).toLocaleString('es-SV')}</small></div><b>{['INCOME','TRANSFER_IN'].includes(x.movement_type)?'+':'−'}{money(x.amount)}</b></div>)}</div></>}
  {section==='Reportes'&&<><ModuleHeader title="Reportes" subtitle="Resumen financiero"/><div className="mobile-owner-report"><div><span>Por cobrar</span><strong>{money(data.ar?.outstanding)}</strong></div><div><span>Por pagar</span><strong>{money(data.ap?.outstanding)}</strong></div><div><span>Vencido</span><strong>{money(data.ar?.overdue)}</strong></div><div><span>Diferencias</span><strong>{money(data.rec?.absolute_difference)}</strong></div></div><div className="mobile-owner-list"><h3>Flujo de efectivo</h3>{data.cash.length?data.cash.map(x=><div className="mobile-owner-item" key={x.period}><div><strong>{x.period}</strong><small>Entradas {money(x.cash_in)} · Salidas {money(x.cash_out)}</small></div><b>{money(x.net_cash)}</b></div>):<div className="mobile-empty">Sin períodos financieros todavía.</div>}</div></>}
  {section==='Perfil'&&<><ModuleHeader title="Perfil" subtitle="Cuenta y dispositivo"/><div className="mobile-owner-profile"><div><span>Usuario</span><strong>{session?.user?.email}</strong></div><div><span>Rol</span><strong>{role}</strong></div><div><span>Estado</span><strong>{online?'En línea':'Sin conexión'}</strong></div><div><span>Pendientes</span><strong>{pending}</strong></div>{pending>0&&<button disabled={!online||busy==='sync'} onClick={onSync}>Sincronizar</button>}<button onClick={onNotifications}>Alertas móviles</button><button className="danger" onClick={onSignOut}>Cerrar sesión</button></div></>}
 </section>
}
