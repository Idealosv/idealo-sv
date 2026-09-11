import {useCallback,useEffect,useMemo,useState} from 'react'

const money=new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'})

export default function SuperSelectosCatalog({company,supabase}){
 const [open,setOpen]=useState(false)
 const [items,setItems]=useState([])
 const [activeIds,setActiveIds]=useState(new Set())
 const [loading,setLoading]=useState(false)
 const [query,setQuery]=useState('')
 const [category,setCategory]=useState('Todas')
 const [selected,setSelected]=useState(null)
 const [salePrice,setSalePrice]=useState('')
 const [working,setWorking]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const companyId=company?.id

 const load=useCallback(async()=>{
  if(!companyId||!supabase||!company?.demo_mode)return
  setLoading(true);setError('')
  const [productsRes,menuRes]=await Promise.all([
   supabase.from('finished_products')
    .select('id,name,category,sku,cost_estimate,internal_notes,tags')
    .eq('company_id',companyId).eq('active',true)
    .contains('tags',['super-selectos']).order('category').order('name').limit(1000),
   supabase.from('bar_menu_items').select('product_id').eq('company_id',companyId).eq('active',true),
  ])
  setLoading(false)
  if(productsRes.error){setError(productsRes.error.message);return}
  if(menuRes.error){setError(menuRes.error.message);return}
  setItems(productsRes.data||[])
  setActiveIds(new Set((menuRes.data||[]).map(row=>row.product_id)))
 },[companyId,supabase,company?.demo_mode])

 useEffect(()=>{if(open)load()},[open,load])

 const categories=useMemo(()=>['Todas',...Array.from(new Set(items.map(row=>row.category||'Otros'))).sort((a,b)=>a.localeCompare(b,'es'))],[items])
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return items.filter(row=>(category==='Todas'||row.category===category)&&(!q||`${row.name} ${row.category||''} ${row.sku||''}`.toLowerCase().includes(q)))
 },[items,query,category])

 const choose=row=>{setSelected(row);setSalePrice('');setError('');setMessage('')}
 const activate=async()=>{
  if(!selected||working)return
  const price=Number(salePrice)
  if(!Number.isFinite(price)||price<=0){setError('Ingresá el precio de venta que tendrá en tu bar.');return}
  setWorking(true);setError('');setMessage('')
  const {data,error:rpcError}=await supabase.rpc('bar_activate_reference_product',{p_product_id:selected.id,p_sale_price:price})
  setWorking(false)
  if(rpcError){setError(rpcError.message);return}
  setMessage(data?.message||'Producto agregado a Carta e Inventario.')
  setActiveIds(current=>new Set([...current,selected.id]))
  setSelected(null);setSalePrice('')
 }

 if(!company?.demo_mode)return null
 return <section className={`selectos-shell ${open?'open':''}`}>
  <button type="button" className="selectos-toggle" onClick={()=>setOpen(value=>!value)}>
   <span><b>🛒 Catálogo Super Selectos</b><small>{items.length?`${items.length} referencias disponibles`:'Cervezas, licores, RTD, vinos y más'}</small></span>
   <strong>{open?'Cerrar':'Abrir catálogo'}</strong>
  </button>
  {open&&<div className="selectos-panel">
   <header className="selectos-head">
    <div><span>REFERENCIA DE COMPRA</span><h3>Productos encontrados en Super Selectos El Salvador</h3><p>El precio mostrado es referencia del supermercado. Para venderlo en IDEALO BAR debes definir tu propio precio.</p></div>
    <div className="selectos-count"><b>{items.length}</b><small>referencias</small></div>
   </header>
   <div className="selectos-filters">
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar Pilsener, Smirnoff, Buchanan's, Don Julio…"/>
    <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(value=><option key={value}>{value}</option>)}</select>
   </div>
   {error&&<div className="selectos-error">{error}</div>}
   {message&&<div className="selectos-success">✓ {message}</div>}
   {loading?<div className="selectos-loading">Cargando catálogo…</div>:<div className="selectos-list">
    {filtered.slice(0,150).map(row=>{
     const active=activeIds.has(row.id),reference=Number(row.cost_estimate||0)
     return <article key={row.id}>
      <div className="selectos-main"><b>{row.name}</b><span>{row.category||'Otros'} · {row.sku}</span></div>
      <div className="selectos-reference"><small>Referencia Selectos</small><strong>{reference>0?money.format(reference):'Sin precio verificado'}</strong></div>
      <button type="button" disabled={active} onClick={()=>choose(row)}>{active?'Ya está en Carta':'Agregar'}</button>
     </article>
    })}
    {!filtered.length&&<div className="selectos-empty">No encontré productos con ese filtro.</div>}
    {filtered.length>150&&<div className="selectos-more">Mostrando 150 de {filtered.length}. Escribí una marca o presentación para afinar la búsqueda.</div>}
   </div>}
   {selected&&<div className="selectos-modal-backdrop" onClick={()=>setSelected(null)}>
    <div className="selectos-modal" onClick={event=>event.stopPropagation()}>
     <span>AGREGAR A CARTA + INVENTARIO</span><h3>{selected.name}</h3>
     <p>Referencia de compra: <b>{Number(selected.cost_estimate||0)>0?money.format(Number(selected.cost_estimate)):'sin precio verificado'}</b>. Este valor no será tu precio de venta.</p>
     <label>Precio de venta en tu bar<input type="number" min="0.01" step="0.01" value={salePrice} onChange={e=>setSalePrice(e.target.value)} autoFocus placeholder="0.00"/></label>
     <small>Al agregarlo se crea también su artículo de inventario con existencia inicial 0. Luego cargás el stock real en Inventario.</small>
     <div className="selectos-modal-actions"><button type="button" onClick={()=>setSelected(null)}>Cancelar</button><button type="button" className="primary" disabled={working} onClick={activate}>{working?'Agregando…':'Agregar producto'}</button></div>
    </div>
   </div>}
  </div>}
 </section>
}
