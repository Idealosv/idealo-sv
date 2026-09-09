import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-business-center.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const qty=n=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(n||0))
const localDateTime=value=>value?new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):''
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(new Date())

export default function IdealoBarBusinessCenter({company,supabase,access}){
 const companyId=company?.id
 const permissions=access?.permissions||[]
 const can=useCallback(p=>permissions.includes('*')||permissions.includes(p),[permissions])
 const tabs=useMemo(()=>[
  ['Cuenta y propinas',can('payment.take')||can('bill.request')||can('tip.manage')],
  ['Existencias',can('inventory.manage')],
  ['Compras',can('inventory.manage')],
  ['Delivery',can('delivery.view')||can('delivery.manage')],
  ['Tickets',can('kitchen.view')||can('bar.view')||can('admin.view')],
  ['DTE',can('payment.take')||can('admin.view')],
  ['Rentabilidad',can('admin.view')],
 ].filter(([,ok])=>ok).map(([name])=>name),[can])
 const [tab,setTab]=useState(tabs[0]||'')
 const [orders,setOrders]=useState([]),[items,setItems]=useState([]),[payments,setPayments]=useState([]),[splits,setSplits]=useState([]),[splitItems,setSplitItems]=useState([])
 const [tips,setTips]=useState([]),[staff,setStaff]=useState([])
 const [inventory,setInventory]=useState([]),[stocks,setStocks]=useState([]),[warehouses,setWarehouses]=useState([]),[locations,setLocations]=useState([]),[presentations,setPresentations]=useState([]),[suppliers,setSuppliers]=useState([]),[transfers,setTransfers]=useState([])
 const [deliveryEvents,setDeliveryEvents]=useState([]),[printJobs,setPrintJobs]=useState([]),[settings,setSettings]=useState(null),[dteRequests,setDteRequests]=useState([]),[dteDocs,setDteDocs]=useState([])
 const [profit,setProfit]=useState({}),[productProfit,setProductProfit]=useState([])
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [selectedOrderId,setSelectedOrderId]=useState(''),[parts,setParts]=useState('2'),[splitMethod,setSplitMethod]=useState('cash')
 const [itemSplit,setItemSplit]=useState({itemId:'',quantity:'1',label:'Cuenta parcial'})
 const [stockForm,setStockForm]=useState({itemId:'',warehouseId:'',locationId:'',kind:'WAREHOUSE',quantity:'0'}),[transferForm,setTransferForm]=useState({from:'',to:'',quantity:'1',reason:''})
 const [presentationForm,setPresentationForm]=useState({itemId:'',name:'Caja x 24',units:'24',cost:'0',supplierId:'',count:'1'}),[supplierForm,setSupplierForm]=useState({name:'',phone:'',contact:''})
 const [dateRange,setDateRange]=useState({from:today(),to:today()})
 const [printerForm,setPrinterForm]=useState({kitchen:'',bar:''})

 useEffect(()=>{if(tabs.length&&!tabs.includes(tab))setTab(tabs[0])},[tabs,tab])
 const run=useCallback(async(fn,msg)=>{setWorking(true);setError('');setNotice('');try{await fn();if(msg)setNotice(msg)}catch(e){setError(String(e?.message||e||'No se pudo completar la operación.'))}finally{setWorking(false)}},[])

 const load=useCallback(async()=>{
  if(!companyId||!supabase||!access?.active)return
  setLoading(true);setError('')
  try{
   const queries=[
    supabase.from('bar_orders').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(300),
    supabase.from('bar_order_items').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1500),
    supabase.from('bar_payments').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1000),
    supabase.from('bar_bill_splits').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(500),
    supabase.from('bar_bill_split_items').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(1500),
    supabase.from('bar_tip_allocations').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(500),
    supabase.from('bar_staff_assignments').select('user_id,display_name,bar_role,active').eq('company_id',companyId).eq('active',true),
   ]
   const [o,i,p,s,si,t,st]=await Promise.all(queries)
   const coreErr=[o,i,p,s,si,t,st].find(x=>x.error)?.error;if(coreErr)throw coreErr
   setOrders(o.data||[]);setItems(i.data||[]);setPayments(p.data||[]);setSplits(s.data||[]);setSplitItems(si.data||[]);setTips(t.data||[]);setStaff(st.data||[])

   if(can('inventory.manage')){
    const [inv,stock,wh,loc,pres,sup,tr]=await Promise.all([
     supabase.from('inventory_items').select('id,name,unit,current_stock,average_cost,last_cost,minimum_stock,supplier_id,active,subcategory,notes').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('name').limit(1200),
     supabase.from('bar_inventory_location_stock').select('*').eq('company_id',companyId).order('updated_at',{ascending:false}),
     supabase.from('inventory_warehouses').select('id,name,active').eq('company_id',companyId).eq('active',true).order('name'),
     supabase.from('inventory_locations').select('id,name,warehouse_id,active').eq('company_id',companyId).eq('active',true).order('name'),
     supabase.from('bar_inventory_presentations').select('*').eq('company_id',companyId).eq('active',true).order('created_at',{ascending:false}),
     supabase.from('suppliers').select('id,name,trade_name,contact_name,phone,active').eq('company_id',companyId).eq('active',true).order('name'),
     supabase.from('bar_stock_transfers').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(100),
    ])
    const e=[inv,stock,wh,loc,pres,sup,tr].find(x=>x.error)?.error;if(e)throw e
    const barIds=new Set([...(stock.data||[]).map(x=>x.inventory_item_id),...(pres.data||[]).map(x=>x.inventory_item_id)])
    const invRows=(inv.data||[]).filter(x=>barIds.has(x.id)||String(x.subcategory||'').toUpperCase()==='BAR'||String(x.notes||'').toUpperCase().includes('IDEALO BAR'))
    setInventory(invRows);setStocks(stock.data||[]);setWarehouses(wh.data||[]);setLocations(loc.data||[]);setPresentations(pres.data||[]);setSuppliers(sup.data||[]);setTransfers(tr.data||[])
    setStockForm(v=>({...v,itemId:v.itemId||invRows[0]?.id||'',warehouseId:v.warehouseId||wh.data?.[0]?.id||''}))
    setPresentationForm(v=>({...v,itemId:v.itemId||invRows[0]?.id||'',supplierId:v.supplierId||sup.data?.[0]?.id||''}))
   }

   if(can('delivery.view')||can('delivery.manage')){const d=await supabase.from('bar_delivery_events').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(300);if(d.error)throw d.error;setDeliveryEvents(d.data||[])}
   if(can('kitchen.view')||can('bar.view')||can('admin.view')){const j=await supabase.from('bar_print_jobs').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(300);if(j.error)throw j.error;setPrintJobs(j.data||[])}
   if(can('payment.take')||can('admin.view')){
    const [setRes,req,docs]=await Promise.all([
     supabase.from('bar_settings').select('*').eq('company_id',companyId).maybeSingle(),
     supabase.from('bar_dte_requests').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(200),
     supabase.from('dte_documents').select('id,bar_order_id,dte_type,control_number,environment,status,created_at').eq('company_id',companyId).not('bar_order_id','is',null).order('created_at',{ascending:false}).limit(200),
    ])
    const e=[setRes,req,docs].find(x=>x.error)?.error;if(e)throw e
    setSettings(setRes.data||null);setDteRequests(req.data||[]);setDteDocs(docs.data||[]);setPrinterForm({kitchen:setRes.data?.kitchen_printer_name||'',bar:setRes.data?.bar_printer_name||''})
   }
   if(can('admin.view')){
    const [pr,pp]=await Promise.all([
     supabase.rpc('bar_advanced_profitability',{p_company_id:companyId,p_from:dateRange.from,p_to:dateRange.to}),
     supabase.rpc('bar_product_profitability',{p_company_id:companyId,p_from:dateRange.from,p_to:dateRange.to}),
    ])
    if(pr.error)throw pr.error;if(pp.error)throw pp.error;setProfit(pr.data||{});setProductProfit(Array.isArray(pp.data)?pp.data:[])
   }
  }catch(e){setError(String(e?.message||e||'No se pudo cargar Gestión del bar.'))}finally{setLoading(false)}
 },[companyId,supabase,access,can,dateRange.from,dateRange.to])
 useEffect(()=>{load()},[load])

 const activeOrders=orders.filter(o=>!['paid','cancelled'].includes(o.status))
 const paidOrders=orders.filter(o=>o.status==='paid')
 const selectedOrder=orders.find(o=>o.id===selectedOrderId)||activeOrders[0]||null
 useEffect(()=>{if(!selectedOrderId&&activeOrders[0])setSelectedOrderId(activeOrders[0].id)},[activeOrders.length])
 const selectedItems=items.filter(i=>i.order_id===selectedOrder?.id&&i.status!=='cancelled')
 const selectedSplits=splits.filter(s=>s.order_id===selectedOrder?.id)
 const staffMap=useMemo(()=>new Map(staff.map(s=>[s.user_id,s.display_name])),[staff])
 const invMap=useMemo(()=>new Map(inventory.map(i=>[i.id,i])),[inventory])
 const stockMap=useMemo(()=>new Map(stocks.map(s=>[s.id,s])),[stocks])
 const warehouseMap=useMemo(()=>new Map(warehouses.map(w=>[w.id,w.name])),[warehouses])
 const locationMap=useMemo(()=>new Map(locations.map(l=>[l.id,l.name])),[locations])

 const equalSplit=()=>run(async()=>{if(!selectedOrder)throw new Error('Selecciona un pedido.');const {error:e}=await supabase.rpc('bar_create_equal_splits',{p_order_id:selectedOrder.id,p_parts:Number(parts)});if(e)throw e;await load()},'Cuenta dividida por personas.')
 const createItemSplit=()=>run(async()=>{if(!selectedOrder||!itemSplit.itemId)throw new Error('Selecciona un producto.');const allocations=[{order_item_id:itemSplit.itemId,quantity:Number(itemSplit.quantity)}];const {error:e}=await supabase.rpc('bar_create_item_split',{p_order_id:selectedOrder.id,p_label:itemSplit.label,p_allocations:allocations});if(e)throw e;await load()},'Cuenta parcial creada por producto.')
 const paySplit=split=>run(async()=>{const {error:e}=await supabase.rpc('bar_take_split_payment',{p_split_id:split.id,p_method:splitMethod,p_reference:null});if(e)throw e;await load()},'División cobrada.')
 const initStock=()=>run(async()=>{const f=stockForm;const {error:e}=await supabase.rpc('bar_initialize_location_stock',{p_inventory_item_id:f.itemId,p_warehouse_id:f.warehouseId||null,p_location_id:f.locationId||null,p_location_kind:f.kind,p_quantity:Number(f.quantity)});if(e)throw e;await load()},'Existencia distribuida por ubicación.')
 const transferStock=()=>run(async()=>{const f=transferForm;const {error:e}=await supabase.rpc('bar_transfer_location_stock',{p_from_stock_id:f.from,p_to_stock_id:f.to,p_quantity:Number(f.quantity),p_reason:f.reason||null});if(e)throw e;await load()},'Traslado interno registrado. El stock total no cambió.')
 const createSupplier=()=>run(async()=>{if(!supplierForm.name.trim())throw new Error('Escribe el proveedor.');const {data,error:e}=await supabase.from('suppliers').insert({company_id:companyId,name:supplierForm.name.trim(),contact_name:supplierForm.contact||null,phone:supplierForm.phone||null,supplier_type:'MATERIAL',active:true,notes:'Proveedor creado desde IDEALO BAR'}).select('id').single();if(e)throw e;setSupplierForm({name:'',phone:'',contact:''});setPresentationForm(v=>({...v,supplierId:data.id}));await load()},'Proveedor creado.')
 const createPresentation=()=>run(async()=>{const f=presentationForm;if(!f.itemId||!f.name.trim()||Number(f.units)<=0)throw new Error('Completa presentación y unidades.');const {error:e}=await supabase.from('bar_inventory_presentations').insert({company_id:companyId,inventory_item_id:f.itemId,name:f.name.trim(),units_per_presentation:Number(f.units),purchase_cost:Number(f.cost||0),preferred_supplier_id:f.supplierId||null,is_purchase_default:true,active:true});if(e)throw e;await load()},'Presentación creada.')
 const preparePurchase=pres=>run(async()=>{const count=Number(prompt(`¿Cuántas presentaciones de ${pres.name}?`,'1')||0);if(count<=0)return;const {data,error:e}=await supabase.rpc('bar_prepare_purchase_by_presentation',{p_presentation_id:pres.id,p_presentations:count});if(e)throw e;await load();setNotice(`Compra preparada en IDEALO SV · ${data}`)},'')
 const updateDelivery=(order,status)=>run(async()=>{const {error:e}=await supabase.rpc('bar_update_fulfillment_status',{p_order_id:order.id,p_status:status});if(e)throw e;await load()},'Estado de delivery actualizado.')
 const markPrinted=job=>run(async()=>{const {error:e}=await supabase.from('bar_print_jobs').update({status:'PRINTED',printed_at:new Date().toISOString(),attempts:Number(job.attempts||0)+1}).eq('id',job.id);if(e)throw e;await load()},'Ticket marcado como impreso.')
 const saveSettings=()=>run(async()=>{const payload={company_id:companyId,business_name:settings?.business_name||company?.name||'IDEALO BAR',auto_dte_on_paid:settings?.auto_dte_on_paid!==false,default_dte_type:settings?.default_dte_type||'01',default_dte_environment:settings?.default_dte_environment||'test',kitchen_printer_name:printerForm.kitchen||null,bar_printer_name:printerForm.bar||null,default_stock_location:settings?.default_stock_location||'BAR'};const {error:e}=await supabase.from('bar_settings').upsert(payload,{onConflict:'company_id'});if(e)throw e;await load()},'Configuración guardada.')
 const generateDte=order=>run(async()=>{const {data,error:e}=await supabase.rpc('bar_generate_dte_draft',{p_order_id:order.id,p_client_id:null,p_dte_type:settings?.default_dte_type||'01',p_environment:settings?.default_dte_environment||'test'});if(e)throw e;await load();setNotice(`Borrador DTE generado · ${data}`)},'')

 if(loading)return <div className="bar-business-loading">Cargando Gestión del bar…</div>
 return <div className="bar-business-shell">
  <header className="bar-business-head"><div><span>IDEALO BAR</span><h2>Gestión del bar</h2><p>Cuenta, propinas, logística, compras, delivery, comandas, DTE y rentabilidad en un solo flujo.</p></div><div><b>{access?.display_name||''}</b><small>{access?.role||''}</small></div></header>
  {error&&<div className="bar-business-error">{error}</div>}{notice&&<div className="bar-business-notice">{notice}</div>}
  <nav className="bar-business-tabs">{tabs.map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</nav>

  {tab==='Cuenta y propinas'&&<div className="bar-business-grid two">
   <section className="bar-business-card"><h3>Dividir cuenta</h3><select value={selectedOrder?.id||''} onChange={e=>setSelectedOrderId(e.target.value)}>{activeOrders.map(o=><option key={o.id} value={o.id}>{o.order_code} · {money.format(Number(o.total||0))}</option>)}</select><div className="bar-inline"><input type="number" min="2" max="50" value={parts} onChange={e=>setParts(e.target.value)}/><button disabled={working||!selectedOrder} onClick={equalSplit}>Dividir por personas</button></div><div className="bar-inline"><select value={itemSplit.itemId} onChange={e=>setItemSplit(v=>({...v,itemId:e.target.value}))}><option value="">Producto…</option>{selectedItems.map(i=><option key={i.id} value={i.id}>{i.item_name} · {qty(i.quantity)}</option>)}</select><input type="number" min="0.001" step="0.001" value={itemSplit.quantity} onChange={e=>setItemSplit(v=>({...v,quantity:e.target.value}))}/><button disabled={working} onClick={createItemSplit}>Crear parcial</button></div><label>Forma de cobro<select value={splitMethod} onChange={e=>setSplitMethod(e.target.value)}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></label><div className="bar-list">{selectedSplits.length?selectedSplits.map(s=><article key={s.id}><div><b>{s.label}</b><small>{s.split_type} · {s.status}</small></div><strong>{money.format(Number(s.amount||0))}</strong>{s.status==='OPEN'&&can('payment.take')&&<button disabled={working} onClick={()=>paySplit(s)}>Cobrar</button>}</article>):<p>Sin divisiones para este pedido.</p>}</div></section>
   <section className="bar-business-card"><h3>Propinas del personal</h3><p>La propina se asigna al mesero y se reconcilia conforme se cobran pagos parciales o completos.</p><div className="bar-kpis"><div><span>Total registrado</span><b>{money.format(tips.filter(t=>t.status==='EARNED').reduce((s,t)=>s+Number(t.amount||0),0))}</b></div><div><span>Asignaciones</span><b>{tips.length}</b></div></div><div className="bar-list">{tips.slice(0,25).map(t=><article key={t.id}><div><b>{staffMap.get(t.recipient_user_id)||'Personal'}</b><small>{t.method} · {localDateTime(t.created_at)}</small></div><strong>{money.format(Number(t.amount||0))}</strong></article>)}</div></section>
  </div>}

  {tab==='Existencias'&&<div className="bar-business-grid two"><section className="bar-business-card"><h3>Bodega → Refrigerador → Barra</h3><div className="bar-form-grid"><select value={stockForm.itemId} onChange={e=>setStockForm(v=>({...v,itemId:e.target.value}))}>{inventory.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select><select value={stockForm.kind} onChange={e=>setStockForm(v=>({...v,kind:e.target.value}))}><option value="WAREHOUSE">Bodega</option><option value="FRIDGE">Refrigerador</option><option value="BAR">Barra</option><option value="OTHER">Otra</option></select><select value={stockForm.warehouseId} onChange={e=>setStockForm(v=>({...v,warehouseId:e.target.value}))}><option value="">Sin bodega física</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><select value={stockForm.locationId} onChange={e=>setStockForm(v=>({...v,locationId:e.target.value}))}><option value="">Sin ubicación física</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select><input type="number" min="0" step="0.001" value={stockForm.quantity} onChange={e=>setStockForm(v=>({...v,quantity:e.target.value}))}/><button disabled={working} onClick={initStock}>Distribuir existencia</button></div><div className="bar-list">{stocks.map(s=><article key={s.id}><div><b>{invMap.get(s.inventory_item_id)?.name||'Insumo'}</b><small>{s.location_kind} · {locationMap.get(s.location_id)||warehouseMap.get(s.warehouse_id)||'Sin nombre'}</small></div><strong>{qty(s.quantity)}</strong></article>)}</div></section><section className="bar-business-card"><h3>Traslado interno</h3><p>Mover unidades entre ubicaciones no cambia el stock total de la empresa.</p><select value={transferForm.from} onChange={e=>setTransferForm(v=>({...v,from:e.target.value,to:''}))}><option value="">Origen…</option>{stocks.filter(s=>Number(s.quantity)>0).map(s=><option key={s.id} value={s.id}>{invMap.get(s.inventory_item_id)?.name} · {s.location_kind} · {qty(s.quantity)}</option>)}</select><select value={transferForm.to} onChange={e=>setTransferForm(v=>({...v,to:e.target.value}))}><option value="">Destino…</option>{stocks.filter(s=>s.id!==transferForm.from&&(!transferForm.from||s.inventory_item_id===stockMap.get(transferForm.from)?.inventory_item_id)).map(s=><option key={s.id} value={s.id}>{s.location_kind} · {locationMap.get(s.location_id)||warehouseMap.get(s.warehouse_id)||'ubicación'}</option>)}</select><input type="number" min="0.001" step="0.001" value={transferForm.quantity} onChange={e=>setTransferForm(v=>({...v,quantity:e.target.value}))}/><input placeholder="Motivo" value={transferForm.reason} onChange={e=>setTransferForm(v=>({...v,reason:e.target.value}))}/><button disabled={working||!transferForm.from||!transferForm.to} onClick={transferStock}>Trasladar</button><div className="bar-list compact">{transfers.slice(0,15).map(t=><article key={t.id}><div><b>{invMap.get(t.inventory_item_id)?.name||'Insumo'}</b><small>{t.reason||'Traslado interno'} · {localDateTime(t.created_at)}</small></div><strong>{qty(t.quantity)}</strong></article>)}</div></section></div>}

  {tab==='Compras'&&<div className="bar-business-grid two"><section className="bar-business-card"><h3>Cajas, paquetes y unidades</h3><div className="bar-form-grid"><select value={presentationForm.itemId} onChange={e=>setPresentationForm(v=>({...v,itemId:e.target.value}))}>{inventory.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select><input value={presentationForm.name} onChange={e=>setPresentationForm(v=>({...v,name:e.target.value}))}/><input type="number" min="0.001" step="0.001" value={presentationForm.units} onChange={e=>setPresentationForm(v=>({...v,units:e.target.value}))}/><input type="number" min="0" step="0.01" value={presentationForm.cost} onChange={e=>setPresentationForm(v=>({...v,cost:e.target.value}))}/><select value={presentationForm.supplierId} onChange={e=>setPresentationForm(v=>({...v,supplierId:e.target.value}))}><option value="">Sin proveedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button disabled={working} onClick={createPresentation}>Crear presentación</button></div><div className="bar-list">{presentations.map(p=><article key={p.id}><div><b>{invMap.get(p.inventory_item_id)?.name} · {p.name}</b><small>{qty(p.units_per_presentation)} unidades · costo {money.format(Number(p.purchase_cost||0))}</small></div><button disabled={working} onClick={()=>preparePurchase(p)}>Preparar compra</button></article>)}</div></section><section className="bar-business-card"><h3>Proveedor rápido</h3><input placeholder="Proveedor" value={supplierForm.name} onChange={e=>setSupplierForm(v=>({...v,name:e.target.value}))}/><input placeholder="Contacto" value={supplierForm.contact} onChange={e=>setSupplierForm(v=>({...v,contact:e.target.value}))}/><input placeholder="Teléfono" value={supplierForm.phone} onChange={e=>setSupplierForm(v=>({...v,phone:e.target.value}))}/><button disabled={working} onClick={createSupplier}>Crear proveedor</button><div className="bar-list compact">{suppliers.map(s=><article key={s.id}><div><b>{s.name}</b><small>{s.contact_name||''} {s.phone||''}</small></div></article>)}</div></section></div>}

  {tab==='Delivery'&&<div className="bar-business-card"><h3>Seguimiento de delivery</h3><div className="bar-list">{orders.filter(o=>o.order_type==='delivery'&&o.status!=='cancelled').slice(0,40).map(o=><article key={o.id}><div><b>{o.order_code} · {o.customer_name||'Cliente'}</b><small>{o.delivery_address||'Sin dirección'} · {o.driver_name||'Sin motorista'} · {o.fulfillment_status}</small></div><div className="bar-actions">{can('delivery.manage')&&['preparing','ready','on_the_way','delivered'].map(s=><button key={s} disabled={working||o.fulfillment_status===s} onClick={()=>updateDelivery(o,s)}>{s==='preparing'?'Preparando':s==='ready'?'Listo':s==='on_the_way'?'En camino':'Entregado'}</button>)}</div></article>)}</div><h4>Historial</h4><div className="bar-list compact">{deliveryEvents.slice(0,30).map(e=><article key={e.id}><div><b>{e.status}</b><small>{e.driver_name||''} · {localDateTime(e.created_at)}</small></div></article>)}</div></div>}

  {tab==='Tickets'&&<div className="bar-business-grid two"><section className="bar-business-card"><h3>Impresoras por estación</h3>{can('admin.view')?<><label>Cocina<input value={printerForm.kitchen} onChange={e=>setPrinterForm(v=>({...v,kitchen:e.target.value}))} placeholder="Ej. Cocina-80mm"/></label><label>Barra<input value={printerForm.bar} onChange={e=>setPrinterForm(v=>({...v,bar:e.target.value}))} placeholder="Ej. Barra-80mm"/></label><button disabled={working} onClick={saveSettings}>Guardar impresoras</button></>:<p>La impresora la configura Gerencia.</p>}<p>Cada producto enviado genera una cola de impresión separada para Cocina o Barra.</p></section><section className="bar-business-card"><h3>Cola de comandas</h3><div className="bar-list">{printJobs.slice(0,40).map(j=><article key={j.id}><div><b>{j.station==='kitchen'?'Cocina':'Barra'} · {j.payload?.item_name||'Comanda'}</b><small>{j.printer_name||'Sin impresora'} · {j.status} · {localDateTime(j.created_at)}</small></div>{j.status!=='PRINTED'&&can('admin.view')&&<button disabled={working} onClick={()=>markPrinted(j)}>Marcar impreso</button>}</article>)}</div></section></div>}

  {tab==='DTE'&&<div className="bar-business-grid two"><section className="bar-business-card"><h3>DTE automático desde la venta</h3><label className="bar-switch"><input type="checkbox" checked={settings?.auto_dte_on_paid!==false} onChange={e=>setSettings(v=>({...v,auto_dte_on_paid:e.target.checked}))}/><span>Generar borrador DTE al pagar</span></label><label>Tipo<select value={settings?.default_dte_type||'01'} onChange={e=>setSettings(v=>({...v,default_dte_type:e.target.value}))}><option value="01">Factura 01</option><option value="03">CCF 03</option></select></label><label>Ambiente<select value={settings?.default_dte_environment||'test'} onChange={e=>setSettings(v=>({...v,default_dte_environment:e.target.value}))}><option value="test">Pruebas</option><option value="production">Producción</option></select></label>{can('admin.view')&&<button disabled={working} onClick={saveSettings}>Guardar configuración fiscal</button>}<p>Al cerrar una venta, el sistema prepara el JSON fiscal y enlaza el documento a la venta sin duplicar el ingreso de Caja. La firma/transmisión continúa por la infraestructura DTE central.</p></section><section className="bar-business-card"><h3>Ventas pagadas y documentos</h3><div className="bar-list">{paidOrders.slice(0,30).map(o=>{const doc=dteDocs.find(d=>d.bar_order_id===o.id);return <article key={o.id}><div><b>{o.order_code} · {money.format(Number(o.total||0))}</b><small>{doc?`${doc.dte_type} · ${doc.status} · ${doc.control_number||''}`:'Sin DTE'}</small></div>{!doc&&<button disabled={working} onClick={()=>generateDte(o)}>Generar borrador</button>}</article>})}</div></section></div>}

  {tab==='Rentabilidad'&&<div><div className="bar-range"><input type="date" value={dateRange.from} onChange={e=>setDateRange(v=>({...v,from:e.target.value}))}/><input type="date" value={dateRange.to} onChange={e=>setDateRange(v=>({...v,to:e.target.value}))}/><button onClick={load}>Actualizar</button></div><div className="bar-kpis four"><div><span>Ventas</span><b>{money.format(Number(profit.summary?.sales||0))}</b></div><div><span>Ticket promedio</span><b>{money.format(Number(profit.summary?.avg_ticket||0))}</b></div><div><span>Propinas</span><b>{money.format(Number(profit.summary?.tips||0))}</b></div><div><span>Pérdidas</span><b>{money.format(Number(profit.losses||0))}</b></div></div><div className="bar-business-grid two"><section className="bar-business-card"><h3>Ventas por hora</h3><div className="bar-list">{(profit.by_hour||[]).map(h=><article key={h.hour}><div><b>{String(h.hour).padStart(2,'0')}:00</b><small>{h.orders} pedidos</small></div><strong>{money.format(Number(h.sales||0))}</strong></article>)}</div></section><section className="bar-business-card"><h3>Rentabilidad por producto</h3><div className="bar-list">{productProfit.slice(0,30).map((r,idx)=><article key={r.product_id||idx}><div><b>{r.product_name||r.name||'Producto'}</b><small>Ventas {money.format(Number(r.sales||r.revenue||0))} · costo {money.format(Number(r.cost||r.cost_total||0))}</small></div><strong>{money.format(Number(r.profit||r.margin_amount||0))}</strong></article>)}</div></section></div></div>}
 </div>
}
