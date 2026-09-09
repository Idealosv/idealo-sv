import { useCallback, useEffect, useMemo, useState } from 'react'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const qty=n=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:3}).format(Number(n||0))
const panel={border:'1px solid #303742',background:'#171b22',borderRadius:18,padding:16}
const input={width:'100%',boxSizing:'border-box',background:'#11151a',border:'1px solid #303742',borderRadius:10,color:'#fff',padding:'10px 11px',font:'inherit'}
const button={border:'1px solid #74471f',background:'#3b2818',color:'#ffd6ae',borderRadius:10,padding:'10px 12px',fontWeight:800,cursor:'pointer'}
const muted={color:'#98a1ad'}

export default function IdealoBarInventory({company,supabase}){
 const companyId=company?.id
 const [products,setProducts]=useState([])
 const [inventory,setInventory]=useState([])
 const [recipes,setRecipes]=useState([])
 const [selectedProductId,setSelectedProductId]=useState('')
 const [ingredientId,setIngredientId]=useState('')
 const [recipeQty,setRecipeQty]=useState('1')
 const [waste,setWaste]=useState('0')
 const [productQuery,setProductQuery]=useState('')
 const [newIngredient,setNewIngredient]=useState({name:'',unit:'UNIT',stock:'0',cost:'0'})
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const [productsRes,inventoryRes,recipesRes]=await Promise.all([
    supabase.from('finished_products').select('id,name,sku,sale_price,active').eq('company_id',companyId).eq('active',true).order('name').limit(500),
    supabase.from('inventory_items').select('id,name,sku,unit,current_stock,average_cost,minimum_stock,active').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('name').limit(1000),
    supabase.from('bar_recipe_components').select('*').eq('company_id',companyId).eq('active',true).order('created_at'),
   ])
   const failure=[productsRes,inventoryRes,recipesRes].find(result=>result.error)?.error
   if(failure)throw failure
   const nextProducts=productsRes.data||[]
   const nextInventory=inventoryRes.data||[]
   setProducts(nextProducts);setInventory(nextInventory);setRecipes(recipesRes.data||[])
   setSelectedProductId(current=>current&&nextProducts.some(p=>p.id===current)?current:(nextProducts[0]?.id||''))
   setIngredientId(current=>current&&nextInventory.some(i=>i.id===current)?current:(nextInventory[0]?.id||''))
  }catch(err){setError(String(err?.message||err||'No se pudo cargar recetas e inventario.'))}finally{setLoading(false)}
 },[companyId,supabase])

 useEffect(()=>{load()},[load])
 const act=async task=>{setWorking(true);setError('');setMessage('');try{await task()}catch(err){setError(String(err?.message||err||'No se pudo completar la operación.'))}finally{setWorking(false)}}

 const selectedProduct=products.find(p=>p.id===selectedProductId)||null
 const inventoryById=useMemo(()=>new Map(inventory.map(item=>[item.id,item])),[inventory])
 const selectedRecipe=recipes.filter(row=>row.product_id===selectedProductId)
 const filteredProducts=products.filter(p=>!productQuery||`${p.name} ${p.sku||''}`.toLowerCase().includes(productQuery.trim().toLowerCase()))
 const estimatedCost=selectedRecipe.reduce((sum,row)=>{const item=inventoryById.get(row.inventory_item_id);return sum+(Number(row.quantity_per_unit)*(1+Number(row.waste_percent||0)/100)*Number(item?.average_cost||0))},0)
 const sellable=selectedRecipe.length?Math.floor(Math.min(...selectedRecipe.map(row=>{const item=inventoryById.get(row.inventory_item_id);const needed=Number(row.quantity_per_unit)*(1+Number(row.waste_percent||0)/100);return needed>0?Number(item?.current_stock||0)/needed:0}))):0

 const addRecipe=()=>act(async()=>{
  if(!selectedProductId)throw new Error('Seleccioná un producto.')
  if(!ingredientId)throw new Error('Seleccioná un insumo de inventario.')
  const amount=Number(recipeQty),wastePct=Number(waste||0)
  if(!(amount>0))throw new Error('La cantidad por producto debe ser mayor que cero.')
  if(wastePct<0||wastePct>100)throw new Error('La merma técnica debe estar entre 0% y 100%.')
  const {error:saveError}=await supabase.from('bar_recipe_components').upsert({company_id:companyId,product_id:selectedProductId,inventory_item_id:ingredientId,quantity_per_unit:amount,waste_percent:wastePct,active:true},{onConflict:'company_id,product_id,inventory_item_id'})
  if(saveError)throw saveError
  setMessage('Componente agregado a la receta.');await load()
 })

 const disableRecipe=row=>act(async()=>{
  const {error:updateError}=await supabase.from('bar_recipe_components').update({active:false}).eq('id',row.id).eq('company_id',companyId)
  if(updateError)throw updateError
  setMessage('Componente retirado de la receta.');await load()
 })

 const createIngredient=()=>act(async()=>{
  const name=newIngredient.name.trim(),stock=Number(newIngredient.stock||0),cost=Number(newIngredient.cost||0),unit=newIngredient.unit.trim()||'UNIT'
  if(!name)throw new Error('Escribí el nombre del insumo.')
  if(stock<0||cost<0)throw new Error('Stock y costo no pueden ser negativos.')
  const {data:item,error:itemError}=await supabase.from('inventory_items').insert({company_id:companyId,name,category:'MATERIAL',item_type:'MATERIAL',unit,current_stock:0,average_cost:cost,last_cost:cost,standard_cost:cost,active:true}).select('id').single()
  if(itemError)throw itemError
  if(stock>0){
   const {error:movementError}=await supabase.from('inventory_movements').insert({company_id:companyId,inventory_item_id:item.id,movement_type:'INITIAL',quantity:stock,unit_cost:cost,document_type:'BAR_SETUP',document_id:item.id,reference:'IDEALO BAR',notes:'Existencia inicial creada desde Recetas e inventario'})
   if(movementError)throw movementError
  }
  setNewIngredient({name:'',unit:'UNIT',stock:'0',cost:'0'});setMessage('Insumo creado en el Inventario central de IDEALO SV.');await load();setIngredientId(item.id)
 })

 if(loading)return <div className="bar-loading"><span>IDEALO BAR</span><strong>Cargando recetas e inventario…</strong></div>

 return <div className="idealo-bar-shell" style={{paddingTop:8}}>
  <header className="bar-hero"><div><span className="bar-kicker">IDEALO SV · Inventario central</span><h2>Recetas e inventario</h2><p>Cada venta descuenta automáticamente los insumos al enviarse a Cocina o Barra.</p></div><div className="bar-live"><i/> Automático</div></header>
  {error&&<div className="bar-alert"><span>!</span><p>{error}</p><button type="button" onClick={()=>setError('')}>×</button></div>}
  {message&&<div style={{margin:'12px 0',padding:12,border:'1px solid #315a46',background:'#15251d',borderRadius:12,color:'#9ce2bb'}}>{message}</div>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(300px,.85fr) minmax(360px,1.15fr)',gap:14,alignItems:'start'}}>
   <section style={panel}>
    <span className="bar-kicker">1 · Insumos</span><h3 style={{margin:'6px 0 4px',fontSize:22}}>Inventario del bar</h3><p style={{...muted,marginTop:0}}>Creá aquí cerveza, pan, carne, queso, papas, aceite y cualquier ingrediente. Se guarda en el Inventario general de IDEALO SV.</p>
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8}}><input style={input} placeholder="Nombre del insumo" value={newIngredient.name} onChange={e=>setNewIngredient(v=>({...v,name:e.target.value}))}/><input style={input} placeholder="Unidad" value={newIngredient.unit} onChange={e=>setNewIngredient(v=>({...v,unit:e.target.value}))}/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}><input style={input} type="number" min="0" step="0.001" placeholder="Stock inicial" value={newIngredient.stock} onChange={e=>setNewIngredient(v=>({...v,stock:e.target.value}))}/><input style={input} type="number" min="0" step="0.0001" placeholder="Costo unitario" value={newIngredient.cost} onChange={e=>setNewIngredient(v=>({...v,cost:e.target.value}))}/></div>
    <button type="button" style={{...button,width:'100%',marginTop:8}} disabled={working} onClick={createIngredient}>+ Crear insumo</button>
    <div style={{marginTop:16,maxHeight:300,overflow:'auto'}}>{inventory.length?inventory.map(item=><div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,padding:'10px 2px',borderBottom:'1px solid #292f38'}}><div><strong>{item.name}</strong><small style={{display:'block',...muted}}>{item.unit} · costo {money.format(Number(item.average_cost||0))}</small></div><b style={{color:Number(item.current_stock)<=Number(item.minimum_stock)?'#f4b844':'#9ce2bb'}}>{qty(item.current_stock)}</b></div>):<div className="bar-empty-state"><span>＋</span><strong>Sin insumos</strong><p>Creá el primer insumo para empezar a definir recetas.</p></div>}</div>
   </section>

   <section style={panel}>
    <span className="bar-kicker">2 · Receta</span><h3 style={{margin:'6px 0 4px',fontSize:22}}>Consumo por producto</h3><p style={{...muted,marginTop:0}}>Ejemplo: <b style={{color:'#fff'}}>Balde de 6</b> = 6 cervezas. Un <b style={{color:'#fff'}}>Hielerazo</b> puede consumir la cantidad de cervezas e hielo que configurés.</p>
    <input style={{...input,marginBottom:8}} placeholder="Buscar producto…" value={productQuery} onChange={e=>setProductQuery(e.target.value)}/>
    <select style={input} value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)}>{filteredProducts.map(product=><option key={product.id} value={product.id}>{product.name}{product.sku?` · ${product.sku}`:''}</option>)}</select>
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginTop:10}}><select style={input} value={ingredientId} onChange={e=>setIngredientId(e.target.value)}><option value="">Seleccionar insumo</option>{inventory.map(item=><option key={item.id} value={item.id}>{item.name} · {qty(item.current_stock)} {item.unit}</option>)}</select><input style={input} type="number" min="0.000001" step="0.001" value={recipeQty} onChange={e=>setRecipeQty(e.target.value)} title="Cantidad por venta"/><input style={input} type="number" min="0" max="100" step="0.1" value={waste} onChange={e=>setWaste(e.target.value)} title="Merma %"/><button type="button" style={button} disabled={working||!inventory.length} onClick={addRecipe}>Agregar</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,margin:'14px 0'}}><div style={{...panel,padding:11}}><small style={muted}>Componentes</small><strong style={{display:'block',fontSize:21}}>{selectedRecipe.length}</strong></div><div style={{...panel,padding:11}}><small style={muted}>Costo estimado</small><strong style={{display:'block',fontSize:21}}>{money.format(estimatedCost)}</strong></div><div style={{...panel,padding:11}}><small style={muted}>Ventas posibles</small><strong style={{display:'block',fontSize:21}}>{selectedRecipe.length?sellable:'—'}</strong></div></div>
    <div>{selectedRecipe.length?selectedRecipe.map(row=>{const item=inventoryById.get(row.inventory_item_id);const effective=Number(row.quantity_per_unit)*(1+Number(row.waste_percent||0)/100);return <div key={row.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'center',padding:'12px 2px',borderBottom:'1px solid #292f38'}}><div><strong>{item?.name||'Insumo'}</strong><small style={{display:'block',...muted}}>{qty(row.quantity_per_unit)} {item?.unit||''} por venta{Number(row.waste_percent)>0?` + ${row.waste_percent}% merma`:''}</small></div><b>{money.format(effective*Number(item?.average_cost||0))}</b><button type="button" style={{...button,padding:'7px 9px'}} disabled={working} onClick={()=>disableRecipe(row)}>Quitar</button></div>}):<div className="bar-empty-state"><span>≡</span><strong>{selectedProduct?'Sin receta configurada':'Seleccioná un producto'}</strong><p>Sin receta, este producto puede venderse pero no descontará insumos automáticamente.</p></div>}</div>
   </section>
  </div>
  <div style={{marginTop:14,padding:13,border:'1px solid #6b512d',background:'#251d13',borderRadius:14,color:'#d3b993'}}><strong style={{color:'#fff'}}>Cómo funciona:</strong> al tocar <b>Enviar a preparación</b>, IDEALO BAR calcula cada receta, registra movimientos <b>SALE_OUT</b> en Inventario y descuenta existencias. Si falta stock, el envío completo se rechaza para no dejar el pedido a medias.</div>
 </div>
}
