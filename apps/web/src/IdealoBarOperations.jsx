import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-operations.css'

const OPEN_STATUSES=['open','sent','preparing','ready','served']
const PREP_STATUSES=['sent','preparing','ready']
const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const qty=value=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:2}).format(Number(value||0))
const localDay=value=>value?new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date(value)):''
const todayKey=()=>localDay(new Date())
const localTime=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):''
const localDateTime=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):''
const elapsed=value=>{if(!value)return'';const m=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));return m<1?'Ahora':m<60?`${m} min`:`${Math.floor(m/60)} h ${m%60} min`}
const orderTypeLabel={table:'Mesa',takeaway:'Para llevar',delivery:'Delivery'}
const orderStatusLabel={open:'Abierta',sent:'Enviada',preparing:'Preparando',ready:'Lista',served:'Servida',paid:'Pagada',cancelled:'Anulada'}
const fulfillmentLabel={pending:'Recibido',preparing:'Preparando',ready:'Listo',served:'Servido',picked_up:'Entregado',on_the_way:'En camino',delivered:'Entregado',cancelled:'Cancelado'}
const tableStatusLabel={available:'Disponible',occupied:'Ocupada',awaiting_payment:'Pide cuenta',reserved:'Reservada',inactive:'Inactiva'}

export default function IdealoBarOperations({company,supabase,onOpenCatalog}){
 const companyId=company?.id
 const [tab,setTab]=useState('Resumen')
 const [tables,setTables]=useState([])
 const [menu,setMenu]=useState([])
 const [orders,setOrders]=useState([])
 const [items,setItems]=useState([])
 const [reservations,setReservations]=useState([])
 const [payments,setPayments]=useState([])
 const [cashSessions,setCashSessions]=useState([])
 const [cashAccounts,setCashAccounts]=useState([])
 const [staff,setStaff]=useState([])
 const [currentUserId,setCurrentUserId]=useState('')
 const [role,setRole]=useState('staff')
 const [selectedOrderId,setSelectedOrderId]=useState('')
 const [category,setCategory]=useState('Todos')
 const [query,setQuery]=useState('')
 const [orderFilter,setOrderFilter]=useState('Activos')
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [toolTab,setToolTab]=useState('Datos')
 const [details,setDetails]=useState({waiterId:'',guests:'1',name:'',phone:'',address:'',driver:'',driverPhone:'',notes:''})
 const [transferTableId,setTransferTableId]=useState('')
 const [tipAmount,setTipAmount]=useState('0')
 const [discount,setDiscount]=useState({mode:'PERCENT',value:'10',reason:''})
 const [payment,setPayment]=useState({method:'cash',amount:'',reference:''})
 const [reservationForm,setReservationForm]=useState({name:'',phone:'',partySize:'2',reservedFor:'',tableId:'',notes:''})
 const [seatTables,setSeatTables]=useState({})
 const [cashForm,setCashForm]=useState({accountId:'',opening:'0',counted:'0',notes:''})

 const run=useCallback(async(task,success)=>{
  setWorking(true);setError('');setNotice('')
  try{const result=await task();if(success)setNotice(success);return result}catch(err){setError(String(err?.message||err||'No se pudo completar la operación.'));return null}finally{setWorking(false)}
 },[])

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const {data:userData}=await supabase.auth.getUser()
   const uid=userData?.user?.id||''
   setCurrentUserId(uid)
   const core=await Promise.all([
    supabase.from('bar_tables').select('*').eq('company_id',companyId).eq('active',true).order('sort_order').order('name'),
    supabase.from('bar_menu_items').select('*').eq('company_id',companyId).eq('active',true).order('sort_order').order('category'),
    supabase.from('bar_orders').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(300),
    supabase.from('bar_order_items').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1500),
    supabase.from('bar_reservations').select('*').eq('company_id',companyId).order('reserved_for',{ascending:true}).limit(300),
    supabase.from('company_members').select('user_id,role').eq('company_id',companyId)
   ])
   const coreError=core.find(result=>result.error)?.error
   if(coreError)throw coreError
   const menuRows=core[1].data||[]
   const productIds=[...new Set(menuRows.map(row=>row.product_id).filter(Boolean))]
   let products=[]
   if(productIds.length){const result=await supabase.from('finished_products').select('id,name,sale_price,sku,active').in('id',productIds);if(result.error)throw result.error;products=result.data||[]}
   const productMap=new Map(products.map(row=>[row.id,row]))
   setTables(core[0].data||[])
   setMenu(menuRows.map(row=>({...row,product:productMap.get(row.product_id)||null})).filter(row=>row.product?.active!==false))
   setOrders(core[2].data||[])
   setItems(core[3].data||[])
   setReservations(core[4].data||[])
   const memberships=core[5].data||[]
   setRole(memberships.find(row=>row.user_id===uid)?.role||'staff')
   const memberIds=memberships.map(row=>row.user_id).filter(Boolean)
   if(memberIds.length){const p=await supabase.from('profiles').select('id,full_name').in('id',memberIds);setStaff((p.data||[]).map(profile=>({...profile,role:memberships.find(m=>m.user_id===profile.id)?.role||'staff'})))}else setStaff([])
   const optional=await Promise.all([
    supabase.from('bar_payments').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(700),
    supabase.from('cash_register_sessions').select('*').eq('company_id',companyId).order('opened_at',{ascending:false}).limit(20),
    supabase.from('cash_accounts').select('*').eq('company_id',companyId).eq('active',true).order('name')
   ])
   setPayments(optional[0].error?[]:(optional[0].data||[]))
   setCashSessions(optional[1].error?[]:(optional[1].data||[]))
   setCashAccounts(optional[2].error?[]:(optional[2].data||[]))
  }catch(err){setError(String(err?.message||err||'No se pudo cargar Operación.'))}finally{setLoading(false)}
 },[companyId,supabase])
 useEffect(()=>{load()},[load])

 const activeOrders=useMemo(()=>orders.filter(o=>OPEN_STATUSES.includes(o.status)),[orders])
 const selectedOrder=orders.find(o=>o.id===selectedOrderId)||null
 const selectedItems=items.filter(i=>i.order_id===selectedOrderId&&i.status!=='cancelled')
 const tableById=useMemo(()=>new Map(tables.map(row=>[row.id,row])),[tables])
 const orderByTable=useMemo(()=>new Map(activeOrders.filter(o=>o.table_id).map(o=>[o.table_id,o])),[activeOrders])
 const paymentsByOrder=useMemo(()=>{const map=new Map();payments.forEach(p=>map.set(p.order_id,(map.get(p.order_id)||0)+Number(p.amount||0)));return map},[payments])
 const categories=useMemo(()=>['Todos',...new Set(menu.map(row=>row.category).filter(Boolean))],[menu])
 const filteredMenu=menu.filter(row=>{const label=(row.display_name||row.product?.name||'').toLowerCase();return(category==='Todos'||row.category===category)&&(!query.trim()||label.includes(query.trim().toLowerCase()))})
 const canAdmin=['owner','admin'].includes(String(role))
 const openSession=cashSessions.find(s=>String(s.status).toUpperCase()==='OPEN')||null
 const todaysPaid=orders.filter(o=>o.status==='paid'&&localDay(o.closed_at)===todayKey())
 const todaysSales=todaysPaid.reduce((sum,o)=>sum+Number(o.total||0),0)
 const kitchenPending=items.filter(i=>i.station==='kitchen'&&PREP_STATUSES.includes(i.status)).length
 const barPending=items.filter(i=>i.station==='bar'&&PREP_STATUSES.includes(i.status)).length
 const waitingBill=tables.filter(t=>t.status==='awaiting_payment').length
 const todayReservations=reservations.filter(r=>localDay(r.reserved_for)===todayKey()&&['pending','confirmed'].includes(r.status))
 const deliveries=orders.filter(o=>o.order_type==='delivery'&&o.status!=='cancelled').slice(0,100)
 const cashPayments=openSession?payments.filter(p=>p.cash_register_session_id===openSession.id):[]
 const methodSum=method=>cashPayments.filter(p=>p.method===method).reduce((s,p)=>s+Number(p.amount||0),0)

 useEffect(()=>{
  if(!selectedOrder)return
  setDetails({waiterId:selectedOrder.waiter_id||'',guests:String(selectedOrder.guest_count||1),name:selectedOrder.customer_name||'',phone:selectedOrder.customer_phone||'',address:selectedOrder.delivery_address||'',driver:selectedOrder.driver_name||'',driverPhone:selectedOrder.driver_phone||'',notes:selectedOrder.notes||''})
  setTipAmount(String(Number(selectedOrder.tip_total||0)))
  const paid=paymentsByOrder.get(selectedOrder.id)||0
  setPayment(current=>({...current,amount:String(Math.max(0,Number(selectedOrder.total||0)-paid).toFixed(2)),reference:''}))
  setTransferTableId('')
 },[selectedOrderId,selectedOrder?.updated_at,paymentsByOrder])

 const createTables=()=>run(async()=>{
  if(tables.length)return
  const payload=Array.from({length:12},(_,i)=>({company_id:companyId,name:`Mesa ${String(i+1).padStart(2,'0')}`,area:'Salón',capacity:4,sort_order:i+1,status:'available'}))
  const {error:e}=await supabase.from('bar_tables').insert(payload);if(e)throw e;await load()
 },'Mesas creadas.')

 const createOrder=(type,tableId=null)=>run(async()=>{
  if(type==='table'&&!tableId)throw new Error('Seleccioná una mesa.')
  if(type==='table'&&orderByTable.get(tableId)){setSelectedOrderId(orderByTable.get(tableId).id);setTab('Salón y ventas');return}
  const payload={company_id:companyId,table_id:tableId,order_type:type,status:'open',waiter_id:currentUserId||null,guest_count:1,fulfillment_status:'pending'}
  const {data,error:e}=await supabase.from('bar_orders').insert(payload).select('*').single();if(e)throw e
  if(tableId){const result=await supabase.from('bar_tables').update({status:'occupied'}).eq('id',tableId).eq('company_id',companyId);if(result.error)throw result.error}
  await load();setSelectedOrderId(data.id);setTab('Salón y ventas')
 },type==='delivery'?'Delivery creado.':type==='takeaway'?'Pedido para llevar creado.':'Mesa abierta.')

 const openTable=table=>{const order=orderByTable.get(table.id);if(order){setSelectedOrderId(order.id);setTab('Salón y ventas');return}if(table.status==='available')createOrder('table',table.id)}

 const addItem=menuItem=>run(async()=>{
  if(!selectedOrder)throw new Error('Primero seleccioná una mesa o creá un pedido.')
  const product=menuItem.product;if(!product)throw new Error('Producto no disponible.')
  const price=Number(menuItem.sale_price_override??product.sale_price??0)
  const existing=selectedItems.find(i=>i.menu_item_id===menuItem.id&&i.status==='new'&&Number(i.unit_price)===price)
  if(existing){const r=await supabase.from('bar_order_items').update({quantity:Number(existing.quantity)+1}).eq('id',existing.id);if(r.error)throw r.error}
  else{const r=await supabase.from('bar_order_items').insert({company_id:companyId,order_id:selectedOrder.id,menu_item_id:menuItem.id,product_id:product.id,item_name:menuItem.display_name||product.name,station:menuItem.station,quantity:1,unit_price:price,status:'new'});if(r.error)throw r.error}
  await load()
 })

 const adjustItem=(item,delta)=>run(async()=>{if(item.status!=='new')throw new Error('Solo podés cambiar productos aún no enviados.');const next=Number(item.quantity)+delta;if(next<=0){const r=await supabase.from('bar_order_items').delete().eq('id',item.id);if(r.error)throw r.error}else{const r=await supabase.from('bar_order_items').update({quantity:next}).eq('id',item.id);if(r.error)throw r.error}await load()})

 const voidItem=item=>{const reason=window.prompt(`Motivo para anular ${item.item_name}:`);if(!reason?.trim())return;run(async()=>{const {error:e}=await supabase.rpc('bar_void_order_item',{p_item_id:item.id,p_reason:reason.trim()});if(e)throw e;await load()},'Producto anulado y trazado.')}

 const sendOrder=()=>run(async()=>{const pending=selectedItems.filter(i=>i.status==='new');if(!pending.length)throw new Error('No hay productos nuevos para enviar.');const a=await supabase.from('bar_order_items').update({status:'sent'}).in('id',pending.map(i=>i.id)).eq('company_id',companyId);if(a.error)throw a.error;const b=await supabase.from('bar_orders').update({status:'sent',fulfillment_status:'preparing'}).eq('id',selectedOrder.id);if(b.error)throw b.error;await load()},'Pedido enviado a preparación.')

 const advanceItem=item=>run(async()=>{const next={sent:'preparing',preparing:'ready',ready:'served'}[item.status];if(!next)return;const r=await supabase.from('bar_order_items').update({status:next}).eq('id',item.id);if(r.error)throw r.error;const current=(await supabase.from('bar_order_items').select('status').eq('order_id',item.order_id).neq('status','cancelled'));if(current.error)throw current.error;const statuses=(current.data||[]).map(row=>row.status);const orderStatus=statuses.length&&statuses.every(s=>s==='served')?'served':statuses.length&&statuses.every(s=>['ready','served'].includes(s))?'ready':'preparing';const fulfillment=orderStatus==='served'?'served':orderStatus==='ready'?'ready':'preparing';const o=await supabase.from('bar_orders').update({status:orderStatus,fulfillment_status:fulfillment}).eq('id',item.order_id);if(o.error)throw o.error;await load()})

 const requestBill=()=>run(async()=>{if(!selectedOrder?.table_id)throw new Error('Este pedido no está en una mesa.');const a=await supabase.from('bar_tables').update({status:'awaiting_payment'}).eq('id',selectedOrder.table_id);if(a.error)throw a.error;const b=await supabase.from('bar_orders').update({requested_bill_at:new Date().toISOString()}).eq('id',selectedOrder.id);if(b.error)throw b.error;await load()},'Cuenta solicitada.')

 const saveDetails=()=>run(async()=>{const {error:e}=await supabase.rpc('bar_update_order_details',{p_order_id:selectedOrder.id,p_waiter_id:details.waiterId||null,p_guest_count:Number(details.guests)||1,p_customer_name:details.name,p_customer_phone:details.phone,p_delivery_address:details.address,p_driver_name:details.driver,p_driver_phone:details.driverPhone,p_notes:details.notes});if(e)throw e;await load()},'Datos del pedido actualizados.')
 const transferTable=()=>run(async()=>{if(!transferTableId)throw new Error('Seleccioná la mesa destino.');const {error:e}=await supabase.rpc('bar_transfer_order_table',{p_order_id:selectedOrder.id,p_target_table_id:transferTableId,p_reason:'Cambio de mesa desde Operación'});if(e)throw e;await load()},'Pedido trasladado a la nueva mesa.')
 const saveTip=()=>run(async()=>{const {error:e}=await supabase.rpc('bar_set_order_tip',{p_order_id:selectedOrder.id,p_tip:Number(tipAmount||0)});if(e)throw e;await load()},'Propina actualizada.')
 const applyDiscount=()=>run(async()=>{if(!discount.reason.trim())throw new Error('Escribí el motivo del descuento.');const {error:e}=await supabase.rpc('bar_apply_order_discount',{p_order_id:selectedOrder.id,p_mode:discount.mode,p_value:Number(discount.value||0),p_reason:discount.reason.trim()});if(e)throw e;await load()},'Descuento autorizado y aplicado.')
 const takePayment=()=>run(async()=>{const amount=Number(payment.amount||0);if(!(amount>0))throw new Error('Indicá un monto de pago.');const {data,error:e}=await supabase.rpc('bar_take_payment',{p_order_id:selectedOrder.id,p_method:payment.method,p_amount:amount,p_reference:payment.reference||null});if(e)throw e;await load();if(data?.closed)setSelectedOrderId('');return data},'Pago registrado.')
 const cancelOrder=()=>{if(!selectedOrder)return;const reason=window.prompt(`Motivo para cancelar ${selectedOrder.order_code}:`);if(!reason?.trim())return;run(async()=>{const {error:e}=await supabase.rpc('bar_cancel_order',{p_order_id:selectedOrder.id,p_reason:reason.trim()});if(e)throw e;setSelectedOrderId('');await load()},'Pedido cancelado con auditoría.')}

 const createReservation=()=>run(async()=>{if(!reservationForm.name.trim()||!reservationForm.reservedFor)throw new Error('Nombre y fecha/hora son obligatorios.');const {error:e}=await supabase.from('bar_reservations').insert({company_id:companyId,table_id:reservationForm.tableId||null,customer_name:reservationForm.name.trim(),customer_phone:reservationForm.phone.trim()||null,party_size:Number(reservationForm.partySize)||2,reserved_for:new Date(reservationForm.reservedFor).toISOString(),status:'confirmed',notes:reservationForm.notes.trim()||null});if(e)throw e;setReservationForm({name:'',phone:'',partySize:'2',reservedFor:'',tableId:'',notes:''});await load()},'Reserva creada.')
 const updateReservation=(row,status)=>run(async()=>{const {error:e}=await supabase.from('bar_reservations').update({status}).eq('id',row.id).eq('company_id',companyId);if(e)throw e;await load()},`Reserva ${status==='cancelled'?'cancelada':status==='no_show'?'marcada como no llegó':'actualizada'}.`)
 const seatReservation=row=>run(async()=>{const tableId=seatTables[row.id]||row.table_id;if(!tableId)throw new Error('Seleccioná una mesa para la reserva.');const {data,error:e}=await supabase.rpc('bar_seat_reservation',{p_reservation_id:row.id,p_table_id:tableId});if(e)throw e;await load();setSelectedOrderId(data);setTab('Salón y ventas')},'Reserva sentada y pedido abierto.')

 const updateDelivery=(order,status)=>run(async()=>{const {error:e}=await supabase.rpc('bar_update_fulfillment_status',{p_order_id:order.id,p_status:status});if(e)throw e;await load()},`Delivery: ${fulfillmentLabel[status]||status}.`)

 const openCash=()=>run(async()=>{if(!canAdmin)throw new Error('Solo propietario o administrador puede abrir caja.');let accountId=cashForm.accountId;const cashOnly=cashAccounts.filter(a=>String(a.account_type).toUpperCase()!=='BANK');if(!accountId&&cashOnly.length)accountId=cashOnly[0].id;if(!accountId){const created=await supabase.from('cash_accounts').insert({company_id:companyId,name:'Caja BAR',account_type:'CASH',opening_balance:0,active:true}).select('id').single();if(created.error)throw created.error;accountId=created.data.id}const {error:e}=await supabase.rpc('open_cash_register',{p_company:companyId,p_cash_account:accountId,p_opening_balance:Number(cashForm.opening||0),p_business_date:todayKey()});if(e)throw e;await load()},'Turno de caja abierto.')
 const makeCut=()=>run(async()=>{if(!openSession)throw new Error('No hay caja abierta.');const {error:e}=await supabase.rpc('create_cash_register_cut',{p_session:openSession.id,p_notes:'Corte desde Operación IDEALO BAR'});if(e)throw e},'Corte de caja guardado.')
 const closeCash=()=>run(async()=>{if(!openSession)throw new Error('No hay caja abierta.');const {data,error:e}=await supabase.rpc('close_cash_register',{p_session:openSession.id,p_counted:Number(cashForm.counted||0),p_notes:cashForm.notes||null});if(e)throw e;await load();setNotice(`Caja cerrada. Esperado ${money.format(Number(data?.expected||0))} · contado ${money.format(Number(data?.counted||0))} · diferencia ${money.format(Number(data?.difference||0))}.`)})

 const stationBoard=station=>{const list=items.filter(i=>i.station===station&&PREP_STATUSES.includes(i.status));return <div className="barops-station">{list.length?list.map(item=>{const order=orders.find(o=>o.id===item.order_id);const table=tableById.get(order?.table_id);const action=item.status==='sent'?'Empezar':item.status==='preparing'?'Marcar listo':'Entregar';return <article key={item.id}><header><div><b>{table?.name||orderTypeLabel[order?.order_type]||'Pedido'}</b><small>{order?.order_code}</small></div><span>{elapsed(item.created_at)}</span></header><h4>{qty(item.quantity)} × {item.item_name}</h4>{item.notes&&<p>{item.notes}</p>}<button className="barops-btn primary" disabled={working} onClick={()=>advanceItem(item)}>{action}</button></article>}):<div className="barops-empty"><div><span>✓</span><strong>Sin pendientes</strong><p>La estación está al día.</p></div></div>}</div>}

 if(loading)return <div className="barops"><div className="barops-empty"><div><span>🍺</span><strong>Cargando Operación completa…</strong></div></div></div>

 const paidSelected=selectedOrder?paymentsByOrder.get(selectedOrder.id)||0:0
 const remainingSelected=selectedOrder?Math.max(0,Number(selectedOrder.total||0)-paidSelected):0
 const filteredOrders=orderFilter==='Activos'?activeOrders:orderFilter==='Hoy pagados'?todaysPaid:orders.filter(o=>o.order_type===orderFilter)

 return <section className="barops">
  <header className="barops-head"><div><small>Centro operativo del turno</small><h2>Operación · IDEALO BAR</h2><p>{company?.name||'Empresa'} · del ingreso del cliente al cierre de caja</p></div><div className="barops-live"><i/> {openSession?'Caja abierta':'En línea'}</div></header>
  {error&&<div className="barops-alert"><b>!</b><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
  {notice&&<div className="barops-alert" style={{borderColor:'#315d43',background:'#12231a',color:'#a4e1bc'}}><b>✓</b><span>{notice}</span><button onClick={()=>setNotice('')}>×</button></div>}

  <nav className="barops-tabs">
   {[
    ['Resumen','⌂',0],['Salón y ventas','▦',activeOrders.length],['Pedidos','≡',activeOrders.length],['Cocina','♨',kitchenPending],['Barra','🍺',barPending],['Reservas','◷',todayReservations.length],['Delivery','⌖',deliveries.filter(o=>!['delivered','cancelled'].includes(o.fulfillment_status)).length],['Caja y cierre','$',openSession?1:0]
   ].map(([name,icon,count])=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}>{icon} {name}{count>0&&<b>{count}</b>}</button>)}
  </nav>

  {(!tables.length||!menu.length)&&<div className="barops-panel" style={{marginBottom:14}}><div className="barops-panel-head"><div><h3>Preparación del punto de venta</h3><p>{!tables.length?'Faltan mesas. ':''}{!menu.length?'La carta del bar está vacía.':''}</p></div><div className="barops-mini-actions">{!tables.length&&<button onClick={createTables}>Crear 12 mesas</button>}{!menu.length&&<button onClick={()=>onOpenCatalog?.()}>Configurar carta</button>}</div></div></div>}

  {tab==='Resumen'&&<>
   <div className="barops-kpis"><div className="barops-kpi"><span>Ventas hoy</span><b>{money.format(todaysSales)}</b></div><div className="barops-kpi"><span>Pedidos activos</span><b>{activeOrders.length}</b></div><div className="barops-kpi"><span>Mesas ocupadas</span><b>{tables.filter(t=>orderByTable.has(t.id)).length}</b></div><div className="barops-kpi"><span>Piden cuenta</span><b>{waitingBill}</b></div><div className="barops-kpi"><span>Cocina + Barra</span><b>{kitchenPending+barPending}</b></div><div className="barops-kpi"><span>Reservas hoy</span><b>{todayReservations.length}</b></div></div>
   <div className="barops-quick"><button onClick={()=>setTab('Salón y ventas')}><strong>▦ Abrir mesa</strong><span>Ver disponibilidad y comenzar pedido</span></button><button onClick={()=>createOrder('takeaway')}><strong>🥡 Para llevar</strong><span>Pedido sin mesa</span></button><button onClick={()=>createOrder('delivery')}><strong>⌖ Nuevo delivery</strong><span>Cliente, dirección y motorista</span></button><button onClick={()=>setTab('Reservas')}><strong>◷ Nueva reserva</strong><span>Fecha, hora, personas y mesa</span></button></div>
   <div className="barops-dashboard"><div className="barops-panel"><div className="barops-panel-head"><div><h3>Pedidos en curso</h3><p>Lo que requiere atención ahora</p></div><button onClick={()=>setTab('Pedidos')}>Ver todos</button></div><div className="barops-feed">{activeOrders.slice(0,8).map(order=>{const table=tableById.get(order.table_id);return <article key={order.id} onClick={()=>{setSelectedOrderId(order.id);setTab('Salón y ventas')}} style={{cursor:'pointer'}}><div><b>{table?.name||orderTypeLabel[order.order_type]} · {order.order_code}</b><small>{orderStatusLabel[order.status]} · {elapsed(order.opened_at)} · {order.guest_count||1} persona(s)</small></div><strong>{money.format(Number(order.total||0))}</strong></article>})}{!activeOrders.length&&<div className="barops-empty"><div><span>✓</span><strong>Sin pedidos abiertos</strong></div></div>}</div></div><div className="barops-panel"><div className="barops-panel-head"><div><h3>Estado del turno</h3><p>Servicio y caja</p></div></div><div className="barops-feed"><article><div><b>Cocina</b><small>Órdenes por atender</small></div><strong>{kitchenPending}</strong></article><article><div><b>Barra</b><small>Bebidas por atender</small></div><strong>{barPending}</strong></article><article><div><b>Caja</b><small>{openSession?`Abierta desde ${localTime(openSession.opened_at)}`:'Debe abrirse antes de cobrar'}</small></div><strong>{openSession?'ABIERTA':'CERRADA'}</strong></article><article><div><b>Ventas cerradas</b><small>Pedidos pagados hoy</small></div><strong>{todaysPaid.length}</strong></article></div></div></div>
  </>}

  {tab==='Salón y ventas'&&<div className="barops-pos">
   <aside className="barops-floor"><div className="barops-section-title"><div><small>Salón</small><strong>Mesas</strong></div><div className="barops-mini-actions"><button onClick={()=>createOrder('takeaway')}>+ Llevar</button><button onClick={()=>createOrder('delivery')}>+ Delivery</button></div></div><div className="barops-table-grid">{tables.map(table=>{const order=orderByTable.get(table.id);const effective=order?(table.status==='awaiting_payment'?'awaiting_payment':'occupied'):table.status;return <button key={table.id} className={`barops-table ${effective} ${selectedOrder?.table_id===table.id?'selected':''}`} disabled={working||effective==='inactive'||effective==='reserved'} onClick={()=>openTable(table)}><strong>{table.name}</strong><span>{tableStatusLabel[effective]||effective}</span>{order&&<b>{money.format(Number(order.total||0))}</b>}</button>})}</div></aside>
   <main className="barops-menu"><div className="barops-section-title"><div><small>Carta activa</small><strong>Productos</strong></div><span>{menu.length}</span></div><div className="barops-search"><input placeholder="Buscar cerveza, comida, combo…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="barops-categories">{categories.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="barops-products">{filteredMenu.map(row=>{const name=row.display_name||row.product?.name||'Producto';const price=Number(row.sale_price_override??row.product?.sale_price??0);return <button key={row.id} className="barops-product" disabled={!selectedOrder||working} onClick={()=>addItem(row)}><i>{row.emoji||'🍽️'}</i><strong>{name}</strong><small>{row.category} · {row.station==='bar'?'Barra':'Cocina'}</small><b>{money.format(price)}</b></button>})}</div>{!menu.length&&<div className="barops-empty"><div><span>🍽️</span><strong>Carta vacía</strong><p>Configurá productos exclusivos del bar.</p><button className="barops-btn primary" onClick={()=>onOpenCatalog?.()}>Ir a Carta y productos</button></div></div>}</main>
   <aside className="barops-ticket">{selectedOrder?<><header className="barops-ticket-head"><div><small>Pedido actual</small><strong>{selectedOrder.table_id?tableById.get(selectedOrder.table_id)?.name:orderTypeLabel[selectedOrder.order_type]}</strong><small>{selectedOrder.order_code} · {orderStatusLabel[selectedOrder.status]} · {elapsed(selectedOrder.opened_at)}</small></div><button className="barops-btn" onClick={()=>setSelectedOrderId('')}>×</button></header><div className="barops-ticket-lines">{selectedItems.length?selectedItems.map(item=><div className="barops-line" key={item.id}><div><strong>{item.item_name}</strong><small>{item.status==='new'?'Sin enviar':orderStatusLabel[item.status]||item.status}{item.promotion_name?` · ${item.promotion_name}`:''}</small></div><div className="barops-line-qty">{item.status==='new'&&<button onClick={()=>adjustItem(item,-1)}>−</button>}<span>{qty(item.quantity)}</span>{item.status==='new'&&<button onClick={()=>adjustItem(item,1)}>+</button>}</div><b>{money.format(Number(item.line_total||0))}</b><button className="void" onClick={()=>voidItem(item)}>Anular producto</button></div>):<div className="barops-empty"><div><span>＋</span><strong>Pedido vacío</strong><p>Tocá un producto de la carta.</p></div></div>}</div><div className="barops-totals"><div><span>Subtotal</span><b>{money.format(Number(selectedOrder.subtotal||0))}</b></div>{Number(selectedOrder.discount_total)>0&&<div><span>Descuento</span><b>−{money.format(Number(selectedOrder.discount_total))}</b></div>}{Number(selectedOrder.tip_total)>0&&<div><span>Propina</span><b>{money.format(Number(selectedOrder.tip_total))}</b></div>}<div><span>Pagado</span><b>{money.format(paidSelected)}</b></div><div className="grand"><span>Saldo</span><strong>{money.format(remainingSelected)}</strong></div></div><div className="barops-ticket-actions"><button className="barops-btn primary wide" disabled={working||!selectedItems.some(i=>i.status==='new')} onClick={sendOrder}>Enviar a Cocina / Barra</button>{selectedOrder.table_id&&<button className="barops-btn warn" onClick={requestBill}>Pedir cuenta</button>}<button className="barops-btn danger" onClick={cancelOrder}>Cancelar pedido</button></div><div className="barops-ticket-tools"><div className="barops-tool-tabs">{['Datos','Mover mesa','Propina','Descuento','Dividir / cobrar'].map(name=><button key={name} className={toolTab===name?'active':''} onClick={()=>setToolTab(name)}>{name}</button>)}</div>{toolTab==='Datos'&&<div className="barops-tool-body"><select value={details.waiterId} onChange={e=>setDetails(v=>({...v,waiterId:e.target.value}))}><option value="">Mesero / responsable</option>{staff.map(s=><option value={s.id} key={s.id}>{s.full_name||'Usuario'} · {s.role}</option>)}</select><input type="number" min="1" max="100" value={details.guests} onChange={e=>setDetails(v=>({...v,guests:e.target.value}))} placeholder="Personas"/><input value={details.name} onChange={e=>setDetails(v=>({...v,name:e.target.value}))} placeholder="Cliente"/><input value={details.phone} onChange={e=>setDetails(v=>({...v,phone:e.target.value}))} placeholder="Teléfono"/>{selectedOrder.order_type==='delivery'&&<><input className="wide" value={details.address} onChange={e=>setDetails(v=>({...v,address:e.target.value}))} placeholder="Dirección / referencia"/><input value={details.driver} onChange={e=>setDetails(v=>({...v,driver:e.target.value}))} placeholder="Motorista"/><input value={details.driverPhone} onChange={e=>setDetails(v=>({...v,driverPhone:e.target.value}))} placeholder="Tel. motorista"/></>}<input className="wide" value={details.notes} onChange={e=>setDetails(v=>({...v,notes:e.target.value}))} placeholder="Notas del pedido"/><button className="barops-btn primary wide" onClick={saveDetails}>Guardar datos</button></div>}{toolTab==='Mover mesa'&&<div className="barops-tool-body"><select className="wide" value={transferTableId} onChange={e=>setTransferTableId(e.target.value)}><option value="">Mesa destino disponible…</option>{tables.filter(t=>t.status==='available'&&!orderByTable.has(t.id)).map(t=><option key={t.id} value={t.id}>{t.name} · {t.area}</option>)}</select><button className="barops-btn primary wide" disabled={selectedOrder.order_type!=='table'} onClick={transferTable}>Trasladar pedido</button></div>}{toolTab==='Propina'&&<div className="barops-tool-body"><input className="wide" type="number" min="0" step="0.01" value={tipAmount} onChange={e=>setTipAmount(e.target.value)} placeholder="Propina $"/><button className="barops-btn primary wide" onClick={saveTip}>Aplicar propina</button></div>}{toolTab==='Descuento'&&<div className="barops-tool-body"><select value={discount.mode} onChange={e=>setDiscount(v=>({...v,mode:e.target.value}))}><option value="PERCENT">Porcentaje %</option><option value="AMOUNT">Monto $</option></select><input type="number" min="0" step="0.01" value={discount.value} onChange={e=>setDiscount(v=>({...v,value:e.target.value}))}/><input className="wide" value={discount.reason} onChange={e=>setDiscount(v=>({...v,reason:e.target.value}))} placeholder="Motivo obligatorio"/><button className="barops-btn primary wide" disabled={!canAdmin} onClick={applyDiscount}>{canAdmin?'Autorizar descuento':'Requiere administrador'}</button></div>}{toolTab==='Dividir / cobrar'&&<div><div className="barops-payment-summary"><span>Total {money.format(Number(selectedOrder.total||0))}</span><span>Pagado {money.format(paidSelected)}</span><b>Saldo {money.format(remainingSelected)}</b></div><div className="barops-tool-body"><select value={payment.method} onChange={e=>setPayment(v=>({...v,method:e.target.value}))}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select><input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e=>setPayment(v=>({...v,amount:e.target.value}))} placeholder="Monto a cobrar"/><input className="wide" value={payment.reference} onChange={e=>setPayment(v=>({...v,reference:e.target.value}))} placeholder="Referencia opcional"/><button className="barops-btn primary wide" onClick={takePayment}>Registrar pago / parte de cuenta</button></div></div>}</div></>:<div className="barops-empty"><div><span>▦</span><strong>Seleccioná una mesa o pedido</strong><p>El ticket y todas sus operaciones aparecerán aquí.</p></div></div>}</aside>
  </div>}

  {tab==='Pedidos'&&<div className="barops-panel"><div className="barops-panel-head"><div><h3>Pedidos</h3><p>Seguimiento completo por estado y tipo</p></div><select value={orderFilter} onChange={e=>setOrderFilter(e.target.value)} style={{background:'#0e1318',border:'1px solid #35404d',color:'#fff',borderRadius:9,padding:8}}><option>Activos</option><option>Hoy pagados</option><option value="table">Mesa</option><option value="takeaway">Para llevar</option><option value="delivery">Delivery</option></select></div><div className="barops-orders">{filteredOrders.map(order=>{const table=tableById.get(order.table_id);const count=items.filter(i=>i.order_id===order.id&&i.status!=='cancelled').reduce((s,i)=>s+Number(i.quantity||0),0);return <button className="barops-order-card" key={order.id} onClick={()=>{setSelectedOrderId(order.id);setTab('Salón y ventas')}}><header><div><b>{table?.name||orderTypeLabel[order.order_type]}</b><small>{order.order_code}</small></div><span className="barops-status">{orderStatusLabel[order.status]}</span></header><p>{qty(count)} productos · {order.guest_count||1} persona(s) · {order.customer_name||'Sin cliente'}</p><footer><span>{order.status==='paid'?localTime(order.closed_at):elapsed(order.opened_at)}</span><b>{money.format(Number(order.total||0))}</b></footer></button>})}</div>{!filteredOrders.length&&<div className="barops-empty"><div><span>✓</span><strong>Sin pedidos en este filtro</strong></div></div>}</div>}

  {tab==='Cocina'&&<div className="barops-panel"><div className="barops-panel-head"><div><h3>♨ Cocina</h3><p>Enviados → preparando → listos → entregados</p></div><b>{kitchenPending} pendientes</b></div>{stationBoard('kitchen')}</div>}
  {tab==='Barra'&&<div className="barops-panel"><div className="barops-panel-head"><div><h3>🍺 Barra</h3><p>Cervezas, bebidas, Baldes y Hielerazos</p></div><b>{barPending} pendientes</b></div>{stationBoard('bar')}</div>}

  {tab==='Reservas'&&<div className="barops-res-layout"><div className="barops-panel"><div className="barops-panel-head"><div><h3>Nueva reserva</h3><p>Cliente, hora, personas y mesa opcional</p></div></div><div className="barops-res-form"><label>Cliente<input value={reservationForm.name} onChange={e=>setReservationForm(v=>({...v,name:e.target.value}))}/></label><label>Teléfono<input value={reservationForm.phone} onChange={e=>setReservationForm(v=>({...v,phone:e.target.value}))}/></label><label>Personas<input type="number" min="1" max="100" value={reservationForm.partySize} onChange={e=>setReservationForm(v=>({...v,partySize:e.target.value}))}/></label><label>Fecha y hora<input type="datetime-local" value={reservationForm.reservedFor} onChange={e=>setReservationForm(v=>({...v,reservedFor:e.target.value}))}/></label><label>Mesa opcional<select value={reservationForm.tableId} onChange={e=>setReservationForm(v=>({...v,tableId:e.target.value}))}><option value="">Asignar al llegar</option>{tables.map(t=><option key={t.id} value={t.id}>{t.name} · {t.area}</option>)}</select></label><label>Notas<textarea rows="3" value={reservationForm.notes} onChange={e=>setReservationForm(v=>({...v,notes:e.target.value}))}/></label><button className="barops-btn primary" onClick={createReservation}>Guardar reserva</button></div></div><div className="barops-panel"><div className="barops-panel-head"><div><h3>Agenda de reservas</h3><p>Próximas y recientes</p></div><b>{reservations.filter(r=>['pending','confirmed'].includes(r.status)).length} pendientes</b></div><div className="barops-res-grid">{reservations.filter(r=>new Date(r.reserved_for).getTime()>Date.now()-86400000).slice(0,80).map(row=><article className="barops-res-card" key={row.id}><div><strong>{row.customer_name} · {row.party_size} personas</strong><small>{localDateTime(row.reserved_for)} · {tableById.get(row.table_id)?.name||'Mesa por asignar'} · {row.status}</small>{row.customer_phone&&<small>{row.customer_phone}</small>}{row.notes&&<small>{row.notes}</small>}</div><div className="barops-res-actions">{['pending','confirmed'].includes(row.status)&&<><select value={seatTables[row.id]||row.table_id||''} onChange={e=>setSeatTables(v=>({...v,[row.id]:e.target.value}))}><option value="">Mesa…</option>{tables.filter(t=>t.status==='available'||t.id===row.table_id).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><button onClick={()=>seatReservation(row)}>Sentar</button><button onClick={()=>updateReservation(row,'no_show')}>No llegó</button><button onClick={()=>updateReservation(row,'cancelled')}>Cancelar</button></>}</div></article>)}</div></div></div>}

  {tab==='Delivery'&&<div className="barops-panel"><div className="barops-panel-head"><div><h3>Delivery</h3><p>Recibido → preparando → listo → en camino → entregado</p></div><button onClick={()=>createOrder('delivery')}>+ Nuevo delivery</button></div><div className="barops-delivery">{deliveries.map(order=><article className="barops-delivery-card" key={order.id}><header><div><b>{order.customer_name||'Cliente pendiente'}</b><small>{order.order_code}</small></div><span className="barops-status">{fulfillmentLabel[order.fulfillment_status]||order.fulfillment_status}</span></header><p>{order.customer_phone||'Sin teléfono'}<br/>{order.delivery_address||'Dirección pendiente'}<br/>{order.driver_name?`Motorista: ${order.driver_name}${order.driver_phone?` · ${order.driver_phone}`:''}`:'Motorista pendiente'}</p><b>{money.format(Number(order.total||0))}</b><div className="steps">{['preparing','ready','on_the_way','delivered'].map(status=><button key={status} disabled={working||order.fulfillment_status===status} onClick={()=>updateDelivery(order,status)}>{fulfillmentLabel[status]}</button>)}<button onClick={()=>{setSelectedOrderId(order.id);setTab('Salón y ventas')}}>Abrir pedido</button></div></article>)}</div>{!deliveries.length&&<div className="barops-empty"><div><span>⌖</span><strong>Sin deliveries</strong><p>Creá el primero desde aquí.</p></div></div>}</div>}

  {tab==='Caja y cierre'&&<div className="barops-cash-layout"><div className="barops-cash-card">{openSession?<><h3>Turno de caja abierto</h3><p>Desde {localDateTime(openSession.opened_at)} · fondo inicial {money.format(Number(openSession.opening_balance||0))}</p><div className="barops-methods"><div><span>Efectivo BAR</span><b>{money.format(methodSum('cash'))}</b></div><div><span>Tarjeta</span><b>{money.format(methodSum('card'))}</b></div><div><span>Transferencia</span><b>{money.format(methodSum('transfer'))}</b></div><div><span>Total cobrado</span><b>{money.format(cashPayments.reduce((s,p)=>s+Number(p.amount||0),0))}</b></div></div><p>El cierre oficial usa todos los movimientos de la Caja central, no solo ventas del bar.</p><div className="barops-cash-grid"><button className="barops-btn" disabled={!canAdmin} onClick={makeCut}>Guardar corte parcial</button><div></div><input type="number" min="0" step="0.01" value={cashForm.counted} onChange={e=>setCashForm(v=>({...v,counted:e.target.value}))} placeholder="Efectivo contado"/><input value={cashForm.notes} onChange={e=>setCashForm(v=>({...v,notes:e.target.value}))} placeholder="Notas de cierre"/><button className="barops-btn danger" disabled={!canAdmin} onClick={closeCash}>Cerrar caja</button></div></>:<><h3>Caja cerrada</h3><p>Para cobrar pedidos debe existir un turno de caja abierto.</p><div className="barops-cash-grid"><select value={cashForm.accountId} onChange={e=>setCashForm(v=>({...v,accountId:e.target.value}))}><option value="">Caja principal…</option>{cashAccounts.filter(a=>String(a.account_type).toUpperCase()!=='BANK').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><input type="number" min="0" step="0.01" value={cashForm.opening} onChange={e=>setCashForm(v=>({...v,opening:e.target.value}))} placeholder="Fondo inicial"/><button className="barops-btn primary" disabled={!canAdmin} onClick={openCash}>{canAdmin?'Abrir turno de caja':'Requiere administrador'}</button></div></>}</div><div className="barops-cash-card"><h3>Control del turno</h3><p>La operación diaria queda ligada a Caja, pedidos y usuario responsable.</p><div className="barops-feed"><article><div><b>Rol actual</b><small>Permisos dentro de la empresa</small></div><strong>{role}</strong></article><article><div><b>Pedidos cobrados hoy</b><small>Cierres de venta</small></div><strong>{todaysPaid.length}</strong></article><article><div><b>Ventas hoy</b><small>Total de pedidos pagados</small></div><strong>{money.format(todaysSales)}</strong></article><article><div><b>Cobros por conciliar</b><small>Tarjeta/transferencia sin cuenta automática</small></div><strong>{payments.filter(p=>p.financial_posting_status!=='posted').length}</strong></article></div></div></div>}

  {working&&<div className="barops-working"><span/> Procesando operación…</div>}
 </section>
}
