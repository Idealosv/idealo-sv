export default function standaloneBarHomeDashboardV2(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  return{
    name:'idealo-bar-standalone-home-dashboard-v2',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null
      let next=code

      if(!next.includes("{name:'Resumen',icon:'⌂',permission:'summary.view'}"))throw new Error('[IDEALO BAR] No se encontró la pestaña Resumen')
      next=next.replace("{name:'Resumen',icon:'⌂',permission:'summary.view'}","{name:'Inicio',icon:'⌂',permission:'summary.view'}")
      if(!next.includes("const [tab,setTab]=useState('Resumen')"))throw new Error('[IDEALO BAR] No se encontró el estado inicial de Resumen')
      next=next.replace("const [tab,setTab]=useState('Resumen')","const [tab,setTab]=useState('Inicio')")

      const stateMarker=" const [cashForm,setCashForm]=useState({accountId:'',opening:'0',counted:'0',notes:''})"
      if(!next.includes(stateMarker))throw new Error('[IDEALO BAR] No se encontró el estado de Caja para integrar Inicio')
      next=next.replace(stateMarker,stateMarker+"\n const [homeInventory,setHomeInventory]=useState([])\n const [homeInventoryReady,setHomeInventoryReady]=useState(false)")

      const loadEffect=" useEffect(()=>{load()},[load])"
      if(!next.includes(loadEffect))throw new Error('[IDEALO BAR] No se encontró el efecto de carga de Operación')
      next=next.replace(loadEffect,loadEffect+`\n useEffect(()=>{
  let cancelled=false
  if(!companyId||!supabase||!(can('inventory.view')||can('inventory.manage'))){setHomeInventory([]);setHomeInventoryReady(true);return()=>{cancelled=true}}
  setHomeInventoryReady(false)
  supabase.rpc('bar_real_setup_snapshot',{p_company_id:companyId}).then(({data,error:e})=>{
   if(cancelled)return
   if(e){console.warn('[IDEALO BAR] Inventario de Inicio:',e);setHomeInventory([])}
   else setHomeInventory(Array.isArray(data?.inventory)?data.inventory:[])
   setHomeInventoryReady(true)
  })
  return()=>{cancelled=true}
 },[companyId,supabase,can])`)

      const tabCountMarker=" const tabCount=name=>name==='Salón y ventas'||name==='Pedidos'?activeOrders.length:name==='Cocina'?kitchenPending:name==='Barra'?barPending:name==='Reservas'?todayReservations.length:name==='Delivery'?deliveries.filter(o=>!['delivered','cancelled'].includes(o.fulfillment_status)).length:name==='Caja y cierre'&&openSession?1:0"
      if(!next.includes(tabCountMarker))throw new Error('[IDEALO BAR] No se encontró el contador de pestañas para integrar Inicio')
      const homeData=` const homeOccupiedTables=tables.filter(t=>orderByTable.has(t.id)).length
 const homeAvailableTables=tables.filter(t=>t.status==='available'&&!orderByTable.has(t.id)).length
 const homeYesterdayKey=localDay(new Date(Date.now()-86400000))
 const homeYesterdayPaid=orders.filter(o=>o.status==='paid'&&localDay(o.closed_at)===homeYesterdayKey)
 const homeYesterdaySales=homeYesterdayPaid.reduce((sum,o)=>sum+Number(o.total||0),0)
 const homeSalesDelta=homeYesterdaySales>0?((todaysSales-homeYesterdaySales)/homeYesterdaySales)*100:null
 const homeOrderById=new Map(orders.map(o=>[o.id,o]))
 const homeProductTotals=new Map()
 items.forEach(item=>{
  if(item.status==='cancelled'||item.voided_at||localDay(item.created_at)!==todayKey())return
  const order=homeOrderById.get(item.order_id);if(order?.status==='cancelled')return
  const key=item.menu_item_id||item.product_id||item.item_name;if(!key)return
  const current=homeProductTotals.get(key)||{name:item.item_name||'Producto',quantity:0,revenue:0}
  const amount=Number(item.quantity||0);current.quantity+=amount;current.revenue+=amount*Number(item.unit_price||0);homeProductTotals.set(key,current)
 })
 const homeTopProducts=[...homeProductTotals.values()].sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,5)
 const homeStaleOrders=activeOrders.map(order=>({order,minutes:Math.max(0,Math.floor((Date.now()-new Date(order.opened_at||order.created_at).getTime())/60000))})).filter(row=>row.minutes>=25).sort((a,b)=>b.minutes-a.minutes)
 const homeUpcomingReservations=reservations.filter(row=>['pending','confirmed'].includes(row.status)).map(row=>({row,minutes:Math.round((new Date(row.reserved_for).getTime()-Date.now())/60000)})).filter(entry=>entry.minutes>=-30&&entry.minutes<=90).sort((a,b)=>a.minutes-b.minutes)
 const homeLowInventory=homeInventory.filter(item=>{const stock=Number(item.current_stock||0),minimum=Number(item.minimum_stock||0),reorder=Number(item.reorder_point||0);return stock<=0||(minimum>0&&stock<=minimum)||(reorder>0&&stock<=reorder)}).sort((a,b)=>Number(a.current_stock||0)-Number(b.current_stock||0))
 const homeTakeawayDelivery=activeOrders.filter(o=>o.order_type==='takeaway'||o.order_type==='delivery')
 const homeCashCollected=cashPayments.reduce((sum,p)=>sum+Number(p.amount||0),0)
 const homeCashExpected=openSession?Number(openSession.opening_balance||0)+methodSum('cash'):0
 const homeAttentionCount=waitingBill+homeStaleOrders.length+homeUpcomingReservations.length+homeLowInventory.length+kitchenPending+barPending
 const homeNextReservation=reservations.filter(r=>['pending','confirmed'].includes(r.status)&&new Date(r.reserved_for).getTime()>=Date.now()).sort((a,b)=>new Date(a.reserved_for)-new Date(b.reserved_for))[0]||null`
      next=next.replace(tabCountMarker,homeData+'\n'+tabCountMarker)

      const homePattern=/  \{tab==='Resumen'&&<>[\s\S]*?\n  <\/\>\}/
      if(!homePattern.test(next))throw new Error('[IDEALO BAR] No se encontró el bloque visual de Resumen')
      const homeBlock=`  {tab==='Inicio'&&<section className="barops-home-dashboard">
   <header className="barops-home-head"><div><small>Centro de control del turno</small><h2>Inicio</h2><p>Lo más importante del bar, ordenado por prioridad y listo para actuar.</p></div><div className={'barops-home-attention '+(homeAttentionCount?'has-alerts':'clear')}><span>{homeAttentionCount?'!':'✓'}</span><div><b>{homeAttentionCount||'Todo al día'}</b><small>{homeAttentionCount?'situaciones por revisar':'Sin alertas operativas'}</small></div></div></header>
   <div className="barops-home-kpis">
    {can('cash.view')&&<article><span>Ventas hoy</span><b>{money.format(todaysSales)}</b><small>{homeSalesDelta===null?'Sin comparación con ayer':(homeSalesDelta>=0?'+':'')+homeSalesDelta.toFixed(1)+'% vs ayer'}</small></article>}
    <article><span>Mesas</span><b>{homeOccupiedTables}<em> / {tables.length}</em></b><small>{homeAvailableTables} disponibles · {waitingBill} piden cuenta</small></article>
    <article><span>Pedidos activos</span><b>{activeOrders.length}</b><small>{homeStaleOrders.length} con más de 25 min</small></article>
    <article><span>Cocina + Barra</span><b>{kitchenPending+barPending}</b><small>{kitchenPending} cocina · {barPending} barra</small></article>
    <article><span>Reservas hoy</span><b>{todayReservations.length}</b><small>{homeNextReservation?'Próxima '+localTime(homeNextReservation.reserved_for):'Sin próximas llegadas'}</small></article>
    {can('cash.view')&&<article><span>Caja</span><b className={openSession?'open':'closed'}>{openSession?'ABIERTA':'CERRADA'}</b><small>{openSession?money.format(homeCashCollected)+' cobrado en turno':'Abrir antes de cobrar'}</small></article>}
   </div>
   <div className="barops-home-actions">
    {can('order.create')&&<button onClick={()=>setTab('Salón y ventas')}><span>▦</span><div><b>Abrir mesa</b><small>Ver las 20 mesas</small></div></button>}
    {can('order.create')&&<button onClick={()=>createOrder('takeaway')}><span>🥡</span><div><b>Para llevar</b><small>Nuevo pedido rápido</small></div></button>}
    {can('order.create')&&can('delivery.manage')&&<button onClick={()=>createOrder('delivery')}><span>⌖</span><div><b>Delivery</b><small>Crear pedido a domicilio</small></div></button>}
    {can('reservation.manage')&&<button onClick={()=>setTab('Reservas')}><span>◷</span><div><b>Nueva reserva</b><small>Cliente, hora y mesa</small></div></button>}
    {can('payment.take')&&<button onClick={()=>setTab('Pedidos')}><span>$</span><div><b>Cobrar</b><small>Ir a cuentas pendientes</small></div></button>}
    {can('cash.view')&&<button onClick={()=>setTab('Caja y cierre')}><span>▣</span><div><b>Caja</b><small>{openSession?'Revisar turno':'Abrir turno'}</small></div></button>}
   </div>
   <div className="barops-home-main-grid">
    <section className="barops-home-panel attention-panel"><header><div><small>Prioridad</small><h3>Necesita atención</h3></div><b>{homeAttentionCount}</b></header><div className="barops-home-alert-list">
     {tables.filter(t=>t.status==='awaiting_payment').slice(0,3).map(table=>{const order=orderByTable.get(table.id);return <button key={'bill-'+table.id} onClick={()=>{if(order){setSelectedOrderId(order.id);setTab('Salón y ventas')}}}><span className="alert-icon">$</span><div><b>{table.name} pide cuenta</b><small>{order?money.format(Number(order.total||0))+' · '+elapsed(order.opened_at):'Atender mesa'}</small></div><em>Atender</em></button>})}
     {homeStaleOrders.slice(0,3).map(({order,minutes})=>{const table=tableById.get(order.table_id);return <button key={'old-'+order.id} onClick={()=>{setSelectedOrderId(order.id);setTab('Salón y ventas')}}><span className="alert-icon">◷</span><div><b>{table?.name||orderTypeLabel[order.order_type]} lleva {minutes} min</b><small>{order.order_code} · {orderStatusLabel[order.status]}</small></div><em>Abrir</em></button>})}
     {homeUpcomingReservations.slice(0,3).map(({row,minutes})=><button key={'res-'+row.id} onClick={()=>setTab('Reservas')}><span className="alert-icon">◷</span><div><b>{row.customer_name} · {row.party_size} personas</b><small>{minutes<0?'Llegó hace '+Math.abs(minutes)+' min':minutes===0?'Llega ahora':'Llega en '+minutes+' min'} · {tableById.get(row.table_id)?.name||'Sin mesa'}</small></div><em>Ver</em></button>)}
     {(kitchenPending>0||barPending>0)&&<button onClick={()=>setTab(kitchenPending>=barPending?'Cocina':'Barra')}><span className="alert-icon">≡</span><div><b>Producción pendiente</b><small>{kitchenPending} cocina · {barPending} barra</small></div><em>Revisar</em></button>}
     {(can('inventory.view')||can('inventory.manage'))&&homeLowInventory.slice(0,3).map(item=><div className="barops-home-alert-static" key={'stock-'+item.id}><span className="alert-icon">!</span><div><b>{item.name}</b><small>Stock {qty(item.current_stock)} {item.unit||''} · revisar Inventario</small></div><em>Stock bajo</em></div>)}
     {!homeAttentionCount&&<div className="barops-home-all-clear"><span>✓</span><div><b>Turno bajo control</b><small>No hay situaciones urgentes en este momento.</small></div></div>}
    </div></section>
    <section className="barops-home-panel"><header><div><small>Salón</small><h3>Mesas y pedidos</h3></div><button onClick={()=>setTab('Salón y ventas')}>Ver salón</button></header><div className="barops-home-status-grid"><div><span>Disponibles</span><b>{homeAvailableTables}</b></div><div><span>Ocupadas</span><b>{homeOccupiedTables}</b></div><div className="accent"><span>Piden cuenta</span><b>{waitingBill}</b></div><div><span>Llevar / Delivery</span><b>{homeTakeawayDelivery.length}</b></div></div><div className="barops-home-mini-orders">{activeOrders.slice(0,5).map(order=>{const table=tableById.get(order.table_id);return <button key={order.id} onClick={()=>{setSelectedOrderId(order.id);setTab('Salón y ventas')}}><div><b>{table?.name||orderTypeLabel[order.order_type]}</b><small>{order.order_code} · {elapsed(order.opened_at)}</small></div><strong>{money.format(Number(order.total||0))}</strong></button>})}{!activeOrders.length&&<div className="barops-home-empty">Sin pedidos abiertos</div>}</div></section>
    {can('cash.view')&&<section className="barops-home-panel"><header><div><small>Dinero</small><h3>Caja del turno</h3></div><span className={'barops-home-cash-state '+(openSession?'open':'closed')}>{openSession?'ABIERTA':'CERRADA'}</span></header>{openSession?<><div className="barops-home-cash-total"><span>Total cobrado</span><b>{money.format(homeCashCollected)}</b><small>Desde {localTime(openSession.opened_at)}</small></div><div className="barops-home-methods"><div><span>Efectivo</span><b>{money.format(methodSum('cash'))}</b></div><div><span>Tarjeta</span><b>{money.format(methodSum('card'))}</b></div><div><span>Transferencia</span><b>{money.format(methodSum('transfer'))}</b></div><div><span>Efectivo estimado</span><b>{money.format(homeCashExpected)}</b></div></div></>:<div className="barops-home-empty-action"><span>$</span><b>Caja cerrada</b><small>Abrí un turno antes de registrar cobros.</small><button onClick={()=>setTab('Caja y cierre')}>Ir a Caja</button></div>}</section>}
    <section className="barops-home-panel"><header><div><small>Demanda</small><h3>Más consumidos hoy</h3></div><span>{homeTopProducts.length}</span></header><div className="barops-home-top-products">{homeTopProducts.map((row,index)=><div key={row.name+'-'+index}><span>{index+1}</span><div><b>{row.name}</b><small>{qty(row.quantity)} vendidos</small></div><strong>{money.format(row.revenue)}</strong></div>)}{!homeTopProducts.length&&<div className="barops-home-empty">Aún no hay consumo registrado hoy.</div>}</div></section>
    <section className="barops-home-panel"><header><div><small>Reservas</small><h3>Próximas llegadas</h3></div><button onClick={()=>setTab('Reservas')}>Ver agenda</button></header><div className="barops-home-reservations">{reservations.filter(r=>['pending','confirmed'].includes(r.status)&&new Date(r.reserved_for).getTime()>=Date.now()).sort((a,b)=>new Date(a.reserved_for)-new Date(b.reserved_for)).slice(0,5).map(row=><button key={row.id} onClick={()=>setTab('Reservas')}><div className="time"><b>{localTime(row.reserved_for)}</b><span>{localDay(row.reserved_for)===todayKey()?'HOY':new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',weekday:'short'}).format(new Date(row.reserved_for))}</span></div><div><b>{row.customer_name}</b><small>{row.party_size} personas · {tableById.get(row.table_id)?.name||'Mesa por asignar'}</small></div><em>{row.status==='confirmed'?'Confirmada':'Pendiente'}</em></button>)}{!homeNextReservation&&<div className="barops-home-empty">Sin próximas reservas.</div>}</div></section>
    {(can('inventory.view')||can('inventory.manage'))&&<section className="barops-home-panel"><header><div><small>Existencias</small><h3>Alertas de inventario</h3></div><b>{homeLowInventory.length}</b></header>{!homeInventoryReady?<div className="barops-home-empty">Revisando existencias…</div>:<div className="barops-home-stock-list">{homeLowInventory.slice(0,6).map(item=><div key={item.id}><span className={Number(item.current_stock||0)<=0?'zero':'low'}>!</span><div><b>{item.name}</b><small>Actual {qty(item.current_stock)} {item.unit||''} · mínimo {qty(item.minimum_stock||item.reorder_point||0)}</small></div></div>)}{!homeLowInventory.length&&<div className="barops-home-all-clear compact"><span>✓</span><div><b>Existencias sin alertas</b><small>No hay insumos por debajo de sus mínimos.</small></div></div>}</div>}</section>}
   </div>
  </section>}`
      next=next.replace(homePattern,homeBlock)
      next="import '../../bar/src/home-dashboard.css'\n"+next
      return{code:next,map:null}
    },
  }
}
