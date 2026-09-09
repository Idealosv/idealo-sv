import { useCallback, useEffect, useMemo, useState } from 'react'

const OPEN_ORDER_STATUSES=['open','sent','preparing','ready','served']
const PREP_STATUSES=['sent','preparing','ready']
const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})

const tableStatusLabel={available:'Disponible',occupied:'Ocupada',awaiting_payment:'Cuenta',reserved:'Reservada',inactive:'Inactiva'}
const orderTypeLabel={table:'Mesa',takeaway:'Para llevar',delivery:'Delivery'}
const orderStatusLabel={open:'Abierta',sent:'Enviada',preparing:'Preparando',ready:'Lista',served:'Servida',paid:'Pagada',cancelled:'Anulada'}

const productProfile=name=>{
 const value=String(name||'').toLowerCase()
 if(/cerveza|pilsener|suprema|golden|corona|modelo|heineken|regia|stella|budweiser|cubeta/.test(value))return{category:'Cervezas',station:'bar',emoji:'🍺'}
 if(/bebida|soda|gaseosa|coca|pepsi|sprite|fanta|agua|jugo|limonada|michelada|coctel|té|te |café|cafe/.test(value))return{category:'Bebidas',station:'bar',emoji:'🥤'}
 if(/alita|boneless/.test(value))return{category:'Alitas',station:'kitchen',emoji:'🍗'}
 if(/hamburg|burger/.test(value))return{category:'Hamburguesas',station:'kitchen',emoji:'🍔'}
 if(/papa|frita/.test(value))return{category:'Papas',station:'kitchen',emoji:'🍟'}
 if(/hot dog|hotdog|perro/.test(value))return{category:'Hot Dogs',station:'kitchen',emoji:'🌭'}
 if(/nacho/.test(value))return{category:'Nachos',station:'kitchen',emoji:'🧀'}
 return{category:'Comida',station:'kitchen',emoji:'🍽️'}
}

const elapsed=createdAt=>{
 const minutes=Math.max(0,Math.floor((Date.now()-new Date(createdAt).getTime())/60000))
 if(minutes<1)return'Ahora'
 if(minutes<60)return`${minutes} min`
 return`${Math.floor(minutes/60)} h ${minutes%60} min`
}

export default function IdealoBar({company,supabase}){
 const companyId=company?.id
 const [tab,setTab]=useState('Salón')
 const [tables,setTables]=useState([])
 const [menu,setMenu]=useState([])
 const [orders,setOrders]=useState([])
 const [items,setItems]=useState([])
 const [selectedOrderId,setSelectedOrderId]=useState(null)
 const [category,setCategory]=useState('Todos')
 const [query,setQuery]=useState('')
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')

 const run=useCallback(async task=>{
  setWorking(true);setError('')
  try{return await task()}catch(err){setError(String(err?.message||err||'No se pudo completar la operación.'));return null}finally{setWorking(false)}
 },[])

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const [tablesRes,menuRes,ordersRes,itemsRes]=await Promise.all([
    supabase.from('bar_tables').select('*').eq('company_id',companyId).eq('active',true).order('sort_order').order('name'),
    supabase.from('bar_menu_items').select('*').eq('company_id',companyId).eq('active',true).order('sort_order').order('category'),
    supabase.from('bar_orders').select('*').eq('company_id',companyId).in('status',OPEN_ORDER_STATUSES).order('opened_at'),
    supabase.from('bar_order_items').select('*').eq('company_id',companyId).neq('status','cancelled').order('created_at'),
   ])
   const firstError=[tablesRes,menuRes,ordersRes,itemsRes].find(result=>result.error)?.error
   if(firstError)throw firstError
   const menuRows=menuRes.data||[]
   const productIds=[...new Set(menuRows.map(row=>row.product_id).filter(Boolean))]
   let productMap=new Map()
   if(productIds.length){
    const productsRes=await supabase.from('finished_products').select('id,name,sale_price,active,sku').in('id',productIds)
    if(productsRes.error)throw productsRes.error
    productMap=new Map((productsRes.data||[]).map(product=>[product.id,product]))
   }
   setTables(tablesRes.data||[])
   setMenu(menuRows.map(row=>({...row,product:productMap.get(row.product_id)||null})).filter(row=>row.product?.active!==false))
   setOrders(ordersRes.data||[])
   setItems(itemsRes.data||[])
  }catch(err){setError(String(err?.message||err||'No se pudo cargar IDEALO BAR.'))}finally{setLoading(false)}
 },[companyId,supabase])

 useEffect(()=>{load()},[load])
 useEffect(()=>{if(selectedOrderId&&!orders.some(order=>order.id===selectedOrderId))setSelectedOrderId(null)},[orders,selectedOrderId])

 const selectedOrder=orders.find(order=>order.id===selectedOrderId)||null
 const selectedItems=items.filter(item=>item.order_id===selectedOrderId&&item.status!=='cancelled')
 const categories=useMemo(()=>['Todos',...new Set(menu.map(item=>item.category).filter(Boolean))],[menu])
 const filteredMenu=useMemo(()=>menu.filter(item=>{
  const label=item.display_name||item.product?.name||''
  return(category==='Todos'||item.category===category)&&(!query||label.toLowerCase().includes(query.trim().toLowerCase()))
 }),[menu,category,query])
 const orderByTable=useMemo(()=>new Map(orders.filter(order=>order.table_id).map(order=>[order.table_id,order])),[orders])
 const tableById=useMemo(()=>new Map(tables.map(table=>[table.id,table])),[tables])

 const createTables=()=>run(async()=>{
  if(tables.length)return
  const payload=Array.from({length:12},(_,index)=>({company_id:companyId,name:`Mesa ${String(index+1).padStart(2,'0')}`,area:'Salón',capacity:4,sort_order:index+1}))
  const {error:insertError}=await supabase.from('bar_tables').insert(payload)
  if(insertError)throw insertError
  await load()
 })

 const activateProducts=()=>run(async()=>{
  const {data:products,error:productsError}=await supabase.from('finished_products').select('id,name,sale_price,active').eq('company_id',companyId).eq('active',true).order('name').limit(500)
  if(productsError)throw productsError
  if(!products?.length)throw new Error('Primero agregá productos activos en IDEALO SV > Productos.')
  const payload=products.map((product,index)=>({company_id:companyId,product_id:product.id,...productProfile(product.name),sort_order:index+1}))
  const {error:menuError}=await supabase.from('bar_menu_items').upsert(payload,{onConflict:'company_id,product_id',ignoreDuplicates:true})
  if(menuError)throw menuError
  await load()
 })

 const openTable=table=>run(async()=>{
  const existing=orderByTable.get(table.id)
  if(existing){setSelectedOrderId(existing.id);setTab('Salón');return}
  const {data:order,error:orderError}=await supabase.from('bar_orders').insert({company_id:companyId,table_id:table.id,order_type:'table',status:'open'}).select('*').single()
  if(orderError)throw orderError
  const {error:tableError}=await supabase.from('bar_tables').update({status:'occupied'}).eq('id',table.id).eq('company_id',companyId)
  if(tableError)throw tableError
  await load();setSelectedOrderId(order.id);setTab('Salón')
 })

 const createLooseOrder=type=>run(async()=>{
  const {data:order,error:orderError}=await supabase.from('bar_orders').insert({company_id:companyId,order_type:type,status:'open'}).select('*').single()
  if(orderError)throw orderError
  await load();setSelectedOrderId(order.id);setTab('Salón')
 })

 const addItem=menuItem=>run(async()=>{
  if(!selectedOrder)throw new Error('Seleccioná una mesa o creá un pedido para llevar antes de agregar productos.')
  const product=menuItem.product
  if(!product)throw new Error('Este producto ya no está disponible en IDEALO SV.')
  const price=Number(menuItem.sale_price_override??product.sale_price??0)
  const existing=selectedItems.find(item=>item.menu_item_id===menuItem.id&&item.status==='new'&&Number(item.unit_price)===price)
  if(existing){
   const {error:updateError}=await supabase.from('bar_order_items').update({quantity:Number(existing.quantity)+1}).eq('id',existing.id).eq('company_id',companyId)
   if(updateError)throw updateError
  }else{
   const {error:insertError}=await supabase.from('bar_order_items').insert({company_id:companyId,order_id:selectedOrder.id,menu_item_id:menuItem.id,product_id:product.id,item_name:menuItem.display_name||product.name,station:menuItem.station,quantity:1,unit_price:price,status:'new'})
   if(insertError)throw insertError
  }
  await load()
 })

 const adjustNewItem=(item,delta)=>run(async()=>{
  if(item.status!=='new')throw new Error('Un producto ya enviado a preparación no se puede modificar desde el pedido.')
  const next=Number(item.quantity)+delta
  if(next<=0){
   const {error:deleteError}=await supabase.from('bar_order_items').delete().eq('id',item.id).eq('company_id',companyId)
   if(deleteError)throw deleteError
  }else{
   const {error:updateError}=await supabase.from('bar_order_items').update({quantity:next}).eq('id',item.id).eq('company_id',companyId)
   if(updateError)throw updateError
  }
  await load()
 })

 const sendOrder=()=>run(async()=>{
  if(!selectedOrder)throw new Error('No hay un pedido seleccionado.')
  const pending=selectedItems.filter(item=>item.status==='new')
  if(!pending.length)throw new Error('No hay productos nuevos para enviar.')
  const {error:itemError}=await supabase.from('bar_order_items').update({status:'sent'}).in('id',pending.map(item=>item.id)).eq('company_id',companyId)
  if(itemError)throw itemError
  const {error:orderError}=await supabase.from('bar_orders').update({status:'sent'}).eq('id',selectedOrder.id).eq('company_id',companyId)
  if(orderError)throw orderError
  await load()
 })

 const requestBill=()=>run(async()=>{
  if(!selectedOrder?.table_id)throw new Error('Este pedido no está asociado a una mesa.')
  const {error:tableError}=await supabase.from('bar_tables').update({status:'awaiting_payment'}).eq('id',selectedOrder.table_id).eq('company_id',companyId)
  if(tableError)throw tableError
  await load()
 })

 const advanceItem=item=>run(async()=>{
  const next={sent:'preparing',preparing:'ready',ready:'served'}[item.status]
  if(!next)return
  const {error:itemError}=await supabase.from('bar_order_items').update({status:next}).eq('id',item.id).eq('company_id',companyId)
  if(itemError)throw itemError
  const {data:current,error:currentError}=await supabase.from('bar_order_items').select('status').eq('order_id',item.order_id).neq('status','cancelled')
  if(currentError)throw currentError
  const statuses=(current||[]).map(row=>row.status)
  const orderStatus=statuses.length&&statuses.every(status=>['ready','served'].includes(status))?'ready':'preparing'
  const {error:orderError}=await supabase.from('bar_orders').update({status:orderStatus}).eq('id',item.order_id).eq('company_id',companyId)
  if(orderError)throw orderError
  await load()
 })

 const charge=method=>run(async()=>{
  if(!selectedOrder)throw new Error('No hay un pedido seleccionado.')
  const total=Number(selectedOrder.total||0)
  if(total<=0)throw new Error('El pedido no tiene saldo para cobrar.')
  const {data:sessions,error:sessionError}=await supabase.from('cash_register_sessions').select('id').eq('company_id',companyId).eq('status','open').order('opened_at',{ascending:false}).limit(1)
  if(sessionError)throw sessionError
  const cashSession=sessions?.[0]
  if(!cashSession)throw new Error('Abrí una caja en IDEALO SV antes de cobrar. IDEALO BAR siempre registra el cobro contra una sesión de caja activa.')
  const {error:paymentError}=await supabase.from('bar_payments').insert({company_id:companyId,order_id:selectedOrder.id,cash_register_session_id:cashSession.id,method,amount:total})
  if(paymentError)throw paymentError
  const {data:userData}=await supabase.auth.getUser()
  const {error:orderError}=await supabase.from('bar_orders').update({status:'paid',closed_at:new Date().toISOString(),closed_by:userData?.user?.id||null}).eq('id',selectedOrder.id).eq('company_id',companyId)
  if(orderError)throw orderError
  if(selectedOrder.table_id){
   const {error:tableError}=await supabase.from('bar_tables').update({status:'available'}).eq('id',selectedOrder.table_id).eq('company_id',companyId)
   if(tableError)throw tableError
  }
  setSelectedOrderId(null);await load()
 })

 const stationBoard=station=>{
  const stationItems=items.filter(item=>item.station===station&&PREP_STATUSES.includes(item.status))
  return <div className="bar-station-grid">{stationItems.length?stationItems.map(item=>{
   const order=orders.find(candidate=>candidate.id===item.order_id)
   const table=order?.table_id?tableById.get(order.table_id):null
   const action=item.status==='sent'?'Preparar':item.status==='preparing'?'Marcar listo':'Servido'
   return <article className={`bar-station-card status-${item.status}`} key={item.id}>
    <header><div><strong>{table?.name||orderTypeLabel[order?.order_type]||'Pedido'}</strong><small>{order?.order_code}</small></div><span>{elapsed(item.created_at)}</span></header>
    <div className="bar-station-item"><b>{Number(item.quantity)}×</b><span>{item.item_name}</span></div>
    {item.notes&&<p>{item.notes}</p>}
    <button type="button" disabled={working} onClick={()=>advanceItem(item)}>{action}</button>
   </article>
  }):<div className="bar-empty-state"><span>✓</span><strong>Sin pendientes</strong><p>No hay productos esperando en esta estación.</p></div>}</div>
 }

 if(loading)return <div className="bar-loading"><span>IDEALO BAR</span><strong>Cargando operación…</strong></div>

 return <div className="idealo-bar-shell">
  <header className="bar-hero">
   <div><span className="bar-kicker">IDEALO SV · Operación especializada</span><h2>IDEALO BAR</h2><p>{company?.name||'Empresa'} · Mesas, pedidos, cocina, barra y cobro</p></div>
   <div className="bar-live"><i/> En línea</div>
  </header>

  {error&&<div className="bar-alert" role="alert"><span>!</span><p>{error}</p><button type="button" onClick={()=>setError('')}>×</button></div>}

  <nav className="bar-tabs" aria-label="Secciones de IDEALO BAR">
   {['Salón','Pedidos','Cocina','Barra'].map(name=><button type="button" key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}>{name==='Salón'?'▦':name==='Pedidos'?'≡':name==='Cocina'?'♨':'◉'} <span>{name}</span>{(name==='Cocina'||name==='Barra')&&<b>{items.filter(item=>item.station===(name==='Cocina'?'kitchen':'bar')&&PREP_STATUSES.includes(item.status)).length}</b>}</button>)}
  </nav>

  {(!tables.length||!menu.length)&&<section className="bar-setup">
   <div><span>⚡</span><div><strong>Preparación inicial</strong><p>IDEALO BAR reutiliza los productos y la empresa de IDEALO SV. No crea un catálogo separado.</p></div></div>
   <div className="bar-setup-actions">{!tables.length&&<button type="button" disabled={working} onClick={createTables}>Crear 12 mesas</button>}{!menu.length&&<button type="button" disabled={working} onClick={activateProducts}>Activar productos de IDEALO SV</button>}</div>
  </section>}

  {tab==='Salón'&&<div className="bar-pos-layout">
   <aside className="bar-floor-panel">
    <div className="bar-section-head"><div><span>Salón</span><strong>Mesas</strong></div><div className="bar-quick-order"><button type="button" onClick={()=>createLooseOrder('takeaway')} disabled={working}>+ Llevar</button><button type="button" onClick={()=>createLooseOrder('delivery')} disabled={working}>+ Delivery</button></div></div>
    <div className="bar-table-grid">{tables.map(table=>{
     const order=orderByTable.get(table.id)
     const effectiveStatus=order?(table.status==='awaiting_payment'?'awaiting_payment':'occupied'):table.status
     return <button type="button" key={table.id} className={`bar-table status-${effectiveStatus} ${selectedOrder?.table_id===table.id?'selected':''}`} onClick={()=>openTable(table)} disabled={working||effectiveStatus==='inactive'}>
      <span className="bar-table-dot"/><strong>{table.name}</strong><small>{tableStatusLabel[effectiveStatus]||effectiveStatus}</small>{order&&<b>{money.format(Number(order.total||0))}</b>}
     </button>
    })}</div>
   </aside>

   <main className="bar-catalog-panel">
    <div className="bar-catalog-tools"><label><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar cerveza, hamburguesa, alitas…"/></label></div>
    <div className="bar-category-strip">{categories.map(name=><button type="button" key={name} className={category===name?'active':''} onClick={()=>setCategory(name)}>{name}</button>)}</div>
    <div className="bar-product-grid">{filteredMenu.map(item=>{
     const product=item.product
     const label=item.display_name||product?.name||'Producto'
     const price=Number(item.sale_price_override??product?.sale_price??0)
     return <button type="button" className="bar-product-card" key={item.id} onClick={()=>addItem(item)} disabled={working||!selectedOrder}>
      <span className="bar-product-emoji">{item.emoji||productProfile(label).emoji}</span><strong>{label}</strong><small>{item.category} · {item.station==='bar'?'Barra':'Cocina'}</small><b>{money.format(price)}</b>
     </button>
    })}</div>
    {!filteredMenu.length&&<div className="bar-empty-state"><span>⌕</span><strong>Sin productos</strong><p>Probá otra categoría o activá productos desde IDEALO SV.</p></div>}
   </main>

   <aside className="bar-ticket-panel">
    {selectedOrder?<>
     <header className="bar-ticket-head"><div><span>Pedido actual</span><strong>{selectedOrder.table_id?tableById.get(selectedOrder.table_id)?.name:orderTypeLabel[selectedOrder.order_type]}</strong><small>{selectedOrder.order_code} · {orderStatusLabel[selectedOrder.status]}</small></div><button type="button" onClick={()=>setSelectedOrderId(null)}>×</button></header>
     <div className="bar-ticket-items">{selectedItems.length?selectedItems.map(item=><div className="bar-ticket-line" key={item.id}>
      <div><strong>{item.item_name}</strong><small>{item.status==='new'?'Sin enviar':orderStatusLabel[item.status]||item.status}</small></div>
      <div className="bar-ticket-qty">{item.status==='new'&&<button type="button" onClick={()=>adjustNewItem(item,-1)} disabled={working}>−</button>}<span>{Number(item.quantity)}</span>{item.status==='new'&&<button type="button" onClick={()=>adjustNewItem(item,1)} disabled={working}>+</button>}</div>
      <b>{money.format(Number(item.line_total||0))}</b>
     </div>):<div className="bar-ticket-empty"><span>＋</span><p>Tocá un producto para agregarlo al pedido.</p></div>}</div>
     <div className="bar-ticket-total"><div><span>Subtotal</span><b>{money.format(Number(selectedOrder.subtotal||0))}</b></div>{Number(selectedOrder.discount_total)>0&&<div><span>Descuento</span><b>−{money.format(Number(selectedOrder.discount_total))}</b></div>}{Number(selectedOrder.tip_total)>0&&<div><span>Propina</span><b>{money.format(Number(selectedOrder.tip_total))}</b></div>}<div className="grand"><span>Total</span><strong>{money.format(Number(selectedOrder.total||0))}</strong></div></div>
     <div className="bar-ticket-actions"><button type="button" className="primary" onClick={sendOrder} disabled={working||!selectedItems.some(item=>item.status==='new')}>Enviar a preparación</button>{selectedOrder.table_id&&<button type="button" onClick={requestBill} disabled={working}>Solicitar cuenta</button>}</div>
     <div className="bar-payment"><span>Cobrar con caja IDEALO SV</span><div><button type="button" onClick={()=>charge('cash')} disabled={working||Number(selectedOrder.total)<=0}>Efectivo</button><button type="button" onClick={()=>charge('card')} disabled={working||Number(selectedOrder.total)<=0}>Tarjeta</button><button type="button" onClick={()=>charge('transfer')} disabled={working||Number(selectedOrder.total)<=0}>Transferencia</button></div></div>
    </>:<div className="bar-ticket-empty large"><span>▦</span><strong>Seleccioná una mesa</strong><p>O creá un pedido para llevar o delivery para comenzar.</p></div>}
   </aside>
  </div>}

  {tab==='Pedidos'&&<section className="bar-orders-view"><div className="bar-section-head"><div><span>Operación</span><strong>Pedidos abiertos</strong></div><b>{orders.length} activos</b></div><div className="bar-orders-grid">{orders.length?orders.map(order=>{
   const orderItems=items.filter(item=>item.order_id===order.id&&item.status!=='cancelled')
   const table=order.table_id?tableById.get(order.table_id):null
   return <button type="button" className="bar-order-card" key={order.id} onClick={()=>{setSelectedOrderId(order.id);setTab('Salón')}}><header><div><strong>{table?.name||orderTypeLabel[order.order_type]}</strong><small>{order.order_code}</small></div><span className={`order-status status-${order.status}`}>{orderStatusLabel[order.status]}</span></header><p>{orderItems.length} líneas · {orderItems.reduce((sum,item)=>sum+Number(item.quantity),0)} productos</p><footer><span>{elapsed(order.opened_at)}</span><b>{money.format(Number(order.total||0))}</b></footer></button>
  }):<div className="bar-empty-state"><span>✓</span><strong>No hay pedidos abiertos</strong><p>Las nuevas ventas aparecerán aquí.</p></div>}</div></section>}

  {tab==='Cocina'&&<section className="bar-board-view"><div className="bar-section-head"><div><span>Estación</span><strong>♨ Cocina</strong></div><b>{items.filter(item=>item.station==='kitchen'&&PREP_STATUSES.includes(item.status)).length} pendientes</b></div>{stationBoard('kitchen')}</section>}
  {tab==='Barra'&&<section className="bar-board-view"><div className="bar-section-head"><div><span>Estación</span><strong>🍺 Barra</strong></div><b>{items.filter(item=>item.station==='bar'&&PREP_STATUSES.includes(item.status)).length} pendientes</b></div>{stationBoard('bar')}</section>}

  {working&&<div className="bar-working" aria-live="polite"><span/> Guardando…</div>}
 </div>
}
