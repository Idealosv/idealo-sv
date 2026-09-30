import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const normalized=value=>String(value||'').trim()
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosBeneficiariesPanel({company,role,investors,beneficiaries,investorMap,saving,act}){
 const canManage=['owner','admin'].includes(String(role||'').toLowerCase())
 const activeInvestors=useMemo(()=>investors.filter(x=>x.status==='ACTIVE'),[investors])
 const empty={investor_id:'',full_name:'',dui:'',birth_date:'',relationship:'',phone:'',alternate_phone:'',email:'',address:'',percentage:'',notes:''}
 const [form,setForm]=useState(empty)
 const [editingId,setEditingId]=useState('')
 const [search,setSearch]=useState('')
 const [statusFilter,setStatusFilter]=useState('ACTIVE')
 const [investorFilter,setInvestorFilter]=useState('ALL')
 const [deactivate,setDeactivate]=useState(null)

 useEffect(()=>{
  if(!form.investor_id&&activeInvestors[0])setForm(current=>({...current,investor_id:activeInvestors[0].id}))
 },[activeInvestors,form.investor_id])

 const activeRows=beneficiaries.filter(x=>x.active!==false)
 const totalAssignedFor=investorId=>activeRows.filter(x=>x.investor_id===investorId).reduce((sum,x)=>sum+Number(x.percentage||0),0)
 const selectedAssigned=Math.max(0,totalAssignedFor(form.investor_id)-(editingId?Number(beneficiaries.find(x=>x.id===editingId)?.percentage||0):0))
 const remaining=Math.max(0,100-selectedAssigned)

 const summary=useMemo(()=>({
  active:activeRows.length,
  inactive:beneficiaries.filter(x=>x.active===false).length,
  investorsWithBeneficiaries:new Set(activeRows.map(x=>x.investor_id)).size,
  incomplete:investors.filter(inv=>totalAssignedFor(inv.id)<100).length,
 }),[beneficiaries,investors])

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return beneficiaries.filter(row=>{
   if(statusFilter==='ACTIVE'&&row.active===false)return false
   if(statusFilter==='INACTIVE'&&row.active!==false)return false
   if(investorFilter!=='ALL'&&row.investor_id!==investorFilter)return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   return `${row.beneficiary_code||''} ${row.full_name||''} ${row.dui||''} ${row.relationship||''} ${row.phone||''} ${row.email||''} ${fullName(investor)}`.toLowerCase().includes(term)
  })
 },[beneficiaries,investorMap,search,statusFilter,investorFilter])

 const reset=()=>{
  setEditingId('')
  setForm({...empty,investor_id:activeInvestors[0]?.id||''})
 }

 const editRow=row=>{
  if(!canManage||row.active===false)return
  setEditingId(row.id)
  setForm({
   investor_id:row.investor_id,
   full_name:row.full_name||'',
   dui:row.dui||'',
   birth_date:row.birth_date||'',
   relationship:row.relationship||'',
   phone:row.phone||'',
   alternate_phone:row.alternate_phone||'',
   email:row.email||'',
   address:row.address||'',
   percentage:String(row.percentage??''),
   notes:row.notes||'',
  })
  window.setTimeout(()=>document.querySelector('.prst-beneficiary-form')?.scrollIntoView({behavior:'smooth',block:'start'}),20)
 }

 const submit=e=>{
  e.preventDefault()
  if(!canManage)return
  act(async()=>{
   const pct=Number(form.percentage)
   if(!Number.isFinite(pct)||pct<=0||pct>100)throw new Error('Ingresá un porcentaje válido entre 0.01 y 100.')
   if(selectedAssigned+pct>100)throw new Error('El total de beneficiarios activos no puede superar 100%.')
   const {error}=await supabase.rpc('inv_save_beneficiary',{
    p_beneficiary_id:editingId||null,
    p_company_id:company.id,
    p_investor_id:form.investor_id,
    p_full_name:normalized(form.full_name),
    p_dui:normalized(form.dui),
    p_birth_date:form.birth_date||null,
    p_relationship:normalized(form.relationship),
    p_phone:normalized(form.phone),
    p_alternate_phone:normalized(form.alternate_phone),
    p_email:normalized(form.email).toLowerCase(),
    p_address:normalized(form.address),
    p_percentage:pct,
    p_notes:normalized(form.notes),
   })
   if(error)throw error
   reset()
  },editingId?'Beneficiario actualizado correctamente.':'Beneficiario registrado correctamente.')
 }

 const changeActive=(row,active,reason='')=>{
  if(!canManage)return
  act(async()=>{
   const {error}=await supabase.rpc('inv_set_beneficiary_active',{p_beneficiary_id:row.id,p_active:active,p_reason:reason})
   if(error)throw error
  },active?'Beneficiario reactivado.':'Beneficiario inactivado sin eliminar su historial.')
 }

 const submitDeactivate=e=>{
  e.preventDefault()
  if(!deactivate)return
  const current=deactivate
  setDeactivate(null)
  changeActive(current.row,false,normalized(current.reason))
 }

 return <section className="prst-beneficiary-module">
  <section className="prst-investor-summary prst-beneficiary-summary">
   <article><span>Beneficiarios activos</span><strong>{summary.active}</strong><small>designaciones vigentes</small></article>
   <article><span>Inversionistas con beneficiarios</span><strong>{summary.investorsWithBeneficiaries}</strong><small>expedientes vinculados</small></article>
   <article><span>Asignación menor a 100%</span><strong>{summary.incomplete}</strong><small>solo indicador, no obligación automática</small></article>
   <article><span>Inactivos</span><strong>{summary.inactive}</strong><small>histórico conservado</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-beneficiary-form" onSubmit={submit}>
    <div className="prst-card-head">
     <div><small>{editingId?'EDITAR BENEFICIARIO':'NUEVO BENEFICIARIO'}</small><h2>{editingId?'Actualizar beneficiario':'Registrar beneficiario'}</h2><p>La designación se vincula al inversionista y conserva historial de cambios.</p></div>
     {editingId&&<button type="button" className="prst-mini-button" onClick={reset}>Cancelar edición</button>}
    </div>

    {!canManage&&<div className="prst-note">Tu rol es de consulta. Solo propietario o administrador puede modificar beneficiarios.</div>}

    <Field label="Inversionista *"><select value={form.investor_id} onChange={e=>setForm({...form,investor_id:e.target.value})} required disabled={!canManage||Boolean(editingId)}><option value="">Seleccionar</option>{activeInvestors.map(x=><option key={x.id} value={x.id}>{fullName(x)} · {x.investor_code}</option>)}</select></Field>

    {form.investor_id&&<div className="prst-beneficiary-allocation">
     <span><b>Porcentaje ya asignado</b><small>{selectedAssigned.toFixed(2)}%</small></span>
     <span><b>Disponible</b><small>{remaining.toFixed(2)}%</small></span>
    </div>}

    <div className="prst-form-grid">
     <Field label="Nombre completo *"><input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required disabled={!canManage}/></Field>
     <Field label="DUI"><input value={form.dui} onChange={e=>setForm({...form,dui:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Fecha de nacimiento"><input type="date" value={form.birth_date} onChange={e=>setForm({...form,birth_date:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Parentesco / relación"><input value={form.relationship} onChange={e=>setForm({...form,relationship:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Teléfono"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Teléfono alterno"><input value={form.alternate_phone} onChange={e=>setForm({...form,alternate_phone:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Correo"><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Porcentaje asignado *"><input type="number" min="0.01" max={remaining+(editingId?Number(beneficiaries.find(x=>x.id===editingId)?.percentage||0):0)} step="0.01" value={form.percentage} onChange={e=>setForm({...form,percentage:e.target.value})} required disabled={!canManage}/></Field>
     <Field label="Dirección" className="span-2"><textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})} disabled={!canManage}/></Field>
    </div>
    <Field label="Observaciones internas"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} disabled={!canManage}/></Field>

    <div className="prst-note"><strong>Control:</strong> el sistema impide superar 100% entre beneficiarios activos de un mismo inversionista, pero no obliga a completar 100%.</div>
    <button className="prst-primary" disabled={saving||!canManage||!activeInvestors.length}>{saving?'Guardando…':editingId?'Guardar cambios':'Guardar beneficiario'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>DIRECTORIO</small><h2>Beneficiarios</h2><p>Consulta, edición e historial sin eliminación física.</p></div></div>
    <div className="prst-directory-tools prst-beneficiary-tools">
     <input className="prst-search" placeholder="Buscar código, nombre, DUI, teléfono o inversionista" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select value={investorFilter} onChange={e=>setInvestorFilter(e.target.value)}><option value="ALL">Todos los inversionistas</option>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)}</option>)}</select>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option><option value="ALL">Todos</option></select>
     <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
    </div>

    {!filtered.length?<Empty title="Sin beneficiarios para mostrar"/>:<div className="prst-table-wrap"><table className="prst-beneficiary-table">
     <thead><tr><th>Beneficiario</th><th>Inversionista</th><th>Contacto</th><th>Relación</th><th>Porcentaje</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>{filtered.map(row=>{
      const investor=investorMap.get(row.investor_id)
      return <tr key={row.id}>
       <td><b>{row.full_name}</b><small>{row.beneficiary_code||'Código pendiente'} · DUI {row.dui||'pendiente'}</small></td>
       <td><b>{fullName(investor)}</b><small>{investor?.investor_code||'—'}</small></td>
       <td><b>{row.phone||row.alternate_phone||'Sin teléfono'}</b><small>{row.email||'Sin correo'}</small></td>
       <td>{row.relationship||'—'}</td>
       <td><b>{Number(row.percentage||0).toFixed(2)}%</b></td>
       <td><span className={`prst-status ${row.active===false?'inactive':'active'}`}>{row.active===false?'Inactivo':'Activo'}</span>{row.active===false&&<small>desde {date(row.deactivated_at)}</small>}</td>
       <td><div className="prst-row-actions">{row.active!==false&&canManage&&<><button type="button" onClick={()=>editRow(row)}>Editar</button><button type="button" className="danger" onClick={()=>setDeactivate({row,reason:''})}>Inactivar</button></>}{row.active===false&&canManage&&<button type="button" className="approve" onClick={()=>changeActive(row,true)}>Reactivar</button>}</div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </article>
  </section>

  {deactivate&&<div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setDeactivate(null)}>
   <form className="prst-decision-modal" onSubmit={submitDeactivate}>
    <header><div><small>INACTIVAR BENEFICIARIO</small><h2>{deactivate.row.full_name}</h2><p>{deactivate.row.beneficiary_code}</p></div><button type="button" onClick={()=>setDeactivate(null)} disabled={saving}>×</button></header>
    <div className="prst-note"><strong>No se eliminará.</strong> El registro permanecerá disponible en el historial del inversionista.</div>
    <Field label="Motivo / nota"><textarea value={deactivate.reason} onChange={e=>setDeactivate({...deactivate,reason:e.target.value})} placeholder="Ej. actualización de designación solicitada por el inversionista."/></Field>
    <div className="prst-modal-actions"><button type="button" onClick={()=>setDeactivate(null)}>Cancelar</button><button type="submit" className="danger" disabled={saving}>Confirmar inactivación</button></div>
   </form>
  </div>}
 </section>
}
