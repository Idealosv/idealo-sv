import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const cost=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:3}).format(Number(v||0))
const number=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:0}).format(Number(v||0))
const dateTime=v=>v?new Date(v).toLocaleString('es-SV',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
const textError=e=>String(e?.message||e||'No se pudo cargar el inventario.')

const movementLabel={
 RECEIPT:'Entrada',
 SALE:'Venta',
 RETURN:'Devolución',
 LOSS:'Pérdida',
 ADJUSTMENT:'Ajuste',
 ROUTE_RETURN:'Retorno ruta'
}

export default function EggInventoryPanel({companyId,grades=[]}){
 const [stock,setStock]=useState([])
 const [movements,setMovements]=useState([])
 const [batches,setBatches]=useState([])
 const [orders,setOrders]=useState([])
 const [query,setQuery]=useState('')
 const [stockFilter,setStockFilter]=useState('ALL')
 const [movementFilter,setMovementFilter]=useState('ALL')
 const [selectedGradeId,setSelectedGradeId]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  setLoading(true);setError('')
  try{
   const [s,m,b,o]=await Promise.all([
    supabase.from('egg_inventory_stock').select('*').eq('company_id',companyId).order('stock_eggs',{ascending:false}),
    supabase.from('egg_inventory_movements').select('*').eq('company_id',companyId).order('created_at',{ascending:false}).limit(200),
    supabase.from('egg_batches').select('id,batch_code,received_at,total_eggs,total_cost,supplier_id,egg_suppliers(name)').eq('company_id',companyId).order('received_at',{ascending:false}).limit(100),
    supabase.from('egg_orders').select('id,order_number,order_date,status').eq('company_id',companyId).order('created_at',{ascending:false}).limit(200)
   ])
   for(const r of [s,m,b,o])if(r.error)throw r.error
   setStock(s.data||[])
   setMovements(m.data||[])
   setBatches(b.data||[])
   setOrders(o.data||[])
  }catch(e){setError(textError(e))}
  finally{setLoading(false)}
 },[companyId])

 useEffect(()=>{load()},[load])

 const stockMap=useMemo(()=>new Map(stock.map(row=>[row.grade_id,row])),[stock])
 const gradeMap=useMemo(()=>new Map(grades.map(row=>[row.id,row])),[grades])
 const batchMap=useMemo(()=>new Map(batches.map(row=>[row.id,row])),[batches])
 const orderMap=useMemo(()=>new Map(orders.map(row=>[row.id,row])),[orders])

 const rows=useMemo(()=>grades.map(grade=>{
  const row=stockMap.get(grade.id)
  const eggs=Number(row?.stock_eggs||0)
  const avg=Number(row?.avg_cost_per_egg||0)
  return{
   ...grade,
   stock_eggs:eggs,
   avg_cost_per_egg:avg,
   value:eggs*avg,
   trays:Math.floor(eggs/30),
   loose:eggs%30,
   dozens:Math.floor(eggs/12)
  }
 }),[grades,stockMap])

 const totals=useMemo(()=>{
  const eggs=rows.reduce((s,r)=>s+r.stock_eggs,0)
  const value=rows.reduce((s,r)=>s+r.value,0)
  const trays=Math.floor(eggs/30)
  const avg=eggs?value/eggs:0
  const empty=rows.filter(r=>r.stock_eggs<=0).length
  const available=rows.filter(r=>r.stock_eggs>0).length
  return{eggs,value,trays,avg,empty,available}
 },[rows])

 const filteredRows=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return rows.filter(row=>{
   if(stockFilter==='AVAILABLE'&&row.stock_eggs<=0)return false
   if(stockFilter==='EMPTY'&&row.stock_eggs>0)return false
   if(q&&!String(row.name+' '+row.code).toLowerCase().includes(q))return false
   return true
  })
 },[rows,query,stockFilter])

 const selected=rows.find(r=>r.id===selectedGradeId)||filteredRows[0]||rows[0]||null
 useEffect(()=>{
  if(selected&&!selectedGradeId)setSelectedGradeId(selected.id)
  if(selectedGradeId&&!rows.some(r=>r.id===selectedGradeId))setSelectedGradeId(rows[0]?.id||'')
 },[selected,selectedGradeId,rows])

 const selectedMovements=useMemo(()=>movements.filter(m=>!selected?.id||m.grade_id===selected.id),[movements,selected])
 const recentMovements=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return movements.filter(m=>{
   if(movementFilter!=='ALL'&&m.movement_type!==movementFilter)return false
   if(stockFilter==='GRADE'&&selected?.id&&m.grade_id!==selected.id)return false
   if(!q)return true
   const g=gradeMap.get(m.grade_id)
   const b=batchMap.get(m.batch_id)
   const o=orderMap.get(m.order_id)
   return [g?.name,g?.code,b?.batch_code,o?.order_number,m.notes,m.movement_type].some(v=>String(v||'').toLowerCase().includes(q))
  }).slice(0,80)
 },[movements,movementFilter,stockFilter,selected,query,gradeMap,batchMap,orderMap])

 const receiptOrigins=useMemo(()=>{
  const map=new Map()
  for(const m of movements.filter(x=>x.movement_type==='RECEIPT'&&x.batch_id)){
   const batch=batchMap.get(m.batch_id)
   if(!batch)continue
   const key=m.batch_id
   const current=map.get(key)||{batch,eggs:0,value:0,grades:new Set(),lastAt:m.created_at}
   current.eggs+=Number(m.quantity_eggs||0)
   current.value+=Number(m.quantity_eggs||0)*Number(m.unit_cost||0)
   const g=gradeMap.get(m.grade_id);if(g)current.grades.add(g.name)
   if(String(m.created_at)>String(current.lastAt))current.lastAt=m.created_at
   map.set(key,current)
  }
  return [...map.values()].sort((a,b)=>String(b.lastAt).localeCompare(String(a.lastAt))).slice(0,8)
 },[movements,batchMap,gradeMap])

 const maxStock=Math.max(...rows.map(r=>r.stock_eggs),1)

 if(loading)return <div className="eggs-loading">Cargando inventario…</div>
 if(error)return <div className="eggs-alert error">{error}</div>

 return <div className="eggs-inventory-v2">
  <section className="eggs-inventory-hero">
   <div>
    <small>INVENTARIO EN TIEMPO REAL</small>
    <h2>Existencias, valor y trazabilidad</h2>
    <p>Las entradas nacen de la clasificación y las salidas de ventas, pérdidas, devoluciones y ajustes.</p>
   </div>
   <button type="button" onClick={load}>Actualizar inventario</button>
  </section>

  <section className="eggs-inventory-kpis">
   <article><span>Huevos disponibles</span><strong>{number(totals.eggs)}</strong><small>{number(totals.trays)} bandejas completas de 30</small></article>
   <article><span>Valor del inventario</span><strong>{money(totals.value)}</strong><small>estimado a costo promedio</small></article>
   <article><span>Costo promedio</span><strong>{cost(totals.avg)}</strong><small>por huevo disponible</small></article>
   <article><span>Clasificaciones con stock</span><strong>{number(totals.available)}</strong><small>de {number(rows.length)} configuradas</small></article>
   <article><span>Sin existencia</span><strong>{number(totals.empty)}</strong><small>clasificaciones agotadas</small></article>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head">
    <div><small>EXISTENCIA POR CLASIFICACIÓN</small><h2>Stock disponible</h2><p>Huevos, bandejas, costo promedio y valor actual por tamaño.</p></div>
   </div>
   <div className="eggs-inventory-toolbar">
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar clasificación, lote, pedido o movimiento"/>
    <select value={stockFilter} onChange={e=>setStockFilter(e.target.value)}>
     <option value="ALL">Todas las clasificaciones</option>
     <option value="AVAILABLE">Con existencia</option>
     <option value="EMPTY">Sin existencia</option>
     <option value="GRADE">Movimientos de la seleccionada</option>
    </select>
   </div>

   <div className="eggs-inventory-stock-grid">
    {filteredRows.map(row=>{
     const pct=Math.round(row.stock_eggs/maxStock*100)
     return <button type="button" key={row.id} className={selected?.id===row.id?'active':''} onClick={()=>setSelectedGradeId(row.id)}>
      <header><div><small>{row.code}</small><h3>{row.name}</h3></div><span className={'eggs-pill '+(row.stock_eggs>0?'good':'danger')}>{row.stock_eggs>0?'Disponible':'Sin stock'}</span></header>
      <div className="eggs-inventory-big-number"><strong>{number(row.stock_eggs)}</strong><span>huevos</span></div>
      <div className="eggs-inventory-stockbar"><span style={{width:pct+'%'}}></span></div>
      <div className="eggs-inventory-equivalences">
       <div><b>{number(row.trays)}</b><small>bandejas de 30</small></div>
       <div><b>{number(row.loose)}</b><small>huevos sueltos</small></div>
       <div><b>{number(row.dozens)}</b><small>docenas completas</small></div>
      </div>
      <div className="eggs-inventory-money">
       <span><small>Costo promedio</small><b>{row.avg_cost_per_egg?cost(row.avg_cost_per_egg):'—'}</b></span>
       <span><small>Valor stock</small><b>{money(row.value)}</b></span>
      </div>
      <footer><span>Peso configurado</span><b>{row.min_weight_g||'—'}–{row.max_weight_g||'+'} g</b></footer>
     </button>
    })}
    {!filteredRows.length&&<div className="eggs-empty">No hay clasificaciones que coincidan con el filtro.</div>}
   </div>
  </section>

  {selected&&<section className="eggs-inventory-detail-grid">
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>DETALLE SELECCIONADO</small><h2>{selected.name}</h2><p>{selected.code} · {selected.min_weight_g||'—'}–{selected.max_weight_g||'+'} g</p></div><span className={'eggs-pill '+(selected.stock_eggs>0?'good':'danger')}>{selected.stock_eggs>0?'Con existencia':'Agotado'}</span></div>
    <div className="eggs-inventory-detail-metrics">
     <div><span>Huevos</span><b>{number(selected.stock_eggs)}</b></div>
     <div><span>Bandejas</span><b>{number(selected.trays)}</b></div>
     <div><span>Sueltos</span><b>{number(selected.loose)}</b></div>
     <div><span>Costo/u.</span><b>{selected.avg_cost_per_egg?cost(selected.avg_cost_per_egg):'—'}</b></div>
     <div><span>Valor</span><b>{money(selected.value)}</b></div>
    </div>
    <div className="eggs-inventory-flow">
     <div><span>Entradas históricas</span><b>{number(selectedMovements.filter(m=>m.quantity_eggs>0).reduce((s,m)=>s+Number(m.quantity_eggs||0),0))}</b></div>
     <div><span>Salidas históricas</span><b>{number(Math.abs(selectedMovements.filter(m=>m.quantity_eggs<0).reduce((s,m)=>s+Number(m.quantity_eggs||0),0)))}</b></div>
     <div><span>Movimientos</span><b>{number(selectedMovements.length)}</b></div>
    </div>
   </article>

   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>ORIGEN DEL INVENTARIO</small><h2>Lotes de abastecimiento</h2><p>Recepciones que han generado entradas al inventario.</p></div></div>
    <div className="eggs-inventory-origins">
     {receiptOrigins.map(item=><div key={item.batch.id}>
      <span><b>{item.batch.batch_code}</b><small>{item.batch.egg_suppliers?.name||'Sin proveedor'} · {dateTime(item.batch.received_at)}</small></span>
      <span><b>{number(item.eggs)}</b><small>huevos ingresados</small></span>
      <span><b>{money(item.value)}</b><small>costo de entrada</small></span>
     </div>)}
     {!receiptOrigins.length&&<div className="eggs-empty">Todavía no hay entradas de lotes registradas.</div>}
    </div>
    <div className="eggs-note">Las ventas actuales consumen inventario por clasificación. Esta vista muestra el origen histórico de las entradas, no asigna una venta a un lote específico.</div>
   </article>
  </section>}

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>KARDEX</small><h2>Movimientos de inventario</h2><p>Entradas y salidas recientes con su referencia operativa.</p></div><span className="eggs-pill">{recentMovements.length}</span></div>
   <div className="eggs-inventory-movement-toolbar">
    <select value={movementFilter} onChange={e=>setMovementFilter(e.target.value)}>
     <option value="ALL">Todos los movimientos</option>
     {[...new Set(movements.map(m=>m.movement_type))].map(type=><option key={type} value={type}>{movementLabel[type]||type}</option>)}
    </select>
    <button type="button" onClick={()=>{setMovementFilter('ALL');setQuery('');setStockFilter('ALL')}}>Limpiar filtros</button>
   </div>
   <div className="eggs-table-wrap">
    <table className="eggs-inventory-movements-table">
     <thead><tr><th>Fecha</th><th>Tipo</th><th>Clasificación</th><th>Cantidad</th><th>Costo/u.</th><th>Valor</th><th>Referencia</th><th>Notas</th></tr></thead>
     <tbody>
      {recentMovements.map(m=>{
       const g=gradeMap.get(m.grade_id)
       const b=batchMap.get(m.batch_id)
       const o=orderMap.get(m.order_id)
       return <tr key={m.id}>
        <td>{dateTime(m.created_at)}</td>
        <td><span className={'eggs-pill '+(Number(m.quantity_eggs)>=0?'good':'warn')}>{movementLabel[m.movement_type]||m.movement_type}</span></td>
        <td><b>{g?.name||'—'}</b><small>{g?.code||''}</small></td>
        <td className={Number(m.quantity_eggs)>=0?'positive':'negative'}><b>{Number(m.quantity_eggs)>=0?'+':''}{number(m.quantity_eggs)}</b></td>
        <td>{cost(m.unit_cost)}</td>
        <td>{money(Math.abs(Number(m.quantity_eggs||0)*Number(m.unit_cost||0)))}</td>
        <td>{b?.batch_code||o?.order_number||'—'}</td>
        <td>{m.notes||'—'}</td>
       </tr>
      })}
      {!recentMovements.length&&<tr><td colSpan="8"><div className="eggs-empty">No hay movimientos que coincidan con los filtros.</div></td></tr>}
     </tbody>
    </table>
   </div>
  </section>
 </div>
}
