import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import PrestaditosDuiOcr from './PrestaditosDuiOcr.jsx'
import { canPrestaditos } from './prestaditos-permissions.js'

const EMPTY_FORM={
 first_names:'',last_names:'',birth_date:'',dui:'',nit:'',marital_status:'',profession:'',
 phone:'',whatsapp:'',email:'',address:'',department:'',district:'',
 emergency_contact_name:'',emergency_contact_phone:'',bank_name:'',bank_account_last4:'',
 notes:'',status:'ACTIVE',
}

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const age=value=>{
 if(!value)return null
 const birth=new Date(`${value}T12:00:00`),now=new Date()
 let years=now.getFullYear()-birth.getFullYear()
 const m=now.getMonth()-birth.getMonth()
 if(m<0||(m===0&&now.getDate()<birth.getDate()))years--
 return years>=0?years:null
}
const normalized=value=>String(value||'').trim()
const normalizePhone=value=>normalized(value).replace(/\s+/g,' ')
const normalizeDui=value=>normalized(value).replace(/\s+/g,'')
const statusLabel=value=>({ACTIVE:'Activo',INACTIVE:'Inactivo',BLOCKED:'Bloqueado'}[value]||value||'—')

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosInvestorsPanel({company,role,investors,investments,beneficiaries,payments,query,setQuery,saving,act}){
 const [form,setForm]=useState(EMPTY_FORM)
 const [editingId,setEditingId]=useState('')
 const [selectedId,setSelectedId]=useState('')
 const [statusFilter,setStatusFilter]=useState('ALL')
 const [docsFilter,setDocsFilter]=useState('ALL')
 const [face,setFace]=useState(null)
 const [duiFront,setDuiFront]=useState(null)
 const [duiBack,setDuiBack]=useState(null)
 const [ocrApplied,setOcrApplied]=useState(false)
 const canEdit=canPrestaditos(role,'EDIT_INVESTOR')

 const selected=investors.find(x=>x.id===selectedId)||null
 const filtered=useMemo(()=>{
  const term=query.trim().toLowerCase()
  return investors.filter(x=>{
   if(statusFilter!=='ALL'&&x.status!==statusFilter)return false
   const docs=[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length
   if(docsFilter==='COMPLETE'&&docs<3)return false
   if(docsFilter==='PENDING'&&docs===3)return false
   if(!term)return true
   return `${x.first_names} ${x.last_names} ${x.dui} ${x.nit} ${x.investor_code} ${x.phone} ${x.whatsapp} ${x.email}`.toLowerCase().includes(term)
  })
 },[investors,query,statusFilter,docsFilter])

 const reset=()=>{
  setForm(EMPTY_FORM);setEditingId('');setFace(null);setDuiFront(null);setDuiBack(null);setOcrApplied(false)
 }

 const update=e=>setForm(current=>({...current,[e.target.name]:e.target.value}))

 const upload=async(investorId,file,label)=>{
  if(!file)return ''
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')
  const path=`${company.id}/${investorId}/${label}-${Date.now()}.${ext||'jpg'}`
  const {error}=await supabase.storage.from('investor-documents').upload(path,file,{upsert:false,contentType:file.type||undefined})
  if(error)throw error
  return path
 }

 const openDocument=async(path)=>{
  if(!path)return
  const {data,error}=await supabase.storage.from('investor-documents').createSignedUrl(path,120)
  if(error)throw error
  window.open(data.signedUrl,'_blank','noopener,noreferrer')
 }

 const startEdit=investor=>{
  setEditingId(investor.id)
  setSelectedId(investor.id)
  setForm(Object.fromEntries(Object.keys(EMPTY_FORM).map(key=>[key,investor[key]??EMPTY_FORM[key]])))
  setFace(null);setDuiFront(null);setDuiBack(null);setOcrApplied(false)
  window.setTimeout(()=>document.querySelector('.prst-investor-form')?.scrollIntoView({behavior:'smooth',block:'start'}),30)
 }

 const submit=e=>{
  e.preventDefault()
  if(!canEdit)return
  act(async()=>{
   const payload={
    first_names:normalized(form.first_names),
    last_names:normalized(form.last_names),
    birth_date:form.birth_date||null,
    dui:normalizeDui(form.dui),
    nit:normalized(form.nit),
    marital_status:normalized(form.marital_status),
    profession:normalized(form.profession),
    phone:normalizePhone(form.phone),
    whatsapp:normalizePhone(form.whatsapp),
    email:normalized(form.email).toLowerCase(),
    address:normalized(form.address),
    department:normalized(form.department),
    district:normalized(form.district),
    emergency_contact_name:normalized(form.emergency_contact_name),
    emergency_contact_phone:normalizePhone(form.emergency_contact_phone),
    bank_name:normalized(form.bank_name),
    bank_account_last4:normalized(form.bank_account_last4),
    notes:normalized(form.notes),
    status:form.status||'ACTIVE',
   }
   if(!payload.first_names||!payload.last_names||!payload.dui)throw new Error('Nombres, apellidos y DUI son obligatorios.')
   if(payload.bank_account_last4&&!/^\d{4}$/.test(payload.bank_account_last4))throw new Error('Ingresá únicamente los últimos 4 dígitos de la cuenta.')
   const duplicate=investors.find(x=>normalizeDui(x.dui)===payload.dui&&x.id!==editingId)
   if(duplicate)throw new Error(`El DUI ya pertenece a ${fullName(duplicate)}.`)

   let investorId=editingId
   let current=investors.find(x=>x.id===editingId)||null

   if(editingId){
    const {error}=await supabase.from('inv_investors').update(payload).eq('id',editingId).eq('company_id',company.id)
    if(error)throw error
   }else{
    const code=`INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
    const {data,error}=await supabase.from('inv_investors').insert({...payload,company_id:company.id,investor_code:code}).select('*').single()
    if(error)throw error
    investorId=data.id
    current=data
   }

   const [facePath,frontPath,backPath]=await Promise.all([
    upload(investorId,face,'rostro'),
    upload(investorId,duiFront,'dui-frente'),
    upload(investorId,duiBack,'dui-reverso'),
   ])

   const documentPatch={}
   if(facePath)documentPatch.face_photo_path=facePath
   if(frontPath)documentPatch.dui_front_path=frontPath
   if(backPath)documentPatch.dui_back_path=backPath
   if(Object.keys(documentPatch).length){
    const {error}=await supabase.from('inv_investors').update(documentPatch).eq('id',investorId).eq('company_id',company.id)
    if(error)throw error
   }

   await supabase.from('inv_audit_log').insert({
    company_id:company.id,
    investor_id:investorId,
    action:editingId?'INVESTOR_UPDATED':'INVESTOR_CREATED',
    detail:{
     investor_code:current?.investor_code||undefined,
     changed_documents:Object.keys(documentPatch),
     status:payload.status,
    },
   })
   reset()
  },editingId?'Expediente actualizado correctamente.':'Inversionista registrado correctamente.')
 }

 const changeStatus=(investor,status)=>{
  if(!canEdit)return
  const text=status==='BLOCKED'?'bloquear':status==='INACTIVE'?'marcar como inactivo':'reactivar'
  if(!window.confirm(`¿Confirmás ${text} el expediente de ${fullName(investor)}?`))return
  act(async()=>{
   const {error}=await supabase.from('inv_investors').update({status}).eq('id',investor.id).eq('company_id',company.id)
   if(error)throw error
   await supabase.from('inv_audit_log').insert({company_id:company.id,investor_id:investor.id,action:'INVESTOR_STATUS_CHANGED',detail:{from:investor.status,to:status}})
   if(selectedId===investor.id)setSelectedId('')
  },`Estado de ${fullName(investor)} actualizado.`)
 }

 const totals=useMemo(()=>({
  active:investors.filter(x=>x.status==='ACTIVE').length,
  complete:investors.filter(x=>[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length===3).length,
  pending:investors.filter(x=>[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length<3).length,
 }),[investors])

 return <section className="prst-investor-module">
  <section className="prst-investor-summary">
   <article><span>Total</span><strong>{investors.length}</strong><small>expedientes</small></article>
   <article><span>Activos</span><strong>{totals.active}</strong><small>habilitados</small></article>
   <article><span>Documentación completa</span><strong>{totals.complete}</strong><small>rostro + DUI</small></article>
   <article><span>Documentos pendientes</span><strong>{totals.pending}</strong><small>requieren seguimiento</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-investor-form" onSubmit={submit}>
    <div className="prst-card-head">
     <div><small>{editingId?'EDITAR EXPEDIENTE':'NUEVO EXPEDIENTE'}</small><h2>{editingId?'Actualizar inversionista':'Registrar inversionista'}</h2><p>Datos personales, contacto, referencias y documentación privada.</p></div>
     {editingId&&<button className="prst-mini-button" type="button" onClick={reset}>Cancelar edición</button>}
    </div>

    {!canEdit&&<div className="prst-note">Tu rol es de consulta. Podés revisar expedientes, pero no crear, editar ni cambiar estados.</div>}

    <div className="prst-section-title">Identificación</div>
    <div className="prst-form-grid">
     <Field label="Nombres *"><input name="first_names" value={form.first_names} onChange={update} required/></Field>
     <Field label="Apellidos *"><input name="last_names" value={form.last_names} onChange={update} required/></Field>
     <Field label="Fecha de nacimiento"><input name="birth_date" type="date" max={new Date().toISOString().slice(0,10)} value={form.birth_date||''} onChange={update}/></Field>
     <Field label="DUI *"><input name="dui" value={form.dui} onChange={update} required placeholder="00000000-0" inputMode="numeric"/></Field>
     <Field label="NIT"><input name="nit" value={form.nit} onChange={update}/></Field>
     <Field label="Estado del expediente"><select name="status" value={form.status} onChange={update}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option><option value="BLOCKED">Bloqueado</option></select></Field>
     <Field label="Estado civil"><input name="marital_status" value={form.marital_status} onChange={update}/></Field>
     <Field label="Profesión u oficio"><input name="profession" value={form.profession} onChange={update}/></Field>
    </div>

    <div className="prst-section-title">Contacto y domicilio</div>
    <div className="prst-form-grid">
     <Field label="Teléfono"><input name="phone" value={form.phone} onChange={update} inputMode="tel"/></Field>
     <Field label="WhatsApp"><input name="whatsapp" value={form.whatsapp} onChange={update} inputMode="tel"/></Field>
     <Field label="Correo" className="span-2"><input type="email" name="email" value={form.email} onChange={update}/></Field>
     <Field label="Departamento"><input name="department" value={form.department} onChange={update}/></Field>
     <Field label="Distrito"><input name="district" value={form.district} onChange={update}/></Field>
     <Field label="Dirección" className="span-2"><textarea name="address" value={form.address} onChange={update}/></Field>
    </div>

    <div className="prst-section-title">Referencia y pago</div>
    <div className="prst-form-grid">
     <Field label="Contacto de emergencia"><input name="emergency_contact_name" value={form.emergency_contact_name} onChange={update}/></Field>
     <Field label="Teléfono de emergencia"><input name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={update} inputMode="tel"/></Field>
     <Field label="Banco"><input name="bank_name" value={form.bank_name} onChange={update}/></Field>
     <Field label="Últimos 4 de cuenta" hint="Por seguridad no se guarda el número completo."><input name="bank_account_last4" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" value={form.bank_account_last4} onChange={update}/></Field>
    </div>

    <div className="prst-section-title">Documentos privados</div>
    <div className="prst-capture-grid">
     <Field label={editingId?'Reemplazar foto del rostro':'Foto del rostro'}><input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={e=>setFace(e.target.files?.[0]||null)}/><small>{face?.name||'Cámara frontal o galería'}</small></Field>
     <Field label={editingId?'Reemplazar DUI frente':'DUI frente'}><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>{setDuiFront(e.target.files?.[0]||null);setOcrApplied(false)}}/><small>{duiFront?.name||'Cámara trasera o galería'}</small></Field>
     <Field label={editingId?'Reemplazar DUI reverso':'DUI reverso'}><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setDuiBack(e.target.files?.[0]||null)}/><small>{duiBack?.name||'Cámara trasera o galería'}</small></Field>
    </div>
    <PrestaditosDuiOcr file={duiFront} onApply={({dui,birth_date})=>{setForm(current=>({...current,dui:dui||current.dui,birth_date:birth_date||current.birth_date}));setOcrApplied(true)}}/>

    <Field label="Observaciones internas"><textarea name="notes" value={form.notes} onChange={update}/></Field>
    <button className="prst-primary" disabled={saving||!canEdit}>{saving?'Guardando…':editingId?'Guardar cambios':'Guardar inversionista'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head">
     <div><small>DIRECTORIO</small><h2>Inversionistas</h2><p>Buscá, revisá y administrá cada expediente.</p></div>
    </div>
    <div className="prst-directory-tools">
     <input className="prst-search" placeholder="Buscar nombre, DUI, NIT, código, teléfono o correo" value={query} onChange={e=>setQuery(e.target.value)}/>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">Todos los estados</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option><option value="BLOCKED">Bloqueados</option></select>
     <select value={docsFilter} onChange={e=>setDocsFilter(e.target.value)}><option value="ALL">Todos los documentos</option><option value="COMPLETE">Documentos completos</option><option value="PENDING">Documentos pendientes</option></select>
     <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
    </div>

    {!filtered.length?<Empty title="No hay coincidencias">Cambiá los filtros o registrá un nuevo inversionista.</Empty>:<div className="prst-table-wrap"><table className="prst-investor-table">
     <thead><tr><th>Inversionista</th><th>Identificación</th><th>Contacto</th><th>Documentos</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>{filtered.map(x=>{
      const docs=[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length
      return <tr key={x.id}>
       <td><b>{fullName(x)}</b><small>{x.investor_code}{age(x.birth_date)!==null?` · ${age(x.birth_date)} años`:''}</small></td>
       <td><b>DUI {x.dui}</b><small>{x.nit?`NIT ${x.nit}`:'Sin NIT adicional'}</small></td>
       <td><b>{x.phone||x.whatsapp||'Sin teléfono'}</b><small>{x.email||'Sin correo'}</small></td>
       <td><span className={`prst-doc-badge ${docs===3?'complete':'pending'}`}>{docs}/3</span></td>
       <td><span className={`prst-status ${String(x.status||'').toLowerCase()}`}>{statusLabel(x.status)}</span></td>
       <td><div className="prst-row-actions">
        <button type="button" onClick={()=>setSelectedId(x.id)}>Ver</button>
        {canEdit&&<button type="button" onClick={()=>startEdit(x)}>Editar</button>}
        {canEdit&&(x.status==='ACTIVE'?<button type="button" onClick={()=>changeStatus(x,'INACTIVE')}>Inactivar</button>:<button type="button" onClick={()=>changeStatus(x,'ACTIVE')}>Reactivar</button>)}
        {canEdit&&x.status!=='BLOCKED'&&<button type="button" className="danger" onClick={()=>changeStatus(x,'BLOCKED')}>Bloquear</button>}
       </div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </article>
  </section>

  {selected&&<InvestorDetail
    investor={selected}
    company={company}
    investments={investments.filter(x=>x.investor_id===selected.id)}
    beneficiaries={beneficiaries.filter(x=>x.investor_id===selected.id)}
    payments={payments.filter(x=>x.investor_id===selected.id)}
    onClose={()=>setSelectedId('')}
    onEdit={canEdit?()=>startEdit(selected):null}
    onOpenDocument={openDocument}
  />}
 </section>
}

function InvestorDetail({investor,investments,beneficiaries,payments,onClose,onEdit,onOpenDocument}){
 const active=investments.filter(x=>['ACTIVE','MATURING'].includes(x.status))
 const capital=active.reduce((s,x)=>s+Number(x.principal||0),0)
 const yieldPaid=payments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const docs=[
  ['Rostro',investor.face_photo_path],
  ['DUI frente',investor.dui_front_path],
  ['DUI reverso',investor.dui_back_path],
 ]
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="prst-investor-modal">
   <header>
    <div><small>EXPEDIENTE DEL INVERSIONISTA</small><h2>{fullName(investor)}</h2><p>{investor.investor_code} · DUI {investor.dui}</p></div>
    <button type="button" onClick={onClose}>×</button>
   </header>
   <section className="prst-profile-metrics">
    <article><span>Capital activo</span><strong>{money(capital)}</strong></article>
    <article><span>Inversiones</span><strong>{active.length}</strong></article>
    <article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong></article>
    <article><span>Beneficiarios</span><strong>{beneficiaries.length}</strong></article>
   </section>
   <div className="prst-profile-grid">
    <article><small>Información personal</small><b>{investor.birth_date?`${date(investor.birth_date)} · ${age(investor.birth_date)} años`:'Fecha de nacimiento pendiente'}</b><span>{investor.marital_status||'Estado civil pendiente'}</span><span>{investor.profession||'Profesión pendiente'}</span></article>
    <article><small>Contacto</small><b>{investor.phone||investor.whatsapp||'Sin teléfono'}</b><span>{investor.email||'Sin correo'}</span><span>{investor.emergency_contact_name?`Emergencia: ${investor.emergency_contact_name} · ${investor.emergency_contact_phone||'sin teléfono'}`:'Contacto de emergencia pendiente'}</span></article>
    <article><small>Domicilio</small><b>{[investor.district,investor.department].filter(Boolean).join(', ')||'Ubicación pendiente'}</b><span>{investor.address||'Dirección pendiente'}</span></article>
    <article><small>Pago</small><b>{investor.bank_name||'Banco pendiente'}</b><span>{investor.bank_account_last4?`Cuenta terminada en ${investor.bank_account_last4}`:'Referencia bancaria pendiente'}</span></article>
   </div>
   <div className="prst-section-title">Documentos privados</div>
   <div className="prst-document-actions">{docs.map(([label,path])=><button key={label} type="button" disabled={!path} onClick={()=>onOpenDocument(path)}><span>{label}</span><strong>{path?'Abrir documento':'Pendiente'}</strong></button>)}</div>
   <div className="prst-section-title">Beneficiarios</div>
   {!beneficiaries.length?<Empty title="Sin beneficiarios"/>:<div className="prst-compact-list">{beneficiaries.map(x=><div key={x.id}><span><b>{x.full_name}</b><small>{x.relationship||'Relación pendiente'}</small></span><strong>{Number(x.percentage).toFixed(2)}%</strong></div>)}</div>}
   <div className="prst-modal-actions"><button type="button" onClick={onClose}>Cerrar</button>{onEdit&&<button type="button" className="primary" onClick={onEdit}>Editar expediente</button>}</div>
  </section>
 </div>
}
