import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const today=()=>new Date().toISOString().slice(0,10)
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const cost=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:3}).format(Number(v||0))
const number=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:0}).format(Number(v||0))
const date=v=>v?new Date(String(v).includes('T')?v:v+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const textError=e=>String(e?.message||e||'No se pudo completar la operación.')

const emptyReceive={supplier_id:'',received_at:today(),total_eggs:'',total_cost:'',source_reference:'',notes:''}
const emptyClassify={batch_id:'',grade_id:'',quantity_eggs:'',damaged_eggs:'0',avg_weight_g:''}

export default function EggLotsPanel({
 companyId,
 suppliers=[],
 grades=[],
 batches=[],
 classifications=[],
 onRefresh,
 preferredSupplierId='',
 onPreferredSupplierUsed,
 onGoMachine
}){
 const [receive,setReceive]=useState(emptyReceive)
 const [classify,setClassify]=useState(emptyClassify)
 const [selectedId,setSelectedId]=useState('')
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState('ALL')
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 useEffect(()=>{
  if(preferredSupplierId){
   setReceive(current=>({...current,supplier_id:preferredSupplierId}))
   onPreferredSupplierUsed?.()
  }else if(!receive.supplier_id){
   const first=suppliers.find(s=>s.active!==false)
   if(first)setReceive(current=>({...current,supplier_id:first.id}))
  }
 },[preferredSupplierId,suppliers])

 useEffect(()=>{
  if(!selectedId&&batches[0])setSelectedId(batches[0].id)
  if(selectedId&&!batches.some(b=>b.id===selectedId))setSelectedId(batches[0]?.id||'')
 },[batches,selectedId])

 const classificationMap=useMemo(()=>{
  const map=new Map()
  for(const row of classifications){
   const list=map.get(row.batch_id)||[]
   list.push(row)
   map.set(row.batch_id,list)
  }
  return map
 },[classifications])

 const progressOf=batch=>{
  const rows=classificationMap.get(batch.id)||[]
  const good=rows.reduce((s,x)=>s+Number(x.quantity_eggs||0),0)
  const damaged=rows.reduce((s,x)=>s+Number(x.damaged_eggs||0),0)
  const used=good+damaged
  const remaining=Math.max(0,Number(batch.total_eggs||0)-used)
  const pct=Number(batch.total_eggs||0)>0?Math.min(100,Math.round(used/Number(batch.total_eggs)*100)):0
  return{good,damaged,used,remaining,pct,rows}
 }

 const totals=useMemo(()=>{
  const open=batches.filter(b=>b.status==='OPEN').length
  const received=batches.reduce((s,b)=>s+Number(b.total_eggs||0),0)
  const purchase=batches.reduce((s,b)=>s+Number(b.total_cost||0),0)
  const damaged=classifications.reduce((s,x)=>s+Number(x.damaged_eggs||0),0)
  const pending=batches.reduce((s,b)=>s+progressOf(b).remaining,0)
  return{open,received,purchase,damaged,pending,avg:received?purchase/received:0}
 },[batches,classifications,classificationMap])

 const selected=batches.find(b=>b.id===selectedId)||null
 const selectedProgress=selected?progressOf(selected):null
 const usedGrades=new Set((selectedProgress?.rows||[]).map(x=>x.grade_id))
 const availableGrades=grades.filter(g=>!usedGrades.has(g.id))
 const selectedGrade=grades.find(g=>g.id===classify.grade_id)||null

 useEffect(()=>{
  if(selectedId&&classify.batch_id!==selectedId){
   const rows=classificationMap.get(selectedId)||[]
   const used=new Set(rows.map(x=>x.grade_id))
   const nextGrade=grades.find(g=>!used.has(g.id))
   setClassify(current=>({...current,batch_id:selectedId,grade_id:nextGrade?.id||'',quantity_eggs:'',damaged_eggs:'0',avg_weight_g:''}))
  }
 },[selectedId,grades,classificationMap])

 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return batches.filter(batch=>{
   if(filter==='OPEN'&&batch.status!=='OPEN')return false
   if(filter==='CLASSIFIED'&&batch.status!=='CLASSIFIED')return false
   if(q){
    const values=[batch.batch_code,batch.source_reference,batch.egg_suppliers?.name]
    if(!values.some(v=>String(v||'').toLowerCase().includes(q)))return false
   }
   return true
  })
 },[batches,query,filter])

 const run=async(fn,message)=>{
  setSaving(true);setError('');setNotice('')
  try{
   const result=await fn()
   await Promise.resolve(onRefresh?.())
   setNotice(message)
   return result
  }catch(e){
   setError(textError(e))
   return null
  }finally{setSaving(false)}
 }

 const receiveBatch=async e=>{
  e.preventDefault()
  const newId=await run(async()=>{
   const {data,error}=await supabase.rpc('egg_receive_batch',{
    p_company_id:companyId,
    p_supplier_id:receive.supplier_id||null,
    p_total_eggs:Number(receive.total_eggs),
    p_total_cost:Number(receive.total_cost||0),
    p_received_at:receive.received_at,
    p_source_reference:receive.source_reference.trim(),
    p_notes:receive.notes.trim()
   })
   if(error)throw error
   setReceive(current=>({...emptyReceive,supplier_id:current.supplier_id,received_at:today()}))
   return data
  },'Lote recibido correctamente. Ya podés clasificarlo.')
  if(newId){
   setSelectedId(newId)
   setClassify({...emptyClassify,batch_id:newId})
  }
 }

 const classifyBatch=e=>{
  e.preventDefault()
  if(!selected) return
  const good=Number(classify.quantity_eggs||0)
  const damaged=Number(classify.damaged_eggs||0)
  const total=good+damaged
  if(total<=0){setError('Ingresá una cantidad a clasificar.');return}
  if(total>selectedProgress.remaining){setError('La cantidad supera los huevos pendientes de este lote.');return}
  return run(async()=>{
   const {error}=await supabase.rpc('egg_classify_batch',{
    p_batch_id:selected.id,
    p_grade_id:classify.grade_id,
    p_quantity_eggs:good,
    p_damaged_eggs:damaged,
    p_avg_weight_g:classify.avg_weight_g?Number(classify.avg_weight_g):null
   })
   if(error)throw error
   const nextUsed=new Set([...(selectedProgress.rows||[]).map(x=>x.grade_id),classify.grade_id])
   const nextGrade=grades.find(g=>!nextUsed.has(g.id))
   setClassify(current=>({...current,grade_id:nextGrade?.id||'',quantity_eggs:'',damaged_eggs:'0',avg_weight_g:''}))
  },'Clasificación registrada e inventario actualizado.')
 }

 const liveCost=Number(receive.total_eggs||0)>0?Number(receive.total_cost||0)/Number(receive.total_eggs):0
 const liveReceiveTotal=Number(receive.total_eggs||0)
 const liveClassified=Number(classify.quantity_eggs||0)+Number(classify.damaged_eggs||0)
 const afterRemaining=selectedProgress?Math.max(0,selectedProgress.remaining-liveClassified):0

 return <div className="eggs-lots-v2">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <section className="eggs-lots-hero">
   <div>
    <small>RECEPCIÓN Y TRAZABILIDAD</small>
    <h2>Lotes de huevos</h2>
    <p>Recibí producto, controlá costo por huevo, clasificá por tamaño y detectá pendientes o rechazos.</p>
   </div>
   <div className="eggs-lots-hero-actions">
    <button type="button" onClick={()=>onGoMachine?.()}>Ir a clasificadora</button>
   </div>
  </section>

  <section className="eggs-lots-metrics">
   <article><span>Lotes abiertos</span><strong>{number(totals.open)}</strong><small>pendientes de completar</small></article>
   <article><span>Huevos recibidos</span><strong>{number(totals.received)}</strong><small>histórico registrado</small></article>
   <article><span>Por clasificar</span><strong>{number(totals.pending)}</strong><small>huevos pendientes</small></article>
   <article><span>Dañados / rechazo</span><strong>{number(totals.damaged)}</strong><small>registrados en clasificación</small></article>
   <article><span>Costo promedio</span><strong>{cost(totals.avg)}</strong><small>por huevo recibido</small></article>
  </section>

  <section className="eggs-lots-workflow">
   <form className="eggs-card eggs-form" onSubmit={receiveBatch}>
    <div className="eggs-section-head"><div><small>PASO 1 · RECEPCIÓN</small><h2>Nuevo lote</h2><p>Registrá la compra antes de clasificarla.</p></div></div>
    <label className="eggs-field"><span>Proveedor</span><select required value={receive.supplier_id} onChange={e=>setReceive({...receive,supplier_id:e.target.value})}><option value="">Seleccionar proveedor</option>{suppliers.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Fecha</span><input type="date" required value={receive.received_at} onChange={e=>setReceive({...receive,received_at:e.target.value})}/></label>
     <label className="eggs-field"><span>Huevos recibidos</span><input type="number" min="1" required value={receive.total_eggs} onChange={e=>setReceive({...receive,total_eggs:e.target.value})} placeholder="12000"/></label>
    </div>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Costo total</span><input type="number" min="0" step="0.01" required value={receive.total_cost} onChange={e=>setReceive({...receive,total_cost:e.target.value})} placeholder="1200.00"/></label>
     <label className="eggs-field"><span>Referencia</span><input value={receive.source_reference} onChange={e=>setReceive({...receive,source_reference:e.target.value})} placeholder="Factura / entrega"/></label>
    </div>
    {(liveReceiveTotal>0||Number(receive.total_cost||0)>0)&&<div className="eggs-lot-live-cost">
     <span>Costo estimado por huevo</span><strong>{cost(liveCost)}</strong><small>{number(liveReceiveTotal)} huevos · {money(receive.total_cost||0)}</small>
    </div>}
    <label className="eggs-field"><span>Notas</span><textarea value={receive.notes} onChange={e=>setReceive({...receive,notes:e.target.value})} placeholder="Condición del producto, observaciones del proveedor..."/></label>
    <button className="eggs-primary" disabled={saving||!suppliers.length}>Recibir lote</button>
   </form>

   <form className="eggs-card eggs-form" onSubmit={classifyBatch}>
    <div className="eggs-section-head"><div><small>PASO 2 · CLASIFICACIÓN</small><h2>Registrar tamaño y peso</h2><p>Solo podés clasificar lo que todavía queda pendiente en el lote.</p></div></div>
    <label className="eggs-field"><span>Lote</span><select required value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Seleccionar lote</option>{batches.filter(b=>b.status==='OPEN').map(b=>{const p=progressOf(b);return <option key={b.id} value={b.id}>{b.batch_code} · {number(p.remaining)} pendientes</option>})}</select></label>

    {selected&&<div className="eggs-lot-selected">
     <div><span>Recibidos</span><b>{number(selected.total_eggs)}</b></div>
     <div><span>Clasificados</span><b>{number(selectedProgress.used)}</b></div>
     <div><span>Pendientes</span><b>{number(selectedProgress.remaining)}</b></div>
     <div><span>Avance</span><b>{selectedProgress.pct}%</b></div>
     <div className="eggs-lot-progress"><span style={{width:selectedProgress.pct+'%'}}></span></div>
    </div>}

    <label className="eggs-field"><span>Clasificación</span><select required value={classify.grade_id} onChange={e=>setClassify({...classify,grade_id:e.target.value})}><option value="">Seleccionar</option>{availableGrades.map(g=><option key={g.id} value={g.id}>{g.name} · {g.min_weight_g||'0'}–{g.max_weight_g||'+'} g</option>)}</select></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Huevos buenos</span><input type="number" min="0" max={selectedProgress?.remaining||undefined} required value={classify.quantity_eggs} onChange={e=>setClassify({...classify,quantity_eggs:e.target.value})}/></label>
     <label className="eggs-field"><span>Dañados / rechazo</span><input type="number" min="0" max={selectedProgress?.remaining||undefined} required value={classify.damaged_eggs} onChange={e=>setClassify({...classify,damaged_eggs:e.target.value})}/></label>
    </div>
    <label className="eggs-field"><span>Peso promedio (g)</span><input type="number" min="0" step="0.01" value={classify.avg_weight_g} onChange={e=>setClassify({...classify,avg_weight_g:e.target.value})}/><small>{selectedGrade?'Rango configurado: '+(selectedGrade.min_weight_g||'0')+'–'+(selectedGrade.max_weight_g||'+')+' g':'Opcional para captura manual o lectura de máquina.'}</small></label>
    {selected&&<div className="eggs-lot-classify-preview">
     <div><span>Registrarás</span><b>{number(liveClassified)}</b></div>
     <div><span>Quedarán pendientes</span><b>{number(afterRemaining)}</b></div>
     <div><span>Costo/huevo del lote</span><b>{cost(Number(selected.total_cost||0)/Math.max(1,Number(selected.total_eggs||0)))}</b></div>
    </div>}
    <button className="eggs-primary" disabled={saving||!selected||!classify.grade_id||selectedProgress?.remaining<=0}>Guardar clasificación</button>
   </form>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>TRAZABILIDAD</small><h2>Lotes recibidos</h2><p>Seleccioná un lote para revisar su detalle completo.</p></div><span className="eggs-pill">{filtered.length}</span></div>
   <div className="eggs-lots-toolbar">
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por lote, proveedor o referencia"/>
    <select value={filter} onChange={e=>setFilter(e.target.value)}>
     <option value="ALL">Todos los lotes</option>
     <option value="OPEN">Abiertos</option>
     <option value="CLASSIFIED">Clasificados</option>
    </select>
   </div>
   <div className="eggs-lots-table-wrap">
    <table className="eggs-lots-table">
     <thead><tr><th>Lote</th><th>Proveedor</th><th>Fecha</th><th>Recibidos</th><th>Avance</th><th>Dañados</th><th>Costo/u.</th><th>Estado</th></tr></thead>
     <tbody>
      {filtered.map(batch=>{const p=progressOf(batch);return <tr key={batch.id} className={selectedId===batch.id?'selected':''} onClick={()=>setSelectedId(batch.id)}>
       <td><b>{batch.batch_code}</b><small>{batch.source_reference||'Sin referencia'}</small></td>
       <td>{batch.egg_suppliers?.name||'—'}</td>
       <td>{date(batch.received_at)}</td>
       <td>{number(batch.total_eggs)}</td>
       <td><div className="eggs-lot-table-progress"><span><i style={{width:p.pct+'%'}}></i></span><small>{p.pct}% · {number(p.remaining)} pendientes</small></div></td>
       <td>{number(p.damaged)}</td>
       <td>{cost(Number(batch.total_cost||0)/Math.max(1,Number(batch.total_eggs||0)))}</td>
       <td><span className={'eggs-pill '+(batch.status==='CLASSIFIED'?'good':'warn')}>{batch.status==='CLASSIFIED'?'Clasificado':'Abierto'}</span></td>
      </tr>})}
      {!filtered.length&&<tr><td colSpan="8"><div className="eggs-empty">No hay lotes que coincidan con el filtro.</div></td></tr>}
     </tbody>
    </table>
   </div>
  </section>

  {selected&&<section className="eggs-lot-detail-grid">
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>FICHA DEL LOTE</small><h2>{selected.batch_code}</h2><p>{selected.egg_suppliers?.name||'Sin proveedor'} · recibido {date(selected.received_at)}</p></div><span className={'eggs-pill '+(selected.status==='CLASSIFIED'?'good':'warn')}>{selected.status==='CLASSIFIED'?'Clasificado':'Abierto'}</span></div>
    <div className="eggs-lot-profile">
     <div><span>Recibidos</span><b>{number(selected.total_eggs)}</b></div>
     <div><span>Buenos</span><b>{number(selectedProgress.good)}</b></div>
     <div><span>Dañados</span><b>{number(selectedProgress.damaged)}</b></div>
     <div><span>Pendientes</span><b>{number(selectedProgress.remaining)}</b></div>
     <div><span>Costo total</span><b>{money(selected.total_cost)}</b></div>
     <div><span>Costo/huevo</span><b>{cost(Number(selected.total_cost||0)/Math.max(1,Number(selected.total_eggs||0)))}</b></div>
    </div>
    <div className="eggs-lot-big-progress">
     <div><span>Progreso de clasificación</span><b>{selectedProgress.pct}%</b></div>
     <div><span style={{width:selectedProgress.pct+'%'}}></span></div>
    </div>
    {selected.notes&&<div className="eggs-supplier-notes"><span>NOTAS</span><p>{selected.notes}</p></div>}
   </article>

   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>DISTRIBUCIÓN</small><h2>Clasificación registrada</h2><p>Tamaños, peso promedio y rechazo del lote.</p></div></div>
    <div className="eggs-lot-grades">
     {(selectedProgress.rows||[]).map(row=><div key={row.id}>
      <span><b>{row.egg_grades?.name||'Clasificación'}</b><small>{row.avg_weight_g?Number(row.avg_weight_g).toFixed(2)+' g promedio':'Sin peso promedio'}</small></span>
      <span><b>{number(row.quantity_eggs)}</b><small>buenos</small></span>
      <span><b>{number(row.damaged_eggs)}</b><small>rechazo</small></span>
     </div>)}
     {!selectedProgress.rows?.length&&<div className="eggs-empty">Este lote todavía no tiene clasificación registrada.</div>}
    </div>
   </article>
  </section>}
 </div>
}
