import {useCallback,useEffect,useMemo,useState} from 'react'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})
const CATEGORIES=[
 {name:'Cervezas',station:'bar',emoji:'🍺'},
 {name:'Smirnoff / RTD',station:'bar',emoji:'🍹'},
 {name:'Hard Seltzer',station:'bar',emoji:'🍹'},
 {name:'Vodka',station:'bar',emoji:'🥃'},
 {name:'Whisky',station:'bar',emoji:'🥃'},
 {name:'Ron',station:'bar',emoji:'🥃'},
 {name:'Tequila / Mezcal',station:'bar',emoji:'🥃'},
 {name:'Gin y Licores',station:'bar',emoji:'🍸'},
 {name:'Aguardiente',station:'bar',emoji:'🥃'},
 {name:'Vinos',station:'bar',emoji:'🍷'},
 {name:'Espumantes',station:'bar',emoji:'🥂'},
 {name:'Sangrías',station:'bar',emoji:'🍷'},
 {name:'Energizantes',station:'bar',emoji:'⚡'},
 {name:'Bebidas',station:'bar',emoji:'🥤'},
 {name:'Hamburguesas',station:'kitchen',emoji:'🍔'},
 {name:'Alitas',station:'kitchen',emoji:'🍗'},
 {name:'Papas',station:'kitchen',emoji:'🍟'},
 {name:'Hot Dogs',station:'kitchen',emoji:'🌭'},
 {name:'Nachos',station:'kitchen',emoji:'🧀'},
 {name:'Tacos',station:'kitchen',emoji:'🌮'},
 {name:'Combos',station:'kitchen',emoji:'🍽️'},
 {name:'Otros',station:'kitchen',emoji:'🍴'},
]
const profile=name=>CATEGORIES.find(row=>row.name===name)||CATEGORIES[CATEGORIES.length-1]
const hasTag=(row,tag)=>Array.isArray(row?.tags)&&row.tags.includes(tag)

export default function IdealoBarCatalog({company,supabase}){
 const companyId=company?.id
 const [menu,setMenu]=useState([])
 const [products,setProducts]=useState([])
 const [inventory,setInventory]=useState([])
 const [tab,setTab]=useState('carta')
 const [query,setQuery]=useState('')
 const [existingQuery,setExistingQuery]=useState('')
 const [catalogCategory,setCatalogCategory]=useState('Todas')
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [draft,setDraft]=useState({name:'',category:'Cervezas',station:'bar',price:'',emoji:'🍺'})
 const [importDraft,setImportDraft]=useState({productId:'',category:'Cervezas',station:'bar',price:'',emoji:'🍺'})
 const [bundle,setBundle]=useState({name:'',type:'BALDE',inventoryId:'',units:'6',price:'',iceId:'',iceQuantity:'0'})

 const load=useCallback(async()=>{
  if(!companyId||!supabase)return
  setLoading(true);setError('')
  try{
   const [menuRes,productsRes,inventoryRes]=await Promise.all([
    supabase.from('bar_menu_items').select('*').eq('company_id',companyId).eq('active',true).order('sort_order').order('category'),
    supabase.from('finished_products').select('id,name,sku,sale_price,cost_estimate,category,short_description,internal_notes,active,tags').eq('company_id',companyId).eq('active',true).order('name').limit(1000),
    supabase.from('inventory_items').select('id,name,sku,unit,current_stock,average_cost,subcategory,notes,active').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('name').limit(1000),
   ])
   const failure=[menuRes,productsRes,inventoryRes].find(result=>result.error)?.error
   if(failure)throw failure
   const allProducts=productsRes.data||[]
   const map=new Map(allProducts.map(row=>[row.id,row]))
   setMenu((menuRes.data||[]).map(row=>({...row,product:map.get(row.product_id)||null})).filter(row=>row.product))
   setProducts(allProducts)
   setInventory((inventoryRes.data||[]).filter(row=>String(row.subcategory||'').toUpperCase()==='BAR'||String(row.notes||'').toUpperCase().includes('IDEALO BAR')))
  }catch(err){setError(String(err?.message||err||'No se pudo cargar la carta.'))}
  finally{setLoading(false)}
 },[companyId,supabase])
 useEffect(()=>{load()},[load])

 const run=useCallback(async(task,message)=>{
  setWorking(true);setError('');setSuccess('')
  try{await task();if(message)setSuccess(message)}catch(err){setError(String(err?.message||err||'No se pudo completar la operación.'))}finally{setWorking(false)}
 },[])

 const menuIds=useMemo(()=>new Set(menu.map(row=>row.product_id)),[menu])
 const filteredMenu=useMemo(()=>menu.filter(row=>{
  const text=`${row.display_name||''} ${row.product?.name||''} ${row.category||''}`.toLowerCase()
  return !query.trim()||text.includes(query.trim().toLowerCase())
 }),[menu,query])
 const productCategories=useMemo(()=>['Todas',...Array.from(new Set(products.filter(row=>!menuIds.has(row.id)).map(row=>row.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'))],[products,menuIds])
 const existingMatches=useMemo(()=>{
  const q=existingQuery.trim().toLowerCase()
  return products.filter(row=>{
   if(menuIds.has(row.id))return false
   if(catalogCategory!=='Todas'&&row.category!==catalogCategory)return false
   const text=`${row.name||''} ${row.sku||''} ${row.category||''} ${row.short_description||''}`.toLowerCase()
   return !q||text.includes(q)
  }).slice(0,60)
 },[products,menuIds,existingQuery,catalogCategory])

 const changeDraftCategory=category=>{const meta=profile(category);setDraft(current=>({...current,category,station:meta.station,emoji:meta.emoji}))}
 const changeImportCategory=category=>{const meta=profile(category);setImportDraft(current=>({...current,category,station:meta.station,emoji:meta.emoji}))}
 const selectExisting=product=>{
  const category=CATEGORIES.some(row=>row.name===product.category)?product.category:'Otros'
  const meta=profile(category)
  setImportDraft({productId:product.id,category,station:meta.station,price:product.sale_price>0?String(product.sale_price):'',emoji:meta.emoji})
 }

 const createProduct=()=>run(async()=>{
  const name=draft.name.trim(),price=Number(draft.price)
  if(!name)throw new Error('Escribí el nombre del producto.')
  if(!Number.isFinite(price)||price<0)throw new Error('Ingresá un precio válido.')
  const {data:product,error:productError}=await supabase.from('finished_products').insert({
   company_id:companyId,name,category:draft.category,subcategory:'BAR',unit:'unidad',sale_price:price,active:true,
   requires_production:false,affects_inventory:false,tags:['bar'],short_description:`Producto de IDEALO BAR · ${draft.category}`
  }).select('id,name,sale_price').single()
  if(productError)throw productError
  const {error:menuError}=await supabase.from('bar_menu_items').upsert({company_id:companyId,product_id:product.id,display_name:name,category:draft.category,station:draft.station,emoji:draft.emoji,active:true},{onConflict:'company_id,product_id'})
  if(menuError)throw menuError
  setDraft({name:'',category:'Cervezas',station:'bar',price:'',emoji:'🍺'});await load()
 },'Producto creado y agregado a la carta del bar.')

 const importExisting=()=>run(async()=>{
  const product=products.find(row=>row.id===importDraft.productId)
  if(!product)throw new Error('Seleccioná un producto del catálogo.')
  const override=importDraft.price===''?null:Number(importDraft.price)
  if(override===null||!Number.isFinite(override)||override<=0)throw new Error('Definí el precio de venta del bar.')

  if(company?.demo_mode&&hasTag(product,'super-selectos')){
   const {error:rpcError}=await supabase.rpc('bar_activate_reference_product',{p_product_id:product.id,p_sale_price:override})
   if(rpcError)throw rpcError
  }else{
   const {error:menuError}=await supabase.from('bar_menu_items').upsert({
    company_id:companyId,product_id:product.id,display_name:product.name,category:importDraft.category,station:importDraft.station,emoji:importDraft.emoji,sale_price_override:override,active:true
   },{onConflict:'company_id,product_id'})
   if(menuError)throw menuError
  }
  setExistingQuery('');setImportDraft({productId:'',category:'Cervezas',station:'bar',price:'',emoji:'🍺'});await load()
 },'Producto agregado a la Carta. Si aplica, también quedó conectado a Inventario.')

 const updateMenuItem=(row,patch)=>run(async()=>{
  const {error:updateError}=await supabase.from('bar_menu_items').update(patch).eq('id',row.id).eq('company_id',companyId)
  if(updateError)throw updateError
  await load()
 },'Carta actualizada.')

 const removeMenuItem=row=>run(async()=>{
  const {error:updateError}=await supabase.from('bar_menu_items').update({active:false}).eq('id',row.id).eq('company_id',companyId)
  if(updateError)throw updateError
  await load()
 },'Producto retirado de la carta. El producto permanece disponible en el catálogo interno.')

 const createBundle=()=>run(async()=>{
  if(!bundle.name.trim()||!bundle.inventoryId)throw new Error('Indicá nombre y cerveza/insumo principal.')
  const units=Number(bundle.units),price=Number(bundle.price),ice=Number(bundle.iceQuantity||0)
  if(!(units>0)||!Number.isFinite(price)||price<0)throw new Error('Revisá unidades y precio de venta.')
  const {error:rpcError}=await supabase.rpc('bar_create_bundle',{p_company_id:companyId,p_name:bundle.name.trim(),p_offer_type:bundle.type,p_primary_inventory_item_id:bundle.inventoryId,p_units:units,p_sale_price:price,p_ice_inventory_item_id:bundle.iceId||null,p_ice_quantity:ice})
  if(rpcError)throw rpcError
  setBundle({name:'',type:'BALDE',inventoryId:'',units:'6',price:'',iceId:'',iceQuantity:'0'});await load()
 },'Oferta creada y conectada a su receta de inventario.')

 if(loading)return <div className="bar-loading"><span>IDEALO BAR</span><strong>Organizando la carta…</strong></div>
 return <section className="bar-catalog-shell">
  <header className="bar-module-head">
   <div><span>Productos y precios del bar</span><h2>Carta y productos</h2><p>Administrá aquí todo el catálogo. Solo los productos activados aparecen al tomar pedidos.</p></div>
   <div className="bar-module-stat"><b>{menu.length}</b><span>productos activos</span></div>
  </header>
  {error&&<div className="bar-alert"><span>!</span><p>{error}</p><button type="button" onClick={()=>setError('')}>×</button></div>}
  {success&&<div className="bar-catalog-success">✓ {success}<button type="button" onClick={()=>setSuccess('')}>×</button></div>}
  <nav className="bar-subnav">
   <button className={tab==='carta'?'active':''} onClick={()=>setTab('carta')}>🍽️ Carta activa</button>
   <button className={tab==='catalogo'?'active':''} onClick={()=>setTab('catalogo')}>▦ Catálogo de productos</button>
   <button className={tab==='nuevo'?'active':''} onClick={()=>setTab('nuevo')}>＋ Nuevo producto</button>
   <button className={tab==='ofertas'?'active':''} onClick={()=>setTab('ofertas')}>🪣 Baldes e Hielerazos</button>
  </nav>

  {tab==='carta'&&<div className="bar-catalog-panel">
   <div className="bar-panel-title"><div><h3>Carta activa</h3><p>Estos son los productos que ve el personal al tomar pedidos.</p></div><input className="bar-catalog-search" placeholder="Buscar en la carta…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   {filteredMenu.length?<div className="bar-catalog-list">{filteredMenu.map(row=>{
    const price=Number(row.sale_price_override??row.product?.sale_price??0)
    return <article key={row.id}>
     <div className="bar-catalog-icon">{row.emoji||profile(row.category).emoji}</div>
     <div className="bar-catalog-info"><b>{row.display_name||row.product?.name}</b><span>{row.category} · {row.station==='bar'?'Barra':'Cocina'}</span></div>
     <div className="bar-catalog-price">{money.format(price)}</div>
     <select value={row.category} onChange={e=>{const meta=profile(e.target.value);updateMenuItem(row,{category:e.target.value,station:meta.station,emoji:meta.emoji})}}>{CATEGORIES.map(cat=><option key={cat.name}>{cat.name}</option>)}</select>
     <button className="danger" disabled={working} onClick={()=>removeMenuItem(row)}>Retirar</button>
    </article>
   })}</div>:<div className="bar-catalog-empty"><span>🍽️</span><h3>La carta está vacía</h3><p>Abrí Catálogo de productos y activá lo que realmente venderá el bar.</p><button onClick={()=>setTab('catalogo')}>Abrir catálogo</button></div>}
  </div>}

  {tab==='catalogo'&&<div className="bar-catalog-panel">
   <div className="bar-panel-title"><div><h3>Catálogo de productos</h3><p>Buscá bebidas, cervezas, licores, vinos y productos de cocina. Elegí únicamente los que quieras vender.</p></div><div className="bar-module-stat"><b>{products.length-menuIds.size}</b><span>disponibles</span></div></div>
   <div className="bar-form-grid compact">
    <label className="wide">Buscar<input value={existingQuery} onChange={e=>setExistingQuery(e.target.value)} placeholder="Pilsener, Smirnoff, Buchanan's, Don Julio, Corona…"/></label>
    <label>Categoría<select value={catalogCategory} onChange={e=>setCatalogCategory(e.target.value)}>{productCategories.map(cat=><option key={cat}>{cat}</option>)}</select></label>
   </div>
   <div className="bar-existing-results">{existingMatches.map(row=>{
    const selected=importDraft.productId===row.id
    return <button key={row.id} className={selected?'selected':''} onClick={()=>selectExisting(row)}>
     <b>{profile(row.category).emoji} {row.name}</b>
     <span>{row.category||'Otros'}{row.sku?` · ${row.sku}`:''}{Number(row.cost_estimate||0)>0?` · Costo ref. ${money.format(Number(row.cost_estimate))}`:''}</span>
    </button>
   })}</div>
   {!existingMatches.length&&<div className="bar-catalog-note">No hay productos con ese filtro.</div>}
   {importDraft.productId&&<div className="bar-form-grid compact">
    <label>Categoría<select value={importDraft.category} onChange={e=>changeImportCategory(e.target.value)}>{CATEGORIES.map(cat=><option key={cat.name}>{cat.name}</option>)}</select></label>
    <label>Área<select value={importDraft.station} onChange={e=>setImportDraft(v=>({...v,station:e.target.value}))}><option value="bar">Barra</option><option value="kitchen">Cocina</option></select></label>
    <label>Precio de venta<input type="number" min="0.01" step="0.01" value={importDraft.price} onChange={e=>setImportDraft(v=>({...v,price:e.target.value}))} placeholder="0.00"/></label>
    <div className="bar-form-actions"><button className="primary" disabled={working} onClick={importExisting}>Agregar a Carta</button></div>
   </div>}
  </div>}

  {tab==='nuevo'&&<div className="bar-catalog-panel narrow">
   <div className="bar-panel-title"><div><h3>Nuevo producto</h3><p>Creá aquí un producto que todavía no exista en el catálogo.</p></div></div>
   <div className="bar-form-grid">
    <label className="wide">Nombre<input value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))} placeholder="Ej. Cóctel de la casa / Hamburguesa especial"/></label>
    <label>Categoría<select value={draft.category} onChange={e=>changeDraftCategory(e.target.value)}>{CATEGORIES.map(cat=><option key={cat.name}>{cat.name}</option>)}</select></label>
    <label>Área<select value={draft.station} onChange={e=>setDraft(v=>({...v,station:e.target.value}))}><option value="bar">Barra</option><option value="kitchen">Cocina</option></select></label>
    <label>Precio de venta<input type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDraft(v=>({...v,price:e.target.value}))} placeholder="0.00"/></label>
    <label>Icono<input value={draft.emoji} maxLength={4} onChange={e=>setDraft(v=>({...v,emoji:e.target.value}))}/></label>
   </div>
   <div className="bar-form-actions"><button className="primary" disabled={working} onClick={createProduct}>Crear y agregar a la carta</button></div>
  </div>}

  {tab==='ofertas'&&<div className="bar-catalog-panel narrow">
   <div className="bar-panel-title"><div><h3>Baldes e Hielerazos</h3><p>Al venderse descuentan automáticamente las unidades configuradas de cerveza y, si aplica, hielo.</p></div></div>
   {!inventory.length&&<div className="bar-catalog-note">Primero cargá la cerveza y el hielo en Inventario.</div>}
   <div className="bar-form-grid">
    <label>Tipo<select value={bundle.type} onChange={e=>setBundle(v=>({...v,type:e.target.value}))}><option value="BALDE">Balde</option><option value="HIELERAZO">Hielerazo</option></select></label>
    <label className="wide">Nombre<input value={bundle.name} onChange={e=>setBundle(v=>({...v,name:e.target.value}))} placeholder="Ej. Balde Pilsener 6 unidades"/></label>
    <label>Producto base<select value={bundle.inventoryId} onChange={e=>setBundle(v=>({...v,inventoryId:e.target.value}))}><option value="">Seleccionar…</option>{inventory.map(item=><option key={item.id} value={item.id}>{item.name} · stock {Number(item.current_stock||0)}</option>)}</select></label>
    <label>Unidades<input type="number" min="0.001" step="0.001" value={bundle.units} onChange={e=>setBundle(v=>({...v,units:e.target.value}))}/></label>
    <label>Precio de venta<input type="number" min="0" step="0.01" value={bundle.price} onChange={e=>setBundle(v=>({...v,price:e.target.value}))}/></label>
    <label>Hielo opcional<select value={bundle.iceId} onChange={e=>setBundle(v=>({...v,iceId:e.target.value}))}><option value="">Sin hielo</option>{inventory.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Cantidad de hielo<input type="number" min="0" step="0.001" value={bundle.iceQuantity} onChange={e=>setBundle(v=>({...v,iceQuantity:e.target.value}))}/></label>
   </div>
   <div className="bar-form-actions"><button className="primary" disabled={working||!inventory.length} onClick={createBundle}>Crear oferta</button></div>
  </div>}
 </section>
}
