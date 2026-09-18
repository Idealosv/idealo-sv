import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const num=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:2}).format(Number(v||0))
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

export default function EggPricingPanel({companyId}){
 const [grades,setGrades]=useState([])
 const [customers,setCustomers]=useState([])
 const [inventory,setInventory]=useState([])
 const [rules,setRules]=useState([])
 const [form,setForm]=useState({customer_id:'',grade_id:'',presentation:'Bandeja',eggs_per_unit:'30',min_units:'1',max_units:'',unit_price:'',valid_from:'',valid_until:'',notes:''})
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [g,c,i,r]=await Promise.all([
   supabase.from('egg_grades').select('*').eq('company_id',companyId).eq('active',true).order('sort_order'),
   supabase.from('egg_customers').select('id,name').eq('company_id',companyId).eq('active',true).order('name'),
   supabase.from('egg_inventory_stock').select('*').eq('company_id',companyId),
   supabase.from('egg_price_rules').select('*,egg_grades(name,code),egg_customers(name)').eq('company_id',companyId).order('created_at',{ascending:false})
  ])
  for(const x of [g,c,i,r])if(x.error)throw x.error
  setGrades(g.data||[]);setCustomers(c.data||[]);setInventory(i.data||[]);setRules(r.data||[])
  setForm(current=>({...current,grade_id:current.grade_id||g.data?.[0]?.id||''}))
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const cost=useMemo(()=>{
  const row=inventory.find(x=>x.grade_id===form.grade_id)
  return Number(row?.avg_cost_per_egg||0)*Number(form.eggs_per_unit||0)
 },[inventory,form.grade_id,form.eggs_per_unit])
 const price=Number(form.unit_price||0)
 const profit=price-cost
 const margin=price>0?profit/price*100:0

 const save=e=>{e.preventDefault();setSaving(true);setError('');setNotice('')
  const payload={
   company_id:companyId,customer_id:form.customer_id||null,grade_id:form.grade_id,presentation:form.presentation,
   eggs_per_unit:Number(form.eggs_per_unit),min_units:Number(form.min_units),max_units:form.max_units?Number(form.max_units):null,
   unit_price:Number(form.unit_price),valid_from:form.valid_from||null,valid_until:form.valid_until||null,notes:form.notes
  }
  supabase.from('egg_price_rules').insert(payload).then(async({error})=>{
   if(error){setError(errorText(error));setSaving(false);return}
   setNotice('Regla de precio mayorista guardada.')
   setForm(current=>({...current,min_units:'1',max_units:'',unit_price:'',valid_from:'',valid_until:'',notes:''}))
   await load();setSaving(false)
  })
 }

 const remove=async id=>{
  if(!window.confirm('¿Eliminar esta regla de precio?'))return
  setSaving(true);setError('');setNotice('')
  const {error}=await supabase.from('egg_price_rules').delete().eq('id',id).eq('company_id',companyId)
  if(error)setError(errorText(error));else{setNotice('Regla eliminada.');await load()}
  setSaving(false)
 }

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}
  <section className="eggs-two-column">
   <form className="eggs-card eggs-form" onSubmit={save}>
    <div className="eggs-section-head"><div><small>PRECIOS MAYORISTAS</small><h2>Nueva regla de precio</h2><p>Podés definir precio general, por cliente y por volumen.</p></div></div>
    <label className="eggs-field"><span>Cliente especial</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}><option value="">Precio general</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="eggs-field"><span>Clasificación</span><select required value={form.grade_id} onChange={e=>setForm({...form,grade_id:e.target.value})}>{grades.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Presentación</span><select value={form.presentation} onChange={e=>{const p=e.target.value;setForm({...form,presentation:p,eggs_per_unit:p==='Docena'?'12':p==='Bandeja'?'30':p==='Caja'?'360':'1'})}}><option>Bandeja</option><option>Docena</option><option>Caja</option><option>Unidad</option></select></label>
     <label className="eggs-field"><span>Huevos / presentación</span><input type="number" min="1" required value={form.eggs_per_unit} onChange={e=>setForm({...form,eggs_per_unit:e.target.value})}/></label>
    </div>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Desde cantidad</span><input type="number" min="0.01" step="0.01" required value={form.min_units} onChange={e=>setForm({...form,min_units:e.target.value})}/></label>
     <label className="eggs-field"><span>Hasta cantidad</span><input type="number" min="0.01" step="0.01" value={form.max_units} onChange={e=>setForm({...form,max_units:e.target.value})} placeholder="Sin límite"/></label>
    </div>
    <label className="eggs-field"><span>Precio por presentación</span><input type="number" min="0.01" step="0.01" required value={form.unit_price} onChange={e=>setForm({...form,unit_price:e.target.value})}/></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Válido desde</span><input type="date" value={form.valid_from} onChange={e=>setForm({...form,valid_from:e.target.value})}/></label>
     <label className="eggs-field"><span>Válido hasta</span><input type="date" value={form.valid_until} onChange={e=>setForm({...form,valid_until:e.target.value})}/></label>
    </div>
    <label className="eggs-field"><span>Notas</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    <div className="eggs-profit-preview">
     <div><span>Costo estimado</span><b>{money(cost)}</b></div>
     <div><span>Utilidad</span><b>{money(profit)}</b></div>
     <div><span>Margen</span><b>{num(margin)}%</b></div>
    </div>
    <button className="eggs-primary" disabled={saving}>Guardar precio</button>
   </form>

   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>ESCALAS</small><h2>Precios configurados</h2></div><span className="eggs-pill">{rules.length}</span></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Cliente</th><th>Tamaño</th><th>Presentación</th><th>Volumen</th><th>Precio</th><th></th></tr></thead><tbody>
     {rules.map(r=><tr key={r.id}><td>{r.egg_customers?.name||'General'}</td><td>{r.egg_grades?.name}</td><td>{r.presentation}<small>{r.eggs_per_unit} huevos</small></td><td>{r.min_units}{r.max_units?' – '+r.max_units:' +'}</td><td><b>{money(r.unit_price)}</b></td><td><button className="eggs-mini-danger" type="button" disabled={saving} onClick={()=>remove(r.id)}>Eliminar</button></td></tr>)}
     {!rules.length&&<tr><td colSpan="6"><div className="eggs-empty">Todavía no hay precios mayoristas configurados.</div></td></tr>}
    </tbody></table></div>
   </section>
  </section>
 </div>
}
