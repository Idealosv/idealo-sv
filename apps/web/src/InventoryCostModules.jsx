import { useEffect, useMemo, useState } from 'react'

const money=(v)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const qty=(v)=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)
const orderLabel=(o)=>`OT-${String(o.number).padStart(5,'0')} · ${o.clients?.name||'Cliente'} · ${o.title}`

export function InventoryModule({company,supabase}){
  const [items,setItems]=useState([]),[movements,setMovements]=useState([]),[purchases,setPurchases]=useState([]),[message,setMessage]=useState('')
  const [form,setForm]=useState({sku:'',name:'',category:'MATERIAL',unit:'UNIT',minimum_stock:'0',location:'',notes:''})
  const [move,setMove]=useState({inventory_item_id:'',movement_type:'PURCHASE_IN',quantity:'',unit_cost:'',purchase_id:'',reference:'',notes:''})
  const load=async()=>{
    const [i,m,p]=await Promise.all([
      supabase.from('inventory_items').select('*').eq('company_id',company.id).order('name'),
      supabase.from('inventory_movements').select('*,inventory_items(name,unit),purchases(number,concept)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(80),
      supabase.from('purchases').select('id,number,concept,purchase_date,total').eq('company_id',company.id).order('purchase_date',{ascending:false}).limit(100),
    ])
    if(i.error||m.error||p.error)setMessage(i.error?.message||m.error?.message||p.error?.message)
    else{setItems(i.data||[]);setMovements(m.data||[]);setPurchases(p.data||[])}
  }
  useEffect(()=>{load()},[company.id])
  const saveItem=async(e)=>{
    e.preventDefault();setMessage('')
    const payload={...form,company_id:company.id,sku:form.sku.trim()||null,name:form.name.trim(),minimum_stock:Number(form.minimum_stock||0),location:form.location.trim()||null,notes:form.notes.trim()||null}
    const {error}=await supabase.from('inventory_items').insert(payload)
    if(error)setMessage(error.message);else{setMessage('Material agregado al almacén.');setForm({sku:'',name:'',category:'MATERIAL',unit:'UNIT',minimum_stock:'0',location:'',notes:''});await load()}
  }
  const selectMoveItem=(id)=>{const item=items.find(x=>x.id===id);setMove(current=>({...current,inventory_item_id:id,unit_cost:item?.average_cost||''}))}
  const saveMovement=async(e)=>{
    e.preventDefault();setMessage('')
    const item=items.find(x=>x.id===move.inventory_item_id);if(!item)return setMessage('Seleccioná un material.')
    const amount=Number(move.quantity||0);if(amount<=0)return setMessage('La cantidad debe ser mayor a cero.')
    const {error}=await supabase.from('inventory_movements').insert({company_id:company.id,inventory_item_id:item.id,movement_type:move.movement_type,quantity:amount,unit_cost:Number(move.unit_cost||0),purchase_id:move.purchase_id||null,reference:move.reference.trim()||null,notes:move.notes.trim()||null})
    if(error)setMessage(error.message);else{setMessage('Movimiento de inventario registrado.');setMove({inventory_item_id:'',movement_type:'PURCHASE_IN',quantity:'',unit_cost:'',purchase_id:'',reference:'',notes:''});await load()}
  }
  const stockValue=useMemo(()=>items.reduce((s,r)=>s+Number(r.current_stock||0)*Number(r.average_cost||0),0),[items])
  const low=useMemo(()=>items.filter(r=>r.active&&Number(r.current_stock)<=Number(r.minimum_stock)&&Number(r.minimum_stock)>0),[items])
  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">ALMACÉN INTERNO</p><h2>Inventario de materiales</h2><p>Controla existencias para producir trabajos terminados. Nada de este catálogo se ofrece al cliente como producto de venta.</p></div><span className={low.length?'status dte-pending':'status dte-ready'}>{low.length?`${low.length} bajo mínimo`:'Stock controlado'}</span></div>
    <div className="metrics-grid"><article className="metric-card"><span>Materiales activos</span><strong>{items.filter(r=>r.active).length}</strong></article><article className="metric-card"><span>Valor estimado stock</span><strong>{money(stockValue)}</strong></article><article className="metric-card"><span>Bajo mínimo</span><strong>{low.length}</strong></article></div>
    {message&&<p className={message.includes('registrado')||message.includes('agregado')?'feedback success':'feedback error'}>{message}</p>}
    <div className="module-grid two-column">
      <form className="panel" onSubmit={saveItem}><div className="panel-heading"><div><p className="form-kicker">CATÁLOGO INTERNO</p><h3>Nuevo material</h3></div></div><div className="form-grid">
        <label className="field"><span>SKU / código</span><input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} placeholder="VIN-BLA-122"/></label>
        <label className="field"><span>Nombre *</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Vinil blanco brillante"/></label>
        <label className="field"><span>Categoría</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option value="MATERIAL">Material general</option><option value="SUBLIMATION_BLANK">Base sublimable</option><option value="PRINT_MEDIA">Medio de impresión</option><option value="INK">Tinta</option><option value="RIGID_SHEET">Lámina / rígido</option><option value="HARDWARE">Herrajes</option><option value="PACKAGING">Empaque</option><option value="OTHER">Otro</option></select></label>
        <label className="field"><span>Unidad</span><select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option value="UNIT">Unidad</option><option value="METER">Metro</option><option value="M2">m²</option><option value="LITER">Litro</option><option value="ML">ml</option><option value="KG">kg</option><option value="SHEET">Lámina</option><option value="ROLL">Rollo</option></select></label>
        <label className="field"><span>Stock mínimo</span><input type="number" min="0" step="0.001" value={form.minimum_stock} onChange={e=>setForm({...form,minimum_stock:e.target.value})}/></label>
        <label className="field"><span>Ubicación</span><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Estante A2"/></label>
      </div><div className="form-actions end"><button>Agregar material</button></div></form>
      <form className="panel" onSubmit={saveMovement}><div className="panel-heading"><div><p className="form-kicker">MOVIMIENTO</p><h3>Entrada / ajuste</h3></div></div><div className="form-grid">
        <label className="field"><span>Material *</span><select required value={move.inventory_item_id} onChange={e=>selectMoveItem(e.target.value)}><option value="">Seleccionar</option>{items.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.name} · stock {qty(r.current_stock)} {r.unit}</option>)}</select></label>
        <label className="field"><span>Tipo</span><select value={move.movement_type} onChange={e=>setMove({...move,movement_type:e.target.value})}><option value="PURCHASE_IN">Entrada por compra</option><option value="ADJUST_IN">Ajuste positivo</option><option value="ADJUST_OUT">Ajuste negativo</option><option value="RETURN">Devolución a almacén</option></select></label>
        <label className="field"><span>Cantidad *</span><input required type="number" min="0.001" step="0.001" value={move.quantity} onChange={e=>setMove({...move,quantity:e.target.value})}/></label>
        <label className="field"><span>Costo unitario</span><input type="number" min="0" step="0.0001" value={move.unit_cost} onChange={e=>setMove({...move,unit_cost:e.target.value})}/></label>
        <label className="field form-span-2"><span>Compra relacionada</span><select value={move.purchase_id} onChange={e=>setMove({...move,purchase_id:e.target.value})}><option value="">Sin compra relacionada</option>{purchases.map(p=><option key={p.id} value={p.id}>COMP-{String(p.number).padStart(5,'0')} · {p.concept} · {money(p.total)}</option>)}</select></label>
        <label className="field form-span-2"><span>Referencia / nota</span><input value={move.reference} onChange={e=>setMove({...move,reference:e.target.value})}/></label>
      </div><div className="form-actions end"><button>Registrar movimiento</button></div></form>
    </div>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">EXISTENCIAS</p><h3>Materiales en almacén</h3></div></div>{items.length?<div className="client-list">{items.map(r=><div className="client-row" key={r.id}><div><strong>{r.name}</strong><small>{r.sku||'Sin código'} · {r.category} · {r.location||'Sin ubicación'}</small></div><div><strong>{qty(r.current_stock)} {r.unit}</strong><small>Promedio {money(r.average_cost)} · valor {money(Number(r.current_stock)*Number(r.average_cost))}</small></div></div>)}</div>:<div className="empty-state"><strong>Almacén vacío</strong><p>Agrega vinil, tintas, PVC, acrílico, bases sublimables y demás consumo interno.</p></div>}</section>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">KARDEX</p><h3>Movimientos recientes</h3></div></div>{movements.length?<div className="client-list">{movements.map(r=><div className="client-row" key={r.id}><div><strong>{r.inventory_items?.name||'Material'} · {r.movement_type}</strong><small>{new Date(r.created_at).toLocaleString('es-SV')} · {r.reference||r.purchases?.concept||'Sin referencia'}</small></div><div><strong>{qty(r.quantity)} {r.inventory_items?.unit||''}</strong><small>{money(Number(r.quantity)*Number(r.unit_cost))}</small></div></div>)}</div>:<div className="empty-state"><strong>Sin movimientos</strong><p>Las entradas y ajustes quedarán registrados aquí.</p></div>}</section>
  </section>
}

export function ConsumptionCostsModule({company,supabase}){
  const [items,setItems]=useState([]),[orders,setOrders]=useState([]),[moves,setMoves]=useState([]),[costs,setCosts]=useState([]),[message,setMessage]=useState('')
  const [use,setUse]=useState({work_order_id:'',inventory_item_id:'',quantity:'',notes:''})
  const [cost,setCost]=useState({work_order_id:'',cost_type:'LABOR',concept:'',amount:'',incurred_at:today(),notes:''})
  const load=async()=>{const [i,o,m,c]=await Promise.all([
    supabase.from('inventory_items').select('*').eq('company_id',company.id).eq('active',true).order('name'),
    supabase.from('work_orders').select('id,number,title,total,status,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(100),
    supabase.from('inventory_movements').select('*,inventory_items(name,unit),work_orders(number,title)').eq('company_id',company.id).eq('movement_type','CONSUMPTION').order('created_at',{ascending:false}).limit(100),
    supabase.from('work_order_costs').select('*,work_orders(number,title)').eq('company_id',company.id).order('incurred_at',{ascending:false}).limit(100),
  ]);if(i.error||o.error||m.error||c.error)setMessage(i.error?.message||o.error?.message||m.error?.message||c.error?.message);else{setItems(i.data||[]);setOrders(o.data||[]);setMoves(m.data||[]);setCosts(c.data||[])}}
  useEffect(()=>{load()},[company.id])
  const consume=async(e)=>{e.preventDefault();const item=items.find(r=>r.id===use.inventory_item_id);if(!item)return setMessage('Seleccioná un material.');const amount=Number(use.quantity||0);if(amount<=0)return setMessage('La cantidad debe ser mayor a cero.');if(amount>Number(item.current_stock))return setMessage(`Stock insuficiente. Disponible: ${qty(item.current_stock)} ${item.unit}.`);const {error}=await supabase.from('inventory_movements').insert({company_id:company.id,inventory_item_id:item.id,movement_type:'CONSUMPTION',quantity:amount,unit_cost:Number(item.average_cost||0),work_order_id:use.work_order_id,notes:use.notes.trim()||null,reference:'Consumo de producción'});if(error)setMessage(error.message);else{setMessage('Consumo cargado a la orden.');setUse({work_order_id:'',inventory_item_id:'',quantity:'',notes:''});await load()}}
  const addCost=async(e)=>{e.preventDefault();const {error}=await supabase.from('work_order_costs').insert({...cost,company_id:company.id,amount:Number(cost.amount||0),notes:cost.notes.trim()||null});if(error)setMessage(error.message);else{setMessage('Costo directo cargado a la orden.');setCost({work_order_id:'',cost_type:'LABOR',concept:'',amount:'',incurred_at:today(),notes:''});await load()}}
  return <section className="clients-module"><div className="clients-titlebar"><div><p className="form-kicker">COSTEO REAL</p><h2>Consumo por orden de trabajo</h2><p>Descuenta material del almacén y carga mano de obra, tercerización, transporte, instalación y otros costos directos a cada trabajo.</p></div></div>
    {message&&<p className={message.includes('cargado')?'feedback success':'feedback error'}>{message}</p>}
    <div className="module-grid two-column">
      <form className="panel" onSubmit={consume}><div className="panel-heading"><div><p className="form-kicker">MATERIAL</p><h3>Consumir inventario</h3></div></div><div className="form-grid"><label className="field form-span-2"><span>Orden *</span><select required value={use.work_order_id} onChange={e=>setUse({...use,work_order_id:e.target.value})}><option value="">Seleccionar orden</option>{orders.filter(o=>o.status!=='CANCELLED').map(o=><option key={o.id} value={o.id}>{orderLabel(o)}</option>)}</select></label><label className="field"><span>Material *</span><select required value={use.inventory_item_id} onChange={e=>setUse({...use,inventory_item_id:e.target.value})}><option value="">Seleccionar</option>{items.map(r=><option key={r.id} value={r.id}>{r.name} · {qty(r.current_stock)} {r.unit}</option>)}</select></label><label className="field"><span>Cantidad *</span><input required type="number" min="0.001" step="0.001" value={use.quantity} onChange={e=>setUse({...use,quantity:e.target.value})}/></label><label className="field form-span-2"><span>Nota de producción</span><input value={use.notes} onChange={e=>setUse({...use,notes:e.target.value})}/></label></div><div className="form-actions end"><button>Descontar y cargar costo</button></div></form>
      <form className="panel" onSubmit={addCost}><div className="panel-heading"><div><p className="form-kicker">OTRO COSTO</p><h3>Costo directo</h3></div></div><div className="form-grid"><label className="field form-span-2"><span>Orden *</span><select required value={cost.work_order_id} onChange={e=>setCost({...cost,work_order_id:e.target.value})}><option value="">Seleccionar orden</option>{orders.filter(o=>o.status!=='CANCELLED').map(o=><option key={o.id} value={o.id}>{orderLabel(o)}</option>)}</select></label><label className="field"><span>Tipo</span><select value={cost.cost_type} onChange={e=>setCost({...cost,cost_type:e.target.value})}><option value="LABOR">Mano de obra</option><option value="DESIGN">Diseño</option><option value="OUTSOURCED">Tercerización</option><option value="TRANSPORT">Transporte</option><option value="INSTALLATION">Instalación</option><option value="OTHER">Otro</option></select></label><label className="field"><span>Fecha</span><input type="date" value={cost.incurred_at} onChange={e=>setCost({...cost,incurred_at:e.target.value})}/></label><label className="field"><span>Concepto *</span><input required value={cost.concept} onChange={e=>setCost({...cost,concept:e.target.value})}/></label><label className="field"><span>Monto *</span><input required type="number" min="0" step="0.01" value={cost.amount} onChange={e=>setCost({...cost,amount:e.target.value})}/></label></div><div className="form-actions end"><button>Cargar costo</button></div></form>
    </div>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">TRAZABILIDAD</p><h3>Últimos costos cargados</h3></div></div><div className="client-list">{moves.slice(0,50).map(r=><div className="client-row" key={r.id}><div><strong>OT-{String(r.work_orders?.number||0).padStart(5,'0')} · {r.inventory_items?.name}</strong><small>Material · {qty(r.quantity)} {r.inventory_items?.unit||''}</small></div><strong>{money(Number(r.quantity)*Number(r.unit_cost))}</strong></div>)}{costs.slice(0,50).map(r=><div className="client-row" key={r.id}><div><strong>OT-{String(r.work_orders?.number||0).padStart(5,'0')} · {r.concept}</strong><small>{r.cost_type} · {r.incurred_at}</small></div><strong>{money(r.amount)}</strong></div>)}</div></section>
  </section>
}

export function ProfitabilityModule({company,supabase}){
  const [orders,setOrders]=useState([]),[moves,setMoves]=useState([]),[costs,setCosts]=useState([]),[message,setMessage]=useState('')
  const load=async()=>{const [o,m,c]=await Promise.all([
    supabase.from('work_orders').select('id,number,title,total,status,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(100),
    supabase.from('inventory_movements').select('work_order_id,quantity,unit_cost').eq('company_id',company.id).eq('movement_type','CONSUMPTION').not('work_order_id','is',null),
    supabase.from('work_order_costs').select('work_order_id,amount').eq('company_id',company.id),
  ]);if(o.error||m.error||c.error)setMessage(o.error?.message||m.error?.message||c.error?.message);else{setOrders(o.data||[]);setMoves(m.data||[]);setCosts(c.data||[])}}
  useEffect(()=>{load()},[company.id])
  const rows=useMemo(()=>orders.map(o=>{const materials=moves.filter(m=>m.work_order_id===o.id).reduce((s,m)=>s+Number(m.quantity)*Number(m.unit_cost),0);const direct=costs.filter(c=>c.work_order_id===o.id).reduce((s,c)=>s+Number(c.amount),0);const totalCost=materials+direct;const revenue=Number(o.total||0);const profit=revenue-totalCost;const margin=revenue>0?(profit/revenue)*100:0;return{...o,materials,direct,totalCost,revenue,profit,margin}}),[orders,moves,costs])
  const totals=useMemo(()=>rows.reduce((a,r)=>({revenue:a.revenue+r.revenue,cost:a.cost+r.totalCost,profit:a.profit+r.profit}),{revenue:0,cost:0,profit:0}),[rows])
  return <section className="clients-module"><div className="clients-titlebar"><div><p className="form-kicker">RENTABILIDAD</p><h2>Costo y utilidad por trabajo</h2><p>Compara el valor de la orden con el consumo real de materiales y demás costos directos.</p></div></div>
    {message&&<p className="feedback error">{message}</p>}
    <div className="metrics-grid"><article className="metric-card"><span>Venta órdenes</span><strong>{money(totals.revenue)}</strong></article><article className="metric-card"><span>Costo directo real</span><strong>{money(totals.cost)}</strong></article><article className="metric-card"><span>Utilidad bruta estimada</span><strong>{money(totals.profit)}</strong></article></div>
    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">ANÁLISIS</p><h3>Rentabilidad de órdenes</h3></div></div>{rows.length?<div className="client-list">{rows.map(r=><div className="client-row" key={r.id}><div><strong>OT-{String(r.number).padStart(5,'0')} · {r.clients?.name||'Cliente'} · {r.title}</strong><small>Venta {money(r.revenue)} · materiales {money(r.materials)} · otros costos {money(r.direct)} · costo total {money(r.totalCost)}</small></div><div><strong>{money(r.profit)}</strong><small>{r.margin.toFixed(1)}% margen · {r.status}</small></div></div>)}</div>:<div className="empty-state"><strong>Sin órdenes para analizar</strong><p>La rentabilidad aparecerá cuando existan órdenes y costos asociados.</p></div>}</section>
  </section>
}
