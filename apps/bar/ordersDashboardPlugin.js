export default function standaloneBarOrdersDashboard(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'

  return{
    name:'idealo-bar-standalone-orders-dashboard',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null

      let next=code

      const stateFrom=" const [orderFilter,setOrderFilter]=useState('Activos')\n const [loading,setLoading]=useState(true)"
      const stateTo=" const [orderFilter,setOrderFilter]=useState('Activos')\n const [orderSearch,setOrderSearch]=useState('')\n const [orderDateFrom,setOrderDateFrom]=useState('')\n const [orderDateTo,setOrderDateTo]=useState('')\n const [loading,setLoading]=useState(true)"
      if(!next.includes(stateFrom))throw new Error('[IDEALO BAR] No se encontró el estado de filtros de Pedidos')
      next=next.replace(stateFrom,stateTo)

      const computedFrom=" const filteredOrders=orderFilter==='Activos'?activeOrders:orderFilter==='Hoy pagados'?todaysPaid:orders.filter(o=>o.order_type===orderFilter)\n const tabCount=name=>name==='Salón y ventas'||name==='Pedidos'?activeOrders.length:name==='Cocina'?kitchenPending:name==='Barra'?barPending:name==='Reservas'?todayReservations.length:name==='Delivery'?deliveries.filter(o=>!['delivered','cancelled'].includes(o.fulfillment_status)).length:name==='Caja y cierre'&&openSession?1:0"
      const computedTo=` const orderIsAwaitingBill=order=>Boolean(order?.table_id&&tableById.get(order.table_id)?.status==='awaiting_payment')
 const orderItemCount=useMemo(()=>{const map=new Map();items.filter(item=>item.status!=='cancelled').forEach(item=>map.set(item.order_id,(map.get(item.order_id)||0)+Number(item.quantity||0)));return map},[items])
 const activeTakeawayDelivery=activeOrders.filter(order=>['takeaway','delivery'].includes(order.order_type)).length
 const orderSearchNormalized=orderSearch.trim().toLowerCase()
 const filteredOrders=orders.filter(order=>{
  const matchesFilter=orderFilter==='Todos'||(orderFilter==='Activos'&&OPEN_STATUSES.includes(order.status))||(orderFilter==='Piden cuenta'&&orderIsAwaitingBill(order))||(orderFilter==='Hoy pagados'&&order.status==='paid'&&localDay(order.closed_at)===todayKey())||(orderFilter==='Cancelados'&&order.status==='cancelled')||(['table','takeaway','delivery'].includes(orderFilter)&&order.order_type===orderFilter)
  if(!matchesFilter)return false
  const day=localDay(order.closed_at||order.opened_at||order.created_at)
  if(orderDateFrom&&day<orderDateFrom)return false
  if(orderDateTo&&day>orderDateTo)return false
  if(orderSearchNormalized){
   const table=tableById.get(order.table_id)
   const haystack=[order.order_code,table?.name,order.customer_name,order.customer_phone,orderTypeLabel[order.order_type],orderStatusLabel[order.status],order.delivery_address].filter(Boolean).join(' ').toLowerCase()
   if(!haystack.includes(orderSearchNormalized))return false
  }
  return true
 }).sort((a,b)=>{
  const awaitingDiff=Number(orderIsAwaitingBill(b))-Number(orderIsAwaitingBill(a))
  if(awaitingDiff)return awaitingDiff
  const aActive=OPEN_STATUSES.includes(a.status),bActive=OPEN_STATUSES.includes(b.status)
  if(aActive!==bActive)return aActive?-1:1
  if(aActive&&bActive)return new Date(a.opened_at||a.created_at).getTime()-new Date(b.opened_at||b.created_at).getTime()
  return new Date(b.closed_at||b.created_at).getTime()-new Date(a.closed_at||a.created_at).getTime()
 })
 const tabCount=name=>name==='Salón y ventas'||name==='Pedidos'?activeOrders.length:name==='Cocina'?kitchenPending:name==='Barra'?barPending:name==='Reservas'?todayReservations.length:name==='Delivery'?deliveries.filter(o=>!['delivered','cancelled'].includes(o.fulfillment_status)).length:name==='Caja y cierre'&&openSession?1:0`
      if(!next.includes(computedFrom))throw new Error('[IDEALO BAR] No se encontró el cálculo de Pedidos')
      next=next.replace(computedFrom,computedTo)

      const ordersPattern=/  \{tab==='Pedidos'&&<div className="barops-panel">[\s\S]*?\n\n  \{tab==='Cocina'&&/
      if(!ordersPattern.test(next))throw new Error('[IDEALO BAR] No se encontró el bloque visual de Pedidos')

      const ordersBlock=`  {tab==='Pedidos'&&<div className="barops-panel barops-orders-dashboard">
   <div className="barops-panel-head barops-orders-head"><div><h3>Pedidos</h3><p>Centro de seguimiento de mesas, llevar, delivery y cuentas por cobrar</p></div><div className="barops-orders-visible"><b>{filteredOrders.length}</b><span>visibles</span></div></div>
   <div className="barops-order-kpis">
    <button className={orderFilter==='Activos'?'active':''} onClick={()=>setOrderFilter('Activos')}><span>Activos</span><b>{activeOrders.length}</b><small>Cuentas abiertas</small></button>
    <button className={orderFilter==='Piden cuenta'?'active attention':''} onClick={()=>setOrderFilter('Piden cuenta')}><span>Piden cuenta</span><b>{waitingBill}</b><small>Prioridad de cobro</small></button>
    <button className={['takeaway','delivery'].includes(orderFilter)?'active':''} onClick={()=>setOrderFilter('takeaway')}><span>Llevar / Delivery</span><b>{activeTakeawayDelivery}</b><small>Fuera del salón</small></button>
    <button className={orderFilter==='Hoy pagados'?'active':''} onClick={()=>setOrderFilter('Hoy pagados')}><span>Pagados hoy</span><b>{todaysPaid.length}</b><small>Cuentas cerradas</small></button>
   </div>
   <div className="barops-orders-controls">
    <div className="barops-order-filter-chips">{[['Todos','Todos'],['Activos','Activos'],['Piden cuenta','Piden cuenta'],['table','Mesas'],['takeaway','Llevar'],['delivery','Delivery'],['Hoy pagados','Pagados'],['Cancelados','Cancelados']].map(([value,label])=><button key={value} className={orderFilter===value?'active':''} onClick={()=>setOrderFilter(value)}>{label}</button>)}</div>
    <div className="barops-orders-search-row"><input className="barops-order-search" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} placeholder="Buscar pedido, mesa, cliente o teléfono…"/><label><span>Desde</span><input type="date" value={orderDateFrom} onChange={e=>setOrderDateFrom(e.target.value)}/></label><label><span>Hasta</span><input type="date" value={orderDateTo} onChange={e=>setOrderDateTo(e.target.value)}/></label>{(orderSearch||orderDateFrom||orderDateTo)&&<button className="barops-order-clear" onClick={()=>{setOrderSearch('');setOrderDateFrom('');setOrderDateTo('')}}>Limpiar</button>}</div>
   </div>
   <div className="barops-orders-grid-pro">{filteredOrders.map(order=>{const table=tableById.get(order.table_id);const count=orderItemCount.get(order.id)||0;const awaiting=orderIsAwaitingBill(order);const active=OPEN_STATUSES.includes(order.status);const title=table?.name||orderTypeLabel[order.order_type];const status=awaiting?'Pide cuenta':orderStatusLabel[order.status]||order.status;return <article className={\`barops-order-card-pro \${awaiting?'attention':''} \${active?'is-active':''} \${order.status==='paid'?'is-paid':''}\`} key={order.id} onClick={()=>{if(can('sales.view')){setSelectedOrderId(order.id);setTab('Salón y ventas')}}}>
    <header><div className="barops-order-card-title"><span className="barops-order-type-icon">{order.order_type==='table'?'▦':order.order_type==='takeaway'?'🥡':'⌖'}</span><div><b>{title}</b><small>{order.order_code}</small></div></div><span className={\`barops-status \${awaiting?'attention':''}\`}>{status}</span></header>
    <div className="barops-order-meta"><span>{qty(count)} productos</span><span>{order.guest_count||1} persona(s)</span><span>{active?elapsed(order.opened_at):localDateTime(order.closed_at||order.created_at)}</span></div>
    <div className="barops-order-customer"><strong>{order.customer_name||'Sin cliente asignado'}</strong>{order.customer_phone&&<small>{order.customer_phone}</small>}{order.order_type==='delivery'&&order.delivery_address&&<small>{order.delivery_address}</small>}</div>
    <footer><div><small>{active?'Abierto':'Registrado'} {localTime(order.opened_at||order.created_at)}</small>{awaiting&&<b className="barops-order-priority">Atender cobro</b>}</div><strong>{money.format(Number(order.total||0))}</strong></footer>
    {can('sales.view')&&<div className="barops-order-actions"><button onClick={e=>{e.stopPropagation();setSelectedOrderId(order.id);setTab('Salón y ventas')}}>{active?'Continuar pedido':'Ver detalle'}</button>{active&&can('payment.take')&&<button className="primary" onClick={e=>{e.stopPropagation();setSelectedOrderId(order.id);setToolTab('Dividir / cobrar');setTab('Salón y ventas')}}>Cobrar</button>}</div>}
   </article>})}</div>
   {!filteredOrders.length&&<div className="barops-orders-empty"><div className="barops-orders-empty-icon">≡</div><strong>No hay pedidos que coincidan</strong><p>{orders.length?'Cambiá el filtro, la búsqueda o el rango de fechas.':'Todavía no hay pedidos en el turno.'}</p><div>{can('order.create')&&<button onClick={()=>setTab('Salón y ventas')}>Abrir mesa</button>}{can('order.create')&&<button onClick={()=>createOrder('takeaway')}>Nuevo para llevar</button>}{can('order.create')&&can('delivery.manage')&&<button onClick={()=>createOrder('delivery')}>Nuevo delivery</button>}</div></div>}
  </div>}`

      next=next.replace(ordersPattern,`${ordersBlock}\n\n  {tab==='Cocina'&&`)
      return{code:next,map:null}
    },
  }
}
