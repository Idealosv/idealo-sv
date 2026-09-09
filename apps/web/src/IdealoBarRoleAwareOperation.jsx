import {useCallback,useEffect,useMemo,useState} from 'react'
import IdealoBarOperations from './IdealoBarOperations.jsx'
import './idealo-bar-role-access.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const localDateTime=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):''
const statusLabel={open:'Abierto',sent:'Enviado',preparing:'Preparando',ready:'Listo',served:'Servido',paid:'Pagado',cancelled:'Anulado'}
const fulfillmentLabel={pending:'Recibido',preparing:'Preparando',ready:'Listo',on_the_way:'En camino',delivered:'Entregado'}

export default function IdealoBarRoleAwareOperation({company,supabase,onOpenCatalog}){
 const [access,setAccess]=useState(null)
 const [error,setError]=useState('')
 const load=useCallback(async()=>{
  if(!company?.id||!supabase)return
  const {data,error:e}=await supabase.rpc('bar_my_access',{p_company_id:company.id})
  if(e){setError(e.message);return}
  setAccess(data||{role:'none',active:false,permissions:[]})
 },[company?.id,supabase])
 useEffect(()=>{load()},[load])
 if(error)return <AccessMessage title="No se pudo validar tu rol" text={error}/>
 if(!access)return <AccessMessage title="Validando permisos del turno…" text="IDEALO BAR está comprobando tu función antes de mostrar Operación."/>
 if(!access.active)return <AccessMessage title="Acceso del bar inactivo" text="Tu usuario pertenece a la empresa, pero su función dentro de IDEALO BAR está desactivada."/>
 if(access.role==='owner'||access.role==='manager')return <div className={`bar-role-shell bar-role-${access.role}`}><RoleBadge access={access}/><IdealoBarOperations company={company} supabase={supabase} onOpenCatalog={onOpenCatalog}/></div>
 if(access.role==='waiter')return <div className="bar-role-shell bar-role-waiter"><RoleBadge access={access}/><IdealoBarOperations company={company} supabase={supabase} onOpenCatalog={onOpenCatalog}/></div>
 if(access.role==='cashier')return <CashierConsole company={company} supabase={supabase} access={access}/>
 if(access.role==='kitchen')return <StationConsole company={company} supabase={supabase} access={access} station="kitchen"/>
 if(access.role==='bar')return <StationConsole company={company} supabase={supabase} access={access} station="bar"/>
 return <AccessMessage title="Operación no pertenece a tu rol" text="Tu función está limitada a Inventario y recetas. Usa el área habilitada en la barra superior."/>
}

function RoleBadge({access}){
 const label={owner:'Propietario',manager:'Gerente',waiter:'Mesero',cashier:'Cajero',kitchen:'Cocina',bar:'Barra',warehouse:'Bodega'}[access.role]||access.role
 return <div className="bar-role-badge"><span>Permisos del turno</span><b>{label}</b><small>{access.display_name||''}</small></div>
}

function AccessMessage({title,text}){return <section className="bar-role-message"><div><span>🔐</span><h2>{title}</h2><p>{text}</p></div></section>}

function StationConsole({company,supabase,access,station}){
 const [items,setItems]=useState([]),[orders,setOrders]=useState([]),[tables,setTables]=useState([])
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState('')
 const isKitchen=station==='kitchen'
 const load=useCallback(async()=>{
  setLoading(true);setError('')
  const [i,o,t]=await Promise.all([
   supabase.from('bar_order_items').select('id,order_id,item_name,quantity,status,notes,created_at,station').eq('company_id',company.id).eq('station',station).in('status',['sent','preparing','ready']).order('created_at'),
   supabase.from('bar_orders').select('id,order_code,table_id,order_type,status,opened_at').eq('company_id',company.id).in('status',['open','sent','preparing','ready','served']).order('opened_at'),
   supabase.from('bar_tables').select('id,name').eq('company_id',company.id)
  ])
  const e=i.error||o.error||t.error
  if(e)setError(e.message);else{setItems(i.data||[]);setOrders(o.data||[]);setTables(t.data||[])}
  setLoading(false)
 },[company.id,supabase,station])
 useEffect(()=>{load()},[load])
 const orderMap=useMemo(()=>new Map(orders.map(o=>[o.id,o])),[orders])
 const tableMap=useMemo(()=>new Map(tables.map(t=>[t.id,t.name])),[tables])
 const advance=async item=>{
  setWorking(true);setError('')
  const {error:e}=await supabase.rpc('bar_advance_station_item',{p_item_id:item.id})
  if(e)setError(e.message);else await load()
  setWorking(false)
 }
 const action=status=>status==='sent'?'Empezar':status==='preparing'?'Marcar listo':'Entregar'
 return <section className="bar-station-console">
  <header><div><small>Estación restringida por rol</small><h2>{isKitchen?'♨ Cocina':'🍺 Barra'} · IDEALO BAR</h2><p>{access.display_name} · solo puedes avanzar productos asignados a esta estación.</p></div><div className="bar-station-count"><b>{items.length}</b><span>pendientes</span></div></header>
  {error&&<div className="bar-role-error">{error}</div>}
  <div className="bar-station-grid">{loading?<AccessMessage title="Cargando comandas…" text=""/>:items.length?items.map(item=>{const order=orderMap.get(item.order_id);return <article key={item.id}><div className="bar-station-meta"><b>{tableMap.get(order?.table_id)||({takeaway:'Para llevar',delivery:'Delivery'}[order?.order_type]||'Pedido')}</b><span>{order?.order_code}</span></div><h3>{Number(item.quantity||0)} × {item.item_name}</h3>{item.notes&&<p>{item.notes}</p>}<footer><span>{statusLabel[item.status]||item.status}</span><button disabled={working} onClick={()=>advance(item)}>{action(item.status)}</button></footer></article>}):<div className="bar-role-empty">✓ No hay productos pendientes en {isKitchen?'Cocina':'Barra'}.</div>}</div>
 </section>
}

function CashierConsole({company,supabase,access}){
 const [tab,setTab]=useState('Cobros'),[orders,setOrders]=useState([]),[payments,setPayments]=useState([]),[sessions,setSessions]=useState([]),[accounts,setAccounts]=useState([]),[reservations,setReservations]=useState([])
 const [selectedId,setSelectedId]=useState(''),[method,setMethod]=useState('cash'),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[tip,setTip]=useState('0')
 const [opening,setOpening]=useState('0'),[counted,setCounted]=useState('0'),[cashAccountId,setCashAccountId]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const load=useCallback(async()=>{
  const [o,p,s,a,r]=await Promise.all([
   supabase.from('bar_orders').select('*').eq('company_id',company.id).order('created_at',{ascending:false}).limit(250),
   supabase.from('bar_payments').select('*').eq('company_id',company.id).order('created_at',{ascending:false}).limit(500),
   supabase.from('cash_register_sessions').select('*').eq('company_id',company.id).order('opened_at',{ascending:false}).limit(20),
   supabase.from('cash_accounts').select('*').eq('company_id',company.id).eq('active',true).order('name'),
   supabase.from('bar_reservations').select('*').eq('company_id',company.id).order('reserved_for',{ascending:true}).limit(80)
  ])
  const e=o.error||p.error||s.error||a.error||r.error
  if(e)setError(e.message);else{setOrders(o.data||[]);setPayments(p.data||[]);setSessions(s.data||[]);setAccounts(a.data||[]);setReservations(r.data||[])}
 },[company.id,supabase])
 useEffect(()=>{load()},[load])
 const openOrders=orders.filter(o=>!['paid','cancelled'].includes(o.status))
 const selected=orders.find(o=>o.id===selectedId)||null
 const paid=selected?payments.filter(p=>p.order_id===selected.id).reduce((s,p)=>s+Number(p.amount||0),0):0
 const remaining=selected?Math.max(0,Number(selected.total||0)-paid):0
 const openSession=sessions.find(s=>String(s.status).toUpperCase()==='OPEN')||null
 useEffect(()=>{if(selected){setAmount(remaining.toFixed(2));setTip(String(Number(selected.tip_total||0))) }},[selectedId,remaining])
 const run=async(fn,msg)=>{setWorking(true);setError('');setNotice('');try{await fn();setNotice(msg);await load()}catch(e){setError(e.message||String(e))}finally{setWorking(false)}}
 const takePayment=()=>run(async()=>{if(!selected)throw new Error('Selecciona un pedido.');const {error:e}=await supabase.rpc('bar_take_payment',{p_order_id:selected.id,p_method:method,p_amount:Number(amount||0),p_reference:reference||null});if(e)throw e},'Pago registrado correctamente.')
 const saveTip=()=>run(async()=>{if(!selected)throw new Error('Selecciona un pedido.');const {error:e}=await supabase.rpc('bar_set_order_tip',{p_order_id:selected.id,p_tip:Number(tip||0)});if(e)throw e},'Propina actualizada.')
 const openCash=()=>run(async()=>{const id=cashAccountId||accounts.find(a=>String(a.account_type).toUpperCase()!=='BANK')?.id;if(!id)throw new Error('No hay una cuenta de Caja activa. Pide al Gerente que la configure.');const {error:e}=await supabase.rpc('open_cash_register',{p_company:company.id,p_cash_account:id,p_opening_balance:Number(opening||0),p_business_date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date())});if(e)throw e},'Caja abierta.')
 const cutCash=()=>run(async()=>{if(!openSession)throw new Error('No hay caja abierta.');const {error:e}=await supabase.rpc('create_cash_register_cut',{p_session:openSession.id,p_notes:'Corte desde consola Cajero IDEALO BAR'});if(e)throw e},'Corte de caja guardado.')
 const closeCash=()=>run(async()=>{if(!openSession)throw new Error('No hay caja abierta.');const {error:e}=await supabase.rpc('close_cash_register',{p_session:openSession.id,p_counted:Number(counted||0),p_notes:'Cierre desde consola Cajero IDEALO BAR'});if(e)throw e},'Caja cerrada.')
 return <section className="bar-cashier-console">
  <header><div><small>Consola restringida por rol</small><h2>$ Caja · IDEALO BAR</h2><p>{access.display_name} · cobros, propinas y turno de caja sin acceso a comandas ni administración.</p></div><RoleBadge access={access}/></header>
  {error&&<div className="bar-role-error">{error}</div>}{notice&&<div className="bar-role-notice">{notice}</div>}
  <nav>{['Cobros','Caja','Solo lectura'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</nav>
  {tab==='Cobros'&&<div className="bar-cashier-layout"><div className="bar-cashier-list"><h3>Pedidos con saldo</h3>{openOrders.map(o=><button key={o.id} className={selectedId===o.id?'active':''} onClick={()=>setSelectedId(o.id)}><div><b>{o.order_code}</b><span>{o.customer_name||o.order_type} · {statusLabel[o.status]}</span></div><strong>{money.format(Number(o.total||0)-payments.filter(p=>p.order_id===o.id).reduce((s,p)=>s+Number(p.amount||0),0))}</strong></button>)}</div><div className="bar-cashier-ticket">{selected?<><h3>{selected.order_code}</h3><p>{selected.customer_name||'Sin cliente'} · {statusLabel[selected.status]}</p><div className="bar-cashier-total"><span>Total</span><b>{money.format(Number(selected.total||0))}</b><span>Pagado</span><b>{money.format(paid)}</b><span>Saldo</span><strong>{money.format(remaining)}</strong></div><label>Propina<input type="number" min="0" step="0.01" value={tip} onChange={e=>setTip(e.target.value)}/></label><button disabled={working} onClick={saveTip}>Guardar propina</button><hr/><label>Método<select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></label><label>Monto<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Referencia<input value={reference} onChange={e=>setReference(e.target.value)}/></label><button className="primary" disabled={working||remaining<=0} onClick={takePayment}>Registrar pago</button></>:<div className="bar-role-empty">Selecciona un pedido para cobrar.</div>}</div></div>}
  {tab==='Caja'&&<div className="bar-cash-box">{openSession?<><h3>Turno abierto</h3><p>Desde {localDateTime(openSession.opened_at)} · fondo {money.format(Number(openSession.opening_balance||0))}</p><button disabled={working} onClick={cutCash}>Guardar corte parcial</button><label>Efectivo contado<input type="number" min="0" step="0.01" value={counted} onChange={e=>setCounted(e.target.value)}/></label><button className="danger" disabled={working} onClick={closeCash}>Cerrar caja</button></>:<><h3>Caja cerrada</h3><label>Cuenta de caja<select value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)}><option value="">Seleccionar…</option>{accounts.filter(a=>String(a.account_type).toUpperCase()!=='BANK').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Fondo inicial<input type="number" min="0" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label><button className="primary" disabled={working} onClick={openCash}>Abrir caja</button></>}</div>}
  {tab==='Solo lectura'&&<div className="bar-readonly-grid"><div><h3>Reservas</h3>{reservations.slice(0,12).map(r=><article key={r.id}><b>{r.customer_name}</b><span>{localDateTime(r.reserved_for)} · {r.party_size} personas · {r.status}</span></article>)}</div><div><h3>Delivery</h3>{orders.filter(o=>o.order_type==='delivery'&&!['cancelled'].includes(o.status)).slice(0,12).map(o=><article key={o.id}><b>{o.order_code} · {o.customer_name||'Cliente'}</b><span>{fulfillmentLabel[o.fulfillment_status]||o.fulfillment_status} · {money.format(Number(o.total||0))}</span></article>)}</div></div>}
 </section>
}
