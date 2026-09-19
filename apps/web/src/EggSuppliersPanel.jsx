import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const number=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:0}).format(Number(v||0))
const cost=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:3}).format(Number(v||0))
const date=v=>v?new Date(String(v).includes('T')?v:v+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const textError=e=>String(e?.message||e||'No se pudo completar la operación.')

const emptyForm={name:'',contact_name:'',phone:'',email:'',notes:''}

export default function EggSuppliersPanel({companyId,suppliers=[],batches=[],onRefresh,onReceiveSupplier}){
 const [stats,setStats]=useState([])
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState('ALL')
 const [selectedId,setSelectedId]=useState('')
 const [form,setForm]=useState(emptyForm)
 const [edit,setEdit]=useState(null)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const loadStats=useCallback(async()=>{
  if(!companyId)return
  const {data,error}=await supabase
   .from('egg_supplier_purchase_report')
   .select('*')
   .eq('company_id',companyId)
   .order('purchase_cost',{ascending:false})
  if(error)throw error
  setStats(data||[])
 },[companyId])

 useEffect(()=>{loadStats().catch(e=>setError(textError(e)))},[loadStats])
 useEffect(()=>{
  if(!selectedId&&suppliers[0])setSelectedId(suppliers[0].id)
  if(selectedId&&!suppliers.some(s=>s.id===selectedId))setSelectedId(suppliers[0]?.id||'')
 },[suppliers,selectedId])

 const statMap=useMemo(()=>new Map(stats.map(row=>[row.supplier_id,row])),[stats])
 const selected=suppliers.find(row=>row.id===selectedId)||null
 const selectedStat=selected?statMap.get(selected.id):null
 const selectedBatches=useMemo(()=>batches.filter(b=>b.supplier_id===selectedId).sort((a,b)=>String(b.received_at).localeCompare(String(a.received_at))).slice(0,6),[batches,selectedId])

 const totals=useMemo(()=>{
  const active=suppliers.filter(s=>s.active).length
  const eggs=stats.reduce((sum,row)=>sum+Number(row.eggs_received||0),0)
  const purchases=stats.reduce((sum,row)=>sum+Number(row.purchase_cost||0),0)
  const avg=eggs>0?purchases/eggs:0
  return{active,eggs,purchases,avg}
 },[suppliers,stats])

 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return suppliers.filter(row=>{
   if(filter==='ACTIVE'&&!row.active)return false
   if(filter==='INACTIVE'&&row.active)return false
   if(!q)return true
   return [row.name,row.contact_name,row.phone,row.email].some(v=>String(v||'').toLowerCase().includes(q))
  })
 },[suppliers,query,filter])

 const run=async(fn,message)=>{
  setSaving(true);setError('');setNotice('')
  try{
   await fn()
   setNotice(message)
   await Promise.all([loadStats(),Promise.resolve(onRefresh?.())])
  }catch(e){setError(textError(e))}
  finally{setSaving(false)}
 }

 const createSupplier=e=>{
  e.preventDefault()
  return run(async()=>{
   const payload={company_id:companyId,...form,name:form.name.trim(),contact_name:form.contact_name.trim(),phone:form.phone.trim(),email:form.email.trim(),notes:form.notes.trim()}
   const {data,error}=await supabase.from('egg_suppliers').insert(payload).select('id').single()
   if(error)throw error
   setForm(emptyForm)
   if(data?.id)setSelectedId(data.id)
  },'Proveedor agregado correctamente.')
 }

 const openEdit=row=>setEdit({id:row.id,name:row.name||'',contact_name:row.contact_name||'',phone:row.phone||'',email:row.email||'',notes:row.notes||'',active:Boolean(row.active)})

 const saveEdit=e=>{
  e.preventDefault()
  if(!edit)return
  return run(async()=>{
   const {error}=await supabase.from('egg_suppliers').update({
    name:edit.name.trim(),contact_name:edit.contact_name.trim(),phone:edit.phone.trim(),email:edit.email.trim(),
    notes:edit.notes.trim(),active:Boolean(edit.active),updated_at:new Date().toISOString()
   }).eq('id',edit.id).eq('company_id',companyId)
   if(error)throw error
   setEdit(null)
  },'Proveedor actualizado.')
 }

 const toggleActive=row=>run(async()=>{
  const {error}=await supabase.from('egg_suppliers').update({active:!row.active,updated_at:new Date().toISOString()}).eq('id',row.id).eq('company_id',companyId)
  if(error)throw error
 },row.active?'Proveedor desactivado.':'Proveedor activado.')

 return <div className="eggs-suppliers-v2">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <section className="eggs-supplier-hero">
   <div>
    <small>ABASTECIMIENTO</small>
    <h2>Proveedores y granjas</h2>
    <p>Controlá quién te abastece, cuánto comprás, el costo por huevo y el historial de lotes.</p>
   </div>
   <button type="button" onClick={()=>onReceiveSupplier?.(selectedId)} disabled={!selectedId}>Recibir lote</button>
  </section>

  <section className="eggs-supplier-metrics">
   <article><span>Proveedores activos</span><strong>{number(totals.active)}</strong><small>{suppliers.length} registrados</small></article>
   <article><span>Huevos recibidos</span><strong>{number(totals.eggs)}</strong><small>histórico por proveedor</small></article>
   <article><span>Compras acumuladas</span><strong>{money(totals.purchases)}</strong><small>costo registrado en lotes</small></article>
   <article><span>Costo promedio</span><strong>{cost(totals.avg)}</strong><small>por huevo recibido</small></article>
  </section>

  <section className="eggs-supplier-layout">
   <form className="eggs-card eggs-form eggs-supplier-create" onSubmit={createSupplier}>
    <div className="eggs-section-head"><div><small>NUEVO PROVEEDOR</small><h2>Registrar granja o distribuidor</h2><p>Guardá los datos de contacto para compras y recepción de lotes.</p></div></div>
    <label className="eggs-field"><span>Nombre</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej. Granja San José"/></label>
    <label className="eggs-field"><span>Persona de contacto</span><input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})} placeholder="Nombre del encargado"/></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Teléfono</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="0000-0000"/></label>
     <label className="eggs-field"><span>Correo</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="compras@granja.com"/></label>
    </div>
    <label className="eggs-field"><span>Notas</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Condiciones de compra, días de entrega, observaciones..."/></label>
    <button className="eggs-primary" disabled={saving}>Guardar proveedor</button>
   </form>

   <section className="eggs-card eggs-supplier-directory">
    <div className="eggs-section-head"><div><small>DIRECTORIO</small><h2>Proveedores registrados</h2><p>Buscá, filtrá y seleccioná un proveedor para ver su rendimiento.</p></div><span className="eggs-pill">{filtered.length}</span></div>
    <div className="eggs-supplier-toolbar">
     <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por nombre, contacto, teléfono o correo"/>
     <select value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="ALL">Todos</option>
      <option value="ACTIVE">Activos</option>
      <option value="INACTIVE">Inactivos</option>
     </select>
    </div>
    <div className="eggs-supplier-list">
     {filtered.map(row=>{
      const s=statMap.get(row.id)
      const last=batches.filter(b=>b.supplier_id===row.id).sort((a,b)=>String(b.received_at).localeCompare(String(a.received_at)))[0]
      return <button type="button" key={row.id} className={selectedId===row.id?'active':''} onClick={()=>setSelectedId(row.id)}>
       <div className="eggs-supplier-list-main"><strong>{row.name}</strong><small>{row.contact_name||'Sin contacto'}{row.phone?' · '+row.phone:''}</small></div>
       <div className="eggs-supplier-list-stat"><strong>{number(s?.eggs_received||0)}</strong><small>huevos</small></div>
       <div className="eggs-supplier-list-stat"><strong>{cost(s?.avg_cost_per_egg||0)}</strong><small>costo/u.</small></div>
       <div className="eggs-supplier-list-status"><span className={'eggs-pill '+(row.active?'good':'neutral')}>{row.active?'Activo':'Inactivo'}</span><small>{last?'Último '+date(last.received_at):'Sin lotes'}</small></div>
      </button>
     })}
     {!filtered.length&&<div className="eggs-empty">No hay proveedores que coincidan con el filtro.</div>}
    </div>
   </section>
  </section>

  {selected&&<section className="eggs-supplier-detail-grid">
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>FICHA DEL PROVEEDOR</small><h2>{selected.name}</h2><p>{selected.contact_name||'Sin persona de contacto registrada'}</p></div><span className={'eggs-pill '+(selected.active?'good':'neutral')}>{selected.active?'Activo':'Inactivo'}</span></div>
    <div className="eggs-supplier-profile">
     <div><span>Teléfono</span><b>{selected.phone||'—'}</b></div>
     <div><span>Correo</span><b>{selected.email||'—'}</b></div>
     <div><span>Lotes recibidos</span><b>{number(selectedStat?.batches_count||0)}</b></div>
     <div><span>Huevos recibidos</span><b>{number(selectedStat?.eggs_received||0)}</b></div>
     <div><span>Compras</span><b>{money(selectedStat?.purchase_cost||0)}</b></div>
     <div><span>Costo por huevo</span><b>{cost(selectedStat?.avg_cost_per_egg||0)}</b></div>
    </div>
    {selected.notes&&<div className="eggs-supplier-notes"><span>NOTAS</span><p>{selected.notes}</p></div>}
    <div className="eggs-supplier-actions">
     <button type="button" onClick={()=>openEdit(selected)}>Editar proveedor</button>
     <button type="button" onClick={()=>onReceiveSupplier?.(selected.id)}>Recibir nuevo lote</button>
     <button type="button" className={selected.active?'danger':''} disabled={saving} onClick={()=>toggleActive(selected)}>{selected.active?'Desactivar':'Activar'}</button>
    </div>
   </article>

   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Últimos lotes</h2><p>Recepciones recientes de este proveedor.</p></div></div>
    <div className="eggs-supplier-batches">
     {selectedBatches.map(row=><div key={row.id}>
      <span><strong>{row.batch_code}</strong><small>{date(row.received_at)} · {row.status}</small></span>
      <span><b>{number(row.total_eggs)}</b><small>huevos</small></span>
      <span><b>{money(row.total_cost)}</b><small>costo</small></span>
     </div>)}
     {!selectedBatches.length&&<div className="eggs-empty">Este proveedor todavía no tiene lotes registrados.</div>}
    </div>
   </article>
  </section>}

  {edit&&<div className="eggs-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setEdit(null)}>
   <form className="eggs-modal" onSubmit={saveEdit}>
    <div className="eggs-section-head"><div><small>EDITAR PROVEEDOR</small><h2>{edit.name}</h2></div><button type="button" onClick={()=>setEdit(null)}>×</button></div>
    <label className="eggs-field"><span>Nombre</span><input required value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label>
    <label className="eggs-field"><span>Contacto</span><input value={edit.contact_name} onChange={e=>setEdit({...edit,contact_name:e.target.value})}/></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Teléfono</span><input value={edit.phone} onChange={e=>setEdit({...edit,phone:e.target.value})}/></label>
     <label className="eggs-field"><span>Correo</span><input type="email" value={edit.email} onChange={e=>setEdit({...edit,email:e.target.value})}/></label>
    </div>
    <label className="eggs-field"><span>Notas</span><textarea value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></label>
    <label className="eggs-switch-row"><span><b>Proveedor activo</b><small>Si se desactiva deja de utilizarse para nuevas compras.</small></span><input type="checkbox" checked={edit.active} onChange={e=>setEdit({...edit,active:e.target.checked})}/></label>
    <div className="eggs-modal-actions"><button type="button" onClick={()=>setEdit(null)}>Cancelar</button><button className="eggs-primary" disabled={saving}>Guardar cambios</button></div>
   </form>
  </div>}
 </div>
}
