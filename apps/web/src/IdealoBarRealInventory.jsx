import {useCallback,useEffect,useMemo,useState} from 'react'
import './idealo-bar-real-inventory.css'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const qty=n=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(n||0))
const n=value=>Number(value||0)

export default function IdealoBarRealInventory({company,supabase}){
 const companyId=company?.id
 const [tab,setTab]=useState('conteo')
 const [snapshot,setSnapshot]=useState({inventory:[],products:[],recipes:[]})
 const [access,setAccess]=useState({permissions:[],role:'none'})
 const [readiness,setReadiness]=useState(null)
 const [counts,setCounts]=useState({})
 const [prices,setPrices]=useState({})
 const [selectedProductId,setSelectedProductId]=useState('')
 const [recipeDraft,setRecipeDraft]=useState([])
 const [ingredientId,setIngredientId]=useState('')
 const [recipeQty,setRecipeQty]=useState('1')
 const [recipeWaste,setRecipeWaste]=useState('0')
 const [newIngredient,setNewIngredient]=useState({name:'',unit:'UNIT'})
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  const [snapRes,accessRes,readyRes]=await Promise.all([
   supabase.rpc('bar_real_setup_snapshot',{p_company_id:companyId}),
   supabase.rpc('bar_my_access',{p_company_id:companyId}),
   supabase.rpc('bar_commercial_readiness',{p_company_id:companyId}),
  ])
  const failure=snapRes.error||accessRes.error||readyRes.error
  if(failure){setError(failure.message);setLoading(false);return}
  const next=snapRes.data||{inventory:[],products:[],recipes:[]}
  setSnapshot(next);setAccess(accessRes.data||{permissions:[],role:'none'});setReadiness(readyRes.data||null)
  setCounts(Object.fromEntries((next.inventory||[]).map(item=>[item.id,{bodega:String(item.bodega??0),refrigerador:String(item.refrigerador??0),barra:String(item.barra??0),cost:String(item.average_cost??0),minimum:String(item.minimum_stock??0),reorder:String(item.reorder_point??0),target:String(item.target_stock??0)}])))
  setPrices(Object.fromEntries((next.products||[]).map(product=>[product.id,String(product.sale_price??0)])))
  setSelectedProductId(current=>current&&(next.products||[]).some(p=>p.id===current)?current:(next.products?.[0]?.id||''))
  setIngredientId(current=>current&&(next.inventory||[]).some(i=>i.id===current)?current:(next.inventory?.[0]?.id||''))
  setLoading(false)
 },[companyId,supabase])

 useEffect(()=>{load()},[load])
 useEffect(()=>{
  const rows=(snapshot.recipes||[]).filter(row=>row.product_id===selectedProductId).map(row=>({inventory_item_id:row.inventory_item_id,quantity:String(row.quantity),waste_percent:String(row.waste_percent||0)}))
  setRecipeDraft(rows)
 },[selectedProductId,snapshot.recipes])

 const permissions=Array.isArray(access?.permissions)?access.permissions:[]
 const has=p=>permissions.includes('*')||permissions.includes(p)
 const canInventory=has('inventory.manage')
 const canCatalog=has('catalog.manage')
 const inventoryById=useMemo(()=>new Map((snapshot.inventory||[]).map(item=>[item.id,item])),[snapshot.inventory])
 const selectedProduct=(snapshot.products||[]).find(p=>p.id===selectedProductId)||null
 const pendingStock=(snapshot.inventory||[]).filter(i=>n(i.current_stock)<=0).length
 const pendingCost=(snapshot.inventory||[]).filter(i=>n(i.average_cost)<=0).length
 const draftProducts=(snapshot.products||[]).filter(p=>!p.active).length
 const missingRecipe=(snapshot.products||[]).filter(p=>n(p.recipe_components)===0).length

 const act=async(task,success)=>{
  setWorking(true);setError('');setMessage('')
  try{await task();setMessage(success);await load()}catch(e){setError(e?.message||String(e))}finally{setWorking(false)}
 }
 const saveCount=item=>act(async()=>{
  const d=counts[item.id]||{}
  const values=[d.bodega,d.refrigerador,d.barra,d.cost,d.minimum,d.reorder,d.target].map(n)
  if(values.some(v=>!Number.isFinite(v)||v<0))throw new Error('Revisa cantidades, costo y mínimos: deben ser números mayores o iguales a cero.')
  const {error:e}=await supabase.rpc('bar_save_physical_inventory',{p_inventory_item_id:item.id,p_bodega:values[0],p_refrigerador:values[1],p_barra:values[2],p_unit_cost:values[3],p_minimum_stock:values[4],p_reorder_point:values[5],p_target_stock:values[6]})
  if(e)throw e
 },`Conteo físico de ${item.name} guardado y conciliado.`)

 const savePrice=(product,activate)=>act(async()=>{
  const value=n(prices[product.id])
  if(!Number.isFinite(value)||value<0)throw new Error('El precio no es válido.')
  const {error:e}=await supabase.rpc('bar_save_product_price',{p_product_id:product.id,p_price:value,p_activate:activate})
  if(e)throw e
 },activate?`${product.name} quedó activo en la Carta.`:`Precio de ${product.name} guardado.`)

 const addRecipeLine=()=>{
  if(!ingredientId)return setError('Selecciona un insumo.')
  const amount=n(recipeQty),waste=n(recipeWaste)
  if(!(amount>0))return setError('La cantidad por producto debe ser mayor que cero.')
  if(waste<0||waste>100)return setError('La merma debe estar entre 0% y 100%.')
  setError('')
  setRecipeDraft(rows=>{
   const exists=rows.some(row=>row.inventory_item_id===ingredientId)
   return exists?rows.map(row=>row.inventory_item_id===ingredientId?{...row,quantity:String(amount),waste_percent:String(waste)}:row):[...rows,{inventory_item_id:ingredientId,quantity:String(amount),waste_percent:String(waste)}]
  })
 }
 const saveRecipe=()=>act(async()=>{
  if(!selectedProductId)throw new Error('Selecciona un producto.')
  if(!recipeDraft.length)throw new Error('Agrega al menos un componente real a la receta.')
  const components=recipeDraft.map(row=>({inventory_item_id:row.inventory_item_id,quantity:n(row.quantity),waste_percent:n(row.waste_percent)}))
  const {error:e}=await supabase.rpc('bar_replace_product_recipe',{p_product_id:selectedProductId,p_components:components})
  if(e)throw e
 },`Receta de ${selectedProduct?.name||'producto'} guardada.`)
 const createIngredient=()=>act(async()=>{
  if(!newIngredient.name.trim())throw new Error('Escribe el nombre real del insumo.')
  const {data,error:e}=await supabase.rpc('bar_create_inventory_ingredient',{p_company_id:companyId,p_name:newIngredient.name.trim(),p_unit:newIngredient.unit.trim()||'UNIT'})
  if(e)throw e
  setNewIngredient({name:'',unit:'UNIT'});setIngredientId(data)
 },'Insumo creado en cero. Ahora registra su conteo físico y costo real.')

 if(loading)return <div className="bar-real-loading"><b>IDEALO BAR</b><span>Cargando inventario, precios y recetas reales…</span></div>

 return <div className="bar-real-shell">
  <header className="bar-real-head">
   <div><small>Control real del negocio</small><h2>Inventario · Precios · Recetas</h2><p>Registra únicamente cantidades, costos y precios reales. Los borradores no se activan hasta tener precio y receta.</p></div>
   <div className="bar-real-score"><strong>{readiness?.score??'—'}%</strong><span>puesta en marcha</span></div>
  </header>
  {error&&<div className="bar-real-alert error"><b>!</b><span>{error}</span><button type="button" onClick={()=>setError('')}>×</button></div>}
  {message&&<div className="bar-real-alert ok"><b>✓</b><span>{message}</span><button type="button" onClick={()=>setMessage('')}>×</button></div>}
  <div className="bar-real-kpis"><div><b>{pendingStock}</b><span>sin conteo positivo</span></div><div><b>{pendingCost}</b><span>sin costo</span></div><div><b>{draftProducts}</b><span>borradores</span></div><div><b>{missingRecipe}</b><span>sin receta</span></div></div>
  <nav className="bar-real-tabs">
   <button type="button" className={tab==='conteo'?'active':''} onClick={()=>setTab('conteo')}>1 · Conteo físico</button>
   {canCatalog&&<button type="button" className={tab==='precios'?'active':''} onClick={()=>setTab('precios')}>2 · Precios y activación</button>}
   <button type="button" className={tab==='recetas'?'active':''} onClick={()=>setTab('recetas')}>3 · Recetas</button>
  </nav>

  {tab==='conteo'&&<section className="bar-real-panel">
   <div className="bar-real-section-head"><div><h3>Existencias por ubicación</h3><p>El total central se recalcula como Bodega + Refrigerador + Barra y queda trazado como ajuste de conteo físico.</p></div>{canInventory&&<div className="bar-real-new"><input placeholder="Nuevo insumo real" value={newIngredient.name} onChange={e=>setNewIngredient(v=>({...v,name:e.target.value}))}/><input placeholder="Unidad" value={newIngredient.unit} onChange={e=>setNewIngredient(v=>({...v,unit:e.target.value}))}/><button type="button" disabled={working} onClick={createIngredient}>+ Crear</button></div>}</div>
   <div className="bar-real-count-list">{(snapshot.inventory||[]).map(item=>{const d=counts[item.id]||{};const total=n(d.bodega)+n(d.refrigerador)+n(d.barra);return <article key={item.id} className="bar-real-count-card"><div className="bar-real-item-title"><div><b>{item.name}</b><small>{item.sku||'Insumo BAR'} · {item.unit}</small></div><strong>{qty(total)}</strong></div><div className="bar-real-grid7"><label>Bodega<input type="number" min="0" step="0.001" value={d.bodega??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],bodega:e.target.value}}))}/></label><label>Refrigerador<input type="number" min="0" step="0.001" value={d.refrigerador??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],refrigerador:e.target.value}}))}/></label><label>Barra<input type="number" min="0" step="0.001" value={d.barra??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],barra:e.target.value}}))}/></label><label>Costo unitario<input type="number" min="0" step="0.0001" value={d.cost??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],cost:e.target.value}}))}/></label><label>Mínimo<input type="number" min="0" step="0.001" value={d.minimum??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],minimum:e.target.value}}))}/></label><label>Reorden<input type="number" min="0" step="0.001" value={d.reorder??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],reorder:e.target.value}}))}/></label><label>Objetivo<input type="number" min="0" step="0.001" value={d.target??''} onChange={e=>setCounts(v=>({...v,[item.id]:{...v[item.id],target:e.target.value}}))}/></label></div><footer><span>Actual central: {qty(item.current_stock)} · costo {money.format(n(item.average_cost))}</span>{canInventory&&<button type="button" disabled={working} onClick={()=>saveCount(item)}>Guardar conteo real</button>}</footer></article>})}</div>
  </section>}

  {tab==='precios'&&canCatalog&&<section className="bar-real-panel"><div className="bar-real-section-head"><div><h3>Precio de venta y activación</h3><p>Guardar precio no activa un borrador. “Guardar y activar” exige receta activa y precio mayor que cero.</p></div></div><div className="bar-real-price-list">{(snapshot.products||[]).map(product=>{const price=n(prices[product.id]);const cost=n(product.recipe_cost);const margin=price>0?price-cost:0;const pct=price>0?(margin/price)*100:0;return <article key={product.id} className={product.active?'active':'draft'}><div><b>{product.name}</b><small>{product.sku} · {product.station==='bar'?'Barra':'Cocina'} · {product.recipe_components} componente(s)</small></div><label>Precio<input type="number" min="0" step="0.01" value={prices[product.id]??''} onChange={e=>setPrices(v=>({...v,[product.id]:e.target.value}))}/></label><div className="bar-real-margin"><span>Costo receta</span><b>{cost>0?money.format(cost):'Pendiente'}</b><span>Margen</span><strong>{price>0&&cost>0?`${money.format(margin)} · ${pct.toFixed(1)}%`:'—'}</strong></div><div className="bar-real-price-actions"><span className={product.active?'badge active':'badge draft'}>{product.active?'Activo':'Borrador'}</span><button type="button" disabled={working} onClick={()=>savePrice(product,false)}>Guardar precio</button>{!product.active&&<button type="button" className="primary" disabled={working||!(price>0)||n(product.recipe_components)===0} onClick={()=>savePrice(product,true)}>Guardar y activar</button>}</div></article>})}</div></section>}

  {tab==='recetas'&&<section className="bar-real-panel"><div className="bar-real-section-head"><div><h3>Receta real por producto</h3><p>Define exactamente qué insumo consume cada venta. Guardar reemplaza la receta activa del producto.</p></div></div><div className="bar-real-recipe-layout"><aside><label>Producto<select value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}>{(snapshot.products||[]).map(p=><option key={p.id} value={p.id}>{p.name} · {p.active?'Activo':'Borrador'}</option>)}</select></label>{selectedProduct&&<div className="bar-real-selected"><b>{selectedProduct.name}</b><span>Precio {money.format(n(selectedProduct.sale_price))}</span><span>{selectedProduct.recipe_components} componente(s) guardado(s)</span></div>}<div className="bar-real-add-line"><label>Insumo<select value={ingredientId} onChange={e=>setIngredientId(e.target.value)}>{(snapshot.inventory||[]).map(i=><option key={i.id} value={i.id}>{i.name} · {qty(i.current_stock)} {i.unit}</option>)}</select></label><label>Cantidad<input type="number" min="0.000001" step="0.001" value={recipeQty} onChange={e=>setRecipeQty(e.target.value)}/></label><label>Merma %<input type="number" min="0" max="100" step="0.1" value={recipeWaste} onChange={e=>setRecipeWaste(e.target.value)}/></label><button type="button" onClick={addRecipeLine}>Agregar / actualizar componente</button></div></aside><div className="bar-real-recipe-lines">{recipeDraft.length?recipeDraft.map((row,index)=>{const item=inventoryById.get(row.inventory_item_id);const lineCost=n(row.quantity)*(1+n(row.waste_percent)/100)*n(item?.average_cost);return <article key={row.inventory_item_id}><div><b>{item?.name||'Insumo'}</b><small>{row.quantity} {item?.unit||''} por venta · merma {row.waste_percent||0}%</small></div><strong>{lineCost>0?money.format(lineCost):'Costo pendiente'}</strong><button type="button" onClick={()=>setRecipeDraft(rows=>rows.filter((_,i)=>i!==index))}>Quitar</button></article>}):<div className="bar-real-empty"><b>Sin componentes</b><span>Agrega los insumos reales de este producto.</span></div>}{canInventory&&<button type="button" className="bar-real-save-recipe" disabled={working||!recipeDraft.length} onClick={saveRecipe}>Guardar receta real</button>}</div></div></section>}

  <div className="bar-real-note"><b>Importante:</b> el sistema ya está listo para recibir los datos reales, pero no inventa cantidades ni costos físicos. Cuando el inventario usado por la Carta tenga existencias reales, la puesta en marcha podrá llegar al 100% operativo.</div>
 </div>
}
