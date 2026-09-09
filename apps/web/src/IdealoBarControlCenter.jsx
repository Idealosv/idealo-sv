import {useCallback,useEffect,useMemo,useState} from 'react'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const n=value=>Number(value||0)
const blocks=[
 ['Promociones','🏷️'],['Baldes / Hielerazos','🪣'],['Happy Hour','⏰'],['Cortesías','🎁'],['Mermas','⚠️'],
 ['Consumo interno','👥'],['Caja','💵'],['DTE','🧾'],['Tablero','📊'],['Reposición','📦']
]

export default function IdealoBarControlCenter({company,supabase}){
 const companyId=company?.id
 const [tab,setTab]=useState('Promociones')
 const [products,setProducts]=useState([])
 const [inventory,setInventory]=useState([])
 const [promotions,setPromotions]=useState([])
 const [bundles,setBundles]=useState([])
 const [payments,setPayments]=useState([])
 const [orders,setOrders]=useState([])
 const [dteRequests,setDteRequests]=useState([])
 const [dteDocs,setDteDocs]=useState([])
 const [clients,setClients]=useState([])
 const [cashAccounts,setCashAccounts]=useState([])
 const [dashboard,setDashboard]=useState(null)
 const [alerts,setAlerts]=useState([])
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [promo,setPromo]=useState({productId:'',name:'',pricingMode:'PERCENT_OFF',value:'10',minQuantity:'1',startTime:'',endTime:''})
 const [bundle,setBundle]=useState({name:'',type:'BALDE',inventoryId:'',units:'6',price:'',iceId:'',iceQuantity:'0'})
 const [productEvent,setProductEvent]=useState({productId:'',quantity:'1',reason:''})
 const [stockEvent,setStockEvent]=useState({inventoryId:'',quantity:'1',type:'WASTE',reason:''})
 const [cashAccountId,setCashAccountId]=useState('')
 const [dteForm,setDteForm]=useState({orderId:'',clientId:'',type:'01',environment:'test'})
 const [linkForm,setLinkForm]=useState({requestId:'',dteId:''})
 const [range,setRange]=useState(()=>({from:localDate(),to:localDate()}))

 const run=useCallback(async(task,message)=>{
  setWorking(true);setError('');setSuccess('')
  try{const result=await task();if(message)setSuccess(message);return result}
  catch(err){setError(String(err?.message||err||'No se pudo completar la operación.'));return null}
  finally{setWorking(false)}
 },[])

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const results=await Promise.all([
    supabase.from('finished_products').select('id,name,sale_price,category,subcategory,active').eq('company_id',companyId).eq('active',true).order('name').limit(1000),
    supabase.from('inventory_items').select('id,name,sku,unit,current_stock,average_cost,minimum_stock,reorder_point,target_stock,active').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('name').limit(1000),
    supabase.from('bar_promotions').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
    supabase.from('bar_bundle_definitions').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
    supabase.from('bar_payments').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
    supabase.from('bar_orders').select('id,order_code,order_type,status,total,closed_at,customer_name').eq('company_id',companyId).order('created_at',{ascending:false}).limit(200),
    supabase.from('bar_dte_requests').select('*').eq('company_id',companyId).order('requested_at',{ascending:false}).limit(100),
    supabase.from('clients').select('id,name,trade_name,preferred_dte_type,status').eq('company_id',companyId).eq('status','active').order('name').limit(500),
    supabase.from('dte_documents').select('id,control_number,dte_type,environment,status,client_id,bar_order_id').eq('company_id',companyId).in('status',['DRAFT','SIGNED','SENT','REJECTED']).order('created_at',{ascending:false}).limit(100),
    supabase.from('cash_accounts').select('id,name,account_type,active').eq('company_id',companyId).eq('active',true).order('name')
   ])
   const firstError=results.find(result=>result.error)?.error
   if(firstError)throw firstError
   setProducts(results[0].data||[]);setInventory(results[1].data||[]);setPromotions(results[2].data||[]);setBundles(results[3].data||[])
   setPayments(results[4].data||[]);setOrders(results[5].data||[]);setDteRequests(results[6].data||[]);setClients(results[7].data||[]);setDteDocs(results[8].data||[]);setCashAccounts(results[9].data||[])
   const [{data:dash,error:dashError},{data:stockAlerts,error:alertError}]=await Promise.all([
    supabase.rpc('bar_owner_dashboard',{p_company_id:companyId,p_from:range.from,p_to:range.to}),
    supabase.rpc('bar_stock_alerts',{p_company_id:companyId})
   ])
   if(!dashError)setDashboard(dash||null);else setDashboard(null)
   if(!alertError)setAlerts(stockAlerts||[]);else setAlerts([])
  }catch(err){setError(String(err?.message||err||'No se pudo cargar el Centro de Control.'))}
  finally{setLoading(false)}
 },[companyId,supabase,range.from,range.to])
 useEffect(()=>{load()},[load])

 const productById=useMemo(()=>new Map(products.map(row=>[row.id,row])),[products])
 const inventoryById=useMemo(()=>new Map(inventory.map(row=>[row.id,row])),[inventory])
 const orderById=useMemo(()=>new Map(orders.map(row=>[row.id,row])),[orders])
 const pendingPayments=payments.filter(row=>row.financial_posting_status!=='posted')
 const paidOrders=orders.filter(row=>row.status==='paid')

 const savePromotion=type=>run(async()=>{
  if(!promo.productId||!promo.name.trim())throw new Error('Seleccioná producto y escribí el nombre de la promoción.')
  const payload={company_id:companyId,product_id:promo.productId,name:promo.name.trim(),promotion_type:type,pricing_mode:promo.pricingMode,price_value:n(promo.value),min_quantity:n(promo.minQuantity)||1,days_of_week:[0,1,2,3,4,5,6],priority:100,active:true}
  if(type==='HAPPY_HOUR'){if(!promo.startTime||!promo.endTime)throw new Error('Definí hora de inicio y fin del Happy Hour.');payload.start_time=promo.startTime;payload.end_time=promo.endTime}
  const {error:insertError}=await supabase.from('bar_promotions').insert(payload);if(insertError)throw insertError
  setPromo(current=>({...current,name:''}));await load()
 },type==='HAPPY_HOUR'?'Happy Hour creado.':'Promoción creada.')

 const createBundle=()=>run(async()=>{
  if(!bundle.name.trim()||!bundle.inventoryId)throw new Error('Indicá nombre y cerveza/insumo principal.')
  const {error:rpcError}=await supabase.rpc('bar_create_bundle',{p_company_id:companyId,p_name:bundle.name.trim(),p_offer_type:bundle.type,p_primary_inventory_item_id:bundle.inventoryId,p_units:n(bundle.units),p_sale_price:n(bundle.price),p_ice_inventory_item_id:bundle.iceId||null,p_ice_quantity:n(bundle.iceQuantity)})
  if(rpcError)throw rpcError
  setBundle(current=>({...current,name:'',price:''}));await load()
 },`${bundle.type==='BALDE'?'Balde':'Hielerazo'} creado y conectado a Inventario.`)

 const recordProductEvent=eventType=>run(async()=>{
  if(!productEvent.productId||!productEvent.reason.trim())throw new Error('Seleccioná producto e indicá el motivo.')
  const {error:rpcError}=await supabase.rpc('bar_record_product_event',{p_company_id:companyId,p_product_id:productEvent.productId,p_quantity:n(productEvent.quantity),p_event_type:eventType,p_reason:productEvent.reason.trim()});if(rpcError)throw rpcError
  setProductEvent(current=>({...current,reason:''}));await load()
 },eventType==='COURTESY'?'Cortesía registrada y descontada del inventario.':'Consumo interno registrado.')

 const recordStockEvent=()=>run(async()=>{
  if(!stockEvent.inventoryId||!stockEvent.reason.trim())throw new Error('Seleccioná insumo e indicá el motivo.')
  const {error:rpcError}=await supabase.rpc('bar_record_inventory_event',{p_company_id:companyId,p_inventory_item_id:stockEvent.inventoryId,p_quantity:n(stockEvent.quantity),p_event_type:stockEvent.type,p_reason:stockEvent.reason.trim()});if(rpcError)throw rpcError
  setStockEvent(current=>({...current,reason:''}));await load()
 },stockEvent.type==='WASTE'?'Merma registrada.':'Producto dañado registrado.')

 const postPending=payment=>run(async()=>{
  if(!cashAccountId)throw new Error('Seleccioná la cuenta donde debe quedar contabilizado el cobro.')
  const {error:rpcError}=await supabase.rpc('bar_post_pending_payment',{p_payment_id:payment.id,p_cash_account_id:cashAccountId});if(rpcError)throw rpcError
  await load()
 },'Cobro conciliado con Caja/Banco de IDEALO SV.')

 const requestDte=()=>run(async()=>{
  if(!dteForm.orderId)throw new Error('Seleccioná un pedido pagado.')
  if(dteForm.type==='03'&&!dteForm.clientId)throw new Error('El Crédito Fiscal requiere cliente.')
  const {error:rpcError}=await supabase.rpc('bar_request_dte',{p_order_id:dteForm.orderId,p_client_id:dteForm.clientId||null,p_dte_type:dteForm.type,p_environment:dteForm.environment});if(rpcError)throw rpcError
  await load()
 },'Solicitud DTE enviada a la cola fiscal de IDEALO SV.')

 const linkDte=()=>run(async()=>{
  if(!linkForm.requestId||!linkForm.dteId)throw new Error('Seleccioná solicitud y borrador DTE.')
  const {error:rpcError}=await supabase.rpc('bar_link_dte_request',{p_request_id:linkForm.requestId,p_dte_document_id:linkForm.dteId});if(rpcError)throw rpcError
  await load()
 },'DTE vinculado al pedido del bar sin duplicar el ingreso.')

 const prepareRestock=alert=>run(async()=>{
  const {data,error:rpcError}=await supabase.rpc('bar_prepare_restock',{p_company_id:companyId,p_inventory_item_id:alert.inventory_item_id});if(rpcError)throw rpcError
  await load();return data
 },'Compra de reposición preparada en Compras de IDEALO SV.')

 const productSelect=value=><select value={value.value} onChange={event=>value.onChange(event.target.value)}><option value="">Seleccionar producto…</option>{products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
 const inventorySelect=value=><select value={value.value} onChange={event=>value.onChange(event.target.value)}><option value="">Seleccionar insumo…</option>{inventory.map(row=><option key={row.id} value={row.id}>{row.name} · {n(row.current_stock)} {row.unit}</option>)}</select>

 const promotionForm=type=><div className="bar-admin-grid two">
  <label>Producto{productSelect({value:promo.productId,onChange:productId=>setPromo(current=>({...current,productId}))})}</label>
  <label>Nombre<input value={promo.name} onChange={e=>setPromo(c=>({...c,name:e.target.value}))} placeholder={type==='HAPPY_HOUR'?'Happy Hour Pilsener':'Promo especial'}/></label>
  <label>Forma de precio<select value={promo.pricingMode} onChange={e=>setPromo(c=>({...c,pricingMode:e.target.value}))}><option value="PERCENT_OFF">% descuento</option><option value="AMOUNT_OFF">$ descuento</option><option value="FIXED_PRICE">Precio fijo</option></select></label>
  <label>Valor<input type="number" min="0" step="0.01" value={promo.value} onChange={e=>setPromo(c=>({...c,value:e.target.value}))}/></label>
  <label>Cantidad mínima<input type="number" min="1" step="1" value={promo.minQuantity} onChange={e=>setPromo(c=>({...c,minQuantity:e.target.value}))}/></label>
  {type==='HAPPY_HOUR'&&<><label>Desde<input type="time" value={promo.startTime} onChange={e=>setPromo(c=>({...c,startTime:e.target.value}))}/></label><label>Hasta<input type="time" value={promo.endTime} onChange={e=>setPromo(c=>({...c,endTime:e.target.value}))}/></label></>}
  <div className="bar-admin-action"><button type="button" className="primary" disabled={working} onClick={()=>savePromotion(type)}>Guardar {type==='HAPPY_HOUR'?'Happy Hour':'promoción'}</button></div>
 </div>

 if(loading)return <div className="bar-control-loading"><b>IDEALO BAR</b><span>Cargando 10 bloques…</span></div>
 return <section className="bar-control-center">
  <header className="bar-control-head"><div><span>IDEALO SV · Administración especializada</span><h2>Centro de Control · IDEALO BAR</h2><p>{company?.name} · promociones, pérdidas, caja, DTE y rentabilidad</p></div><button type="button" onClick={load} disabled={working}>↻ Actualizar</button></header>
  {error&&<div className="bar-control-alert error">{error}<button onClick={()=>setError('')}>×</button></div>}
  {success&&<div className="bar-control-alert success">✓ {success}<button onClick={()=>setSuccess('')}>×</button></div>}
  <nav className="bar-block-tabs">{blocks.map(([name,icon],index)=><button type="button" key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}><b>{index+1}</b><span>{icon} {name}</span></button>)}</nav>

  {tab==='Promociones'&&<div className="bar-admin-panel"><h3>🏷️ Promociones automáticas</h3><p>El precio se aplica en la base de datos al agregar el producto al pedido.</p>{promotionForm('DISCOUNT')}<div className="bar-admin-list">{promotions.filter(row=>row.promotion_type!=='HAPPY_HOUR').map(row=><article key={row.id}><div><b>{row.name}</b><span>{productById.get(row.product_id)?.name||'Producto'}</span></div><strong>{row.pricing_mode==='PERCENT_OFF'?`${row.price_value}% menos`:row.pricing_mode==='FIXED_PRICE'?money.format(n(row.price_value)):`-${money.format(n(row.price_value))}`}</strong></article>)}</div></div>}

  {tab==='Baldes / Hielerazos'&&<div className="bar-admin-panel"><h3>🪣 Baldes y Hielerazos</h3><p>Crea el producto, lo activa en Barra y arma su receta de inventario en una sola operación.</p><div className="bar-admin-grid two">
   <label>Tipo<select value={bundle.type} onChange={e=>setBundle(c=>({...c,type:e.target.value}))}><option value="BALDE">Balde</option><option value="HIELERAZO">Hielerazo</option></select></label>
   <label>Nombre<input value={bundle.name} onChange={e=>setBundle(c=>({...c,name:e.target.value}))} placeholder="Balde Pilsener 6"/></label>
   <label>Cerveza / insumo principal{inventorySelect({value:bundle.inventoryId,onChange:inventoryId=>setBundle(c=>({...c,inventoryId}))})}</label>
   <label>Unidades por venta<input type="number" min="1" step="1" value={bundle.units} onChange={e=>setBundle(c=>({...c,units:e.target.value}))}/></label>
   <label>Precio de venta<input type="number" min="0" step="0.01" value={bundle.price} onChange={e=>setBundle(c=>({...c,price:e.target.value}))}/></label>
   <label>Hielo opcional{inventorySelect({value:bundle.iceId,onChange:iceId=>setBundle(c=>({...c,iceId}))})}</label>
   <label>Cantidad de hielo<input type="number" min="0" step="0.001" value={bundle.iceQuantity} onChange={e=>setBundle(c=>({...c,iceQuantity:e.target.value}))}/></label>
   <div className="bar-admin-action"><button type="button" className="primary" disabled={working} onClick={createBundle}>Crear oferta</button></div>
  </div><div className="bar-admin-list">{bundles.map(row=><article key={row.id}><div><b>{row.offer_type==='BALDE'?'Balde':'Hielerazo'}</b><span>{productById.get(row.product_id)?.name||'Producto'}</span></div><strong>{n(row.units_per_offer)} uds.</strong></article>)}</div></div>}

  {tab==='Happy Hour'&&<div className="bar-admin-panel"><h3>⏰ Happy Hour</h3><p>Activa y desactiva precios automáticamente según la hora de El Salvador.</p>{promotionForm('HAPPY_HOUR')}<div className="bar-admin-list">{promotions.filter(row=>row.promotion_type==='HAPPY_HOUR').map(row=><article key={row.id}><div><b>{row.name}</b><span>{productById.get(row.product_id)?.name} · {row.start_time?.slice(0,5)}–{row.end_time?.slice(0,5)}</span></div><strong>{row.pricing_mode==='PERCENT_OFF'?`${row.price_value}%`:`${money.format(n(row.price_value))}`}</strong></article>)}</div></div>}

  {tab==='Cortesías'&&<div className="bar-admin-panel"><h3>🎁 Cortesías controladas</h3><p>Solo administración autoriza la salida; el costo y los ingredientes quedan trazados.</p><div className="bar-admin-grid two"><label>Producto{productSelect({value:productEvent.productId,onChange:productId=>setProductEvent(c=>({...c,productId}))})}</label><label>Cantidad<input type="number" min="0.001" step="1" value={productEvent.quantity} onChange={e=>setProductEvent(c=>({...c,quantity:e.target.value}))}/></label><label className="wide">Motivo<input value={productEvent.reason} onChange={e=>setProductEvent(c=>({...c,reason:e.target.value}))} placeholder="Cliente frecuente / autorización gerente"/></label><div className="bar-admin-action"><button type="button" className="primary" disabled={working} onClick={()=>recordProductEvent('COURTESY')}>Registrar cortesía</button></div></div></div>}

  {tab==='Mermas'&&<div className="bar-admin-panel"><h3>⚠️ Mermas y dañados</h3><p>Registra cerveza quebrada, comida perdida, vencimientos o producto dañado como salida real.</p><div className="bar-admin-grid two"><label>Insumo{inventorySelect({value:stockEvent.inventoryId,onChange:inventoryId=>setStockEvent(c=>({...c,inventoryId}))})}</label><label>Tipo<select value={stockEvent.type} onChange={e=>setStockEvent(c=>({...c,type:e.target.value}))}><option value="WASTE">Merma / pérdida</option><option value="DAMAGE">Dañado</option></select></label><label>Cantidad<input type="number" min="0.001" step="0.001" value={stockEvent.quantity} onChange={e=>setStockEvent(c=>({...c,quantity:e.target.value}))}/></label><label>Motivo<input value={stockEvent.reason} onChange={e=>setStockEvent(c=>({...c,reason:e.target.value}))} placeholder="Botella quebrada"/></label><div className="bar-admin-action"><button type="button" className="primary" disabled={working} onClick={recordStockEvent}>Registrar salida</button></div></div></div>}

  {tab==='Consumo interno'&&<div className="bar-admin-panel"><h3>👥 Consumo interno</h3><p>Consumo de personal o administración separado de ventas y cortesías.</p><div className="bar-admin-grid two"><label>Producto{productSelect({value:productEvent.productId,onChange:productId=>setProductEvent(c=>({...c,productId}))})}</label><label>Cantidad<input type="number" min="0.001" step="1" value={productEvent.quantity} onChange={e=>setProductEvent(c=>({...c,quantity:e.target.value}))}/></label><label className="wide">Motivo<input value={productEvent.reason} onChange={e=>setProductEvent(c=>({...c,reason:e.target.value}))} placeholder="Cena de personal"/></label><div className="bar-admin-action"><button type="button" className="primary" disabled={working} onClick={()=>recordProductEvent('INTERNAL')}>Registrar consumo</button></div></div></div>}

  {tab==='Caja'&&<div className="bar-admin-panel"><h3>💵 Caja integrada</h3><p>Los cobros se contabilizan en Caja/Banco. Aquí aparecen únicamente los que necesitan elegir cuenta.</p><label className="bar-single-select">Cuenta para conciliar<select value={cashAccountId} onChange={e=>setCashAccountId(e.target.value)}><option value="">Seleccionar cuenta…</option>{cashAccounts.map(row=><option key={row.id} value={row.id}>{row.name} · {row.account_type}</option>)}</select></label><div className="bar-admin-list">{pendingPayments.length?pendingPayments.map(row=><article key={row.id}><div><b>{orderById.get(row.order_id)?.order_code||'Pedido'}</b><span>{row.method} · {row.financial_note||'Pendiente'}</span></div><strong>{money.format(n(row.amount))}</strong><button type="button" disabled={working} onClick={()=>postPending(row)}>Conciliar</button></article>):<div className="bar-empty-admin">✓ No hay cobros pendientes de contabilizar.</div>}</div></div>}

  {tab==='DTE'&&<div className="bar-admin-panel"><h3>🧾 Facturación electrónica</h3><p>El pedido ya cobrado se entrega al flujo DTE de IDEALO SV sin volver a registrar el ingreso.</p><div className="bar-admin-grid two"><label>Pedido pagado<select value={dteForm.orderId} onChange={e=>setDteForm(c=>({...c,orderId:e.target.value}))}><option value="">Seleccionar pedido…</option>{paidOrders.map(row=><option key={row.id} value={row.id}>{row.order_code} · {money.format(n(row.total))}</option>)}</select></label><label>Tipo<select value={dteForm.type} onChange={e=>setDteForm(c=>({...c,type:e.target.value}))}><option value="01">Factura (01)</option><option value="03">Crédito Fiscal (03)</option></select></label><label>Cliente<select value={dteForm.clientId} onChange={e=>setDteForm(c=>({...c,clientId:e.target.value}))}><option value="">Consumidor / sin cliente</option>{clients.map(row=><option key={row.id} value={row.id}>{row.trade_name||row.name}</option>)}</select></label><label>Ambiente<select value={dteForm.environment} onChange={e=>setDteForm(c=>({...c,environment:e.target.value}))}><option value="test">TEST</option><option value="production">PRODUCCIÓN</option></select></label><div className="bar-admin-action"><button type="button" className="primary" disabled={working} onClick={requestDte}>Solicitar DTE</button></div></div>
   <h4>Vincular con borrador DTE existente</h4><div className="bar-admin-grid two"><label>Solicitud<select value={linkForm.requestId} onChange={e=>setLinkForm(c=>({...c,requestId:e.target.value}))}><option value="">Seleccionar solicitud…</option>{dteRequests.filter(row=>row.status==='PENDING').map(row=><option key={row.id} value={row.id}>{orderById.get(row.order_id)?.order_code||row.order_id} · {row.dte_type} · {row.environment}</option>)}</select></label><label>DTE<select value={linkForm.dteId} onChange={e=>setLinkForm(c=>({...c,dteId:e.target.value}))}><option value="">Seleccionar DTE…</option>{dteDocs.filter(row=>!row.bar_order_id).map(row=><option key={row.id} value={row.id}>{row.control_number} · {row.dte_type} · {row.environment}</option>)}</select></label><div className="bar-admin-action"><button type="button" disabled={working} onClick={linkDte}>Vincular DTE</button></div></div>
   <div className="bar-admin-list">{dteRequests.map(row=><article key={row.id}><div><b>{orderById.get(row.order_id)?.order_code||'Pedido'}</b><span>{row.dte_type==='03'?'CCF':'Factura'} · {row.environment}</span></div><strong>{row.status}</strong></article>)}</div></div>}

  {tab==='Tablero'&&<div className="bar-admin-panel"><div className="bar-dashboard-title"><div><h3>📊 Tablero del dueño</h3><p>Ventas, ticket, medios de pago y costos no facturados.</p></div><div><input type="date" value={range.from} onChange={e=>setRange(c=>({...c,from:e.target.value}))}/><input type="date" value={range.to} onChange={e=>setRange(c=>({...c,to:e.target.value}))}/></div></div>{dashboard?<><div className="bar-kpi-grid"><div><span>Ventas</span><b>{money.format(n(dashboard.sales))}</b></div><div><span>Pedidos</span><b>{n(dashboard.orders)}</b></div><div><span>Ticket promedio</span><b>{money.format(n(dashboard.average_ticket))}</b></div><div><span>Efectivo</span><b>{money.format(n(dashboard.cash))}</b></div><div><span>Tarjeta</span><b>{money.format(n(dashboard.card))}</b></div><div><span>Transferencia</span><b>{money.format(n(dashboard.transfer))}</b></div><div><span>Descuentos promo</span><b>{money.format(n(dashboard.promotion_discount))}</b></div><div><span>Cortesías</span><b>{money.format(n(dashboard.courtesy_cost))}</b></div><div><span>Mermas</span><b>{money.format(n(dashboard.waste_cost))}</b></div><div><span>Consumo interno</span><b>{money.format(n(dashboard.internal_cost))}</b></div></div><div className="bar-top-product"><span>Más vendido</span><b>{dashboard.top_product?.name||'Sin ventas'}</b><strong>{n(dashboard.top_product?.quantity)} unidades · {money.format(n(dashboard.top_product?.sales))}</strong></div></>:<div className="bar-empty-admin">Tu rol no tiene acceso a indicadores financieros o todavía no hay información.</div>}</div>}

  {tab==='Reposición'&&<div className="bar-admin-panel"><h3>📦 Alertas y reposición</h3><p>Solo muestra insumos utilizados por recetas activas de IDEALO BAR.</p><div className="bar-alert-table">{alerts.length?alerts.map(row=><article key={row.inventory_item_id} className={row.severity==='CRITICAL'?'critical':''}><div><b>{row.name}</b><span>{row.sku||'Sin SKU'} · disponible {n(row.available_stock)} {row.unit}</span></div><div><small>{row.severity==='CRITICAL'?'SIN STOCK':'STOCK BAJO'}</small><strong>Sugerido {n(row.suggested_qty)}</strong></div><button type="button" disabled={working||n(row.suggested_qty)<=0} onClick={()=>prepareRestock(row)}>Preparar compra</button></article>):<div className="bar-empty-admin">✓ No hay alertas de insumos del bar.</div>}</div></div>}
  {working&&<div className="bar-control-working"><span/> Procesando…</div>}
 </section>
}
