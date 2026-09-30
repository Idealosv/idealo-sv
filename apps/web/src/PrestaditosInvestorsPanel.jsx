import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import PrestaditosDuiOcr from './PrestaditosDuiOcr.jsx'
import PrestaditosCameraCapture from './PrestaditosCameraCapture.jsx'
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

export default function PrestaditosInvestorsPanel({company,role,investors,investments,beneficiaries,payments,query,setQuery,saving,act,onNavigate}){
 const [form,setForm]=useState(EMPTY_FORM)
 const [editingId,setEditingId]=useState('')
 const [selectedId,setSelectedId]=useState('')
 const [statusFilter,setStatusFilter]=useState('ALL')
 const [docsFilter,setDocsFilter]=useState('ALL')
 const [face,setFace]=useState(null)
 const [duiFront,setDuiFront]=useState(null)
 const [duiBack,setDuiBack]=useState(null)
 const [ocrApplied,setOcrApplied]=useState(false)
 const [formOpen,setFormOpen]=useState(false)
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
  setForm(EMPTY_FORM);setEditingId('');setFace(null);setDuiFront(null);setDuiBack(null);setOcrApplied(false);setFormOpen(false)
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
  setFormOpen(true)
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

 const activeInvestments=useMemo(()=>investments.filter(x=>['ACTIVE','MATURING'].includes(x.status)),[investments])
 const investorInvestmentMap=useMemo(()=>{
  const map=new Map()
  activeInvestments.forEach(inv=>{
   const current=map.get(inv.investor_id)||{count:0,capital:0,firstInvestmentId:''}
   current.count+=1
   current.capital+=Number(inv.principal||0)
   if(!current.firstInvestmentId)current.firstInvestmentId=inv.id
   map.set(inv.investor_id,current)
  })
  return map
 },[activeInvestments])

 const totals=useMemo(()=>({
  active:investors.filter(x=>x.status==='ACTIVE').length,
  complete:investors.filter(x=>[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length===3).length,
  pending:investors.filter(x=>[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length<3).length,
  capital:activeInvestments.reduce((sum,x)=>sum+Number(x.principal||0),0),
 }),[investors,activeInvestments])

 const clearFilters=()=>{setQuery('');setStatusFilter('ALL');setDocsFilter('ALL')}
 const hasFilters=Boolean(query.trim()||statusFilter!=='ALL'||docsFilter!=='ALL')
 const openNew=()=>{
  setForm(EMPTY_FORM);setEditingId('');setFace(null);setDuiFront(null);setDuiBack(null);setOcrApplied(false);setFormOpen(true)
  window.setTimeout(()=>document.querySelector('.prst-investor-form')?.scrollIntoView({behavior:'smooth',block:'start'}),30)
 }
 const goProfile=investor=>onNavigate?.('Perfil 360',{investor_id:investor.id})
 const goDocuments=investor=>onNavigate?.('Documentos',{investor_id:investor.id})
 const goContracts=investor=>{
  const linked=investorInvestmentMap.get(investor.id)
  onNavigate?.('Contratos',{investor_id:investor.id,investment_id:linked?.firstInvestmentId||''})
 }
 const exportCsv=()=>{
  const header=['Código','Nombre','DUI','NIT','Teléfono','WhatsApp','Correo','Estado','Documentos','Inversiones activas','Capital activo']
  const rows=filtered.map(x=>{
   const docs=[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length
   const inv=investorInvestmentMap.get(x.id)||{count:0,capital:0}
   return [x.investor_code,fullName(x),x.dui,x.nit,x.phone,x.whatsapp,x.email,statusLabel(x.status),`${docs}/3`,inv.count,Number(inv.capital||0).toFixed(2)]
  })
  const quote=v=>`"${String(v??'').replaceAll('"','""')}"`
  const csv='\ufeff'+[header,...rows].map(row=>row.map(quote).join(',')).join('\n')
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=`prestaditos-inversionistas-${new Date().toISOString().slice(0,10)}.csv`;a.click()
  URL.revokeObjectURL(url)
 }

 return <section className="prst-investor-module">
  <section className="prst-investor-command">
   <div>
    <small>CONTROL DE EXPEDIENTES</small>
    <h2>Directorio de inversionistas</h2>
    <p>Consulta, documentación, capital activo y acceso rápido al expediente de cada inversionista.</p>
   </div>
   <div className="prst-investor-command-actions">
    {canEdit&&<button type="button" className="primary" onClick={openNew}>+ Nuevo inversionista</button>}
    <details className="prst-action-menu top">
     <summary>Más</summary>
     <div>
      <button type="button" onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</button>
      {totals.pending>0&&<button type="button" onClick={()=>{setDocsFilter('PENDING');setStatusFilter('ALL')}}>Ver pendientes <span>{totals.pending}</span></button>}
     </div>
    </details>
   </div>
  </section>

  <section className="prst-investor-summary prst-investor-summary-pro">
   <article><span>Total inversionistas</span><strong>{investors.length}</strong><small>{totals.active} activos</small></article>
   <article><span>Documentación pendiente</span><strong>{totals.pending}</strong><small>{totals.complete} expedientes completos</small></article>
   <article><span>Inversiones activas</span><strong>{activeInvestments.length}</strong><small>vigentes actualmente</small></article>
   <article><span>Capital activo</span><strong>{money(totals.capital)}</strong><small>capital vigente</small></article>
  </section>

  <article className="prst-card prst-investor-directory-card">
   <div className="prst-card-head prst-investor-directory-head">
    <div><small>DIRECTORIO</small><h2>Inversionistas registrados</h2><p>Filtrá por estado o documentación y abrí el expediente sin perder el contexto.</p></div>
    <div className="prst-directory-count"><span>Resultados</span><strong>{filtered.length}</strong></div>
   </div>

   <div className="prst-directory-tools prst-directory-tools-pro">
    <input className="prst-search" placeholder="Buscar nombre, DUI, NIT, código, teléfono o correo" value={query} onChange={e=>setQuery(e.target.value)}/>
    <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">Todos los estados</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option><option value="BLOCKED">Bloqueados</option></select>
    <select value={docsFilter} onChange={e=>setDocsFilter(e.target.value)}><option value="ALL">Todos los documentos</option><option value="COMPLETE">Documentación completa</option><option value="PENDING">Documentación pendiente</option></select>
    {hasFilters&&<button type="button" className="prst-filter-clear" onClick={clearFilters}>Limpiar</button>}
   </div>

   {!filtered.length?<Empty title="No hay coincidencias">Cambiá los filtros o registrá un nuevo inversionista.</Empty>:<div className="prst-table-wrap prst-investor-table-wrap"><table className="prst-investor-table prst-investor-table-pro">
    <thead><tr><th>Inversionista</th><th>Identificación / contacto</th><th>Documentación</th><th>Inversiones</th><th>Capital activo</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>{filtered.map(x=>{
     const docs=[x.face_photo_path,x.dui_front_path,x.dui_back_path].filter(Boolean).length
     const inv=investorInvestmentMap.get(x.id)||{count:0,capital:0}
     const pct=Math.round((docs/3)*100)
     return <tr key={x.id}>
      <td><div className="prst-investor-name-cell"><span className="prst-investor-avatar">{String(x.first_names||'?').trim().charAt(0)}{String(x.last_names||'').trim().charAt(0)}</span><span><b>{fullName(x)}</b><small>{x.investor_code}{age(x.birth_date)!==null?` · ${age(x.birth_date)} años`:''}</small></span></div></td>
      <td><b>{x.dui||'DUI pendiente'}</b><small>{x.phone||x.whatsapp||x.email||'Sin contacto'}{x.nit?` · NIT ${x.nit}`:''}</small></td>
      <td><div className="prst-doc-progress"><div><span style={{width:`${pct}%`}}/></div><small>{docs===3?'Completo':`${docs}/3 documentos`}</small></div></td>
      <td><b>{inv.count}</b><small>{inv.count?'vigentes':'sin inversión activa'}</small></td>
      <td><b>{money(inv.capital)}</b><small>capital vigente</small></td>
      <td><span className={`prst-status ${String(x.status||'').toLowerCase()}`}>{statusLabel(x.status)}</span><small>{date(x.updated_at||x.created_at)}</small></td>
      <td><div className="prst-row-actions prst-investor-actions compact">
       <button type="button" className="primary" onClick={()=>setSelectedId(x.id)}>Ver</button>
       <button type="button" onClick={()=>goProfile(x)}>Perfil 360</button>
       <details className="prst-action-menu">
        <summary>Más</summary>
        <div>
         <button type="button" onClick={()=>goDocuments(x)}>Documentos</button>
         {inv.count>0&&<button type="button" onClick={()=>goContracts(x)}>Contratos</button>}
         {canEdit&&<button type="button" onClick={()=>startEdit(x)}>Editar</button>}
        </div>
       </details>
      </div></td>
     </tr>
    })}</tbody>
   </table></div>}
  </article>

  {formOpen&&<div className="prst-editor-backdrop" onMouseDown={e=>e.target===e.currentTarget&&reset()}><form className="prst-card prst-form prst-investor-form prst-investor-form-pro prst-editor-modal" onSubmit={submit}>
   <div className="prst-card-head prst-investor-form-head">
    <div><small>{editingId?'EDITAR EXPEDIENTE':'NUEVO EXPEDIENTE'}</small><h2>{editingId?'Actualizar inversionista':'Registrar inversionista'}</h2><p>Identificación, contacto, referencia de pago y documentación privada.</p></div>
    <button className="prst-mini-button" type="button" onClick={reset}>Cerrar formulario</button>
   </div>

   {!canEdit&&<div className="prst-note">Tu rol es de consulta. Podés revisar expedientes, pero no crear, editar ni cambiar estados.</div>}

   <div className="prst-investor-form-section"><div className="prst-section-title">1 · Identificación</div>
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
   </div>

   <div className="prst-investor-form-section"><div className="prst-section-title">2 · Contacto y domicilio</div>
    <div className="prst-form-grid">
     <Field label="Teléfono"><input name="phone" value={form.phone} onChange={update} inputMode="tel"/></Field>
     <Field label="WhatsApp"><input name="whatsapp" value={form.whatsapp} onChange={update} inputMode="tel"/></Field>
     <Field label="Correo" className="span-2"><input type="email" name="email" value={form.email} onChange={update}/></Field>
     <Field label="Departamento"><input name="department" value={form.department} onChange={update}/></Field>
     <Field label="Distrito"><input name="district" value={form.district} onChange={update}/></Field>
     <Field label="Dirección" className="span-2"><textarea name="address" value={form.address} onChange={update}/></Field>
    </div>
   </div>

   <div className="prst-investor-form-section"><div className="prst-section-title">3 · Referencia y pago</div>
    <div className="prst-form-grid">
     <Field label="Contacto de emergencia"><input name="emergency_contact_name" value={form.emergency_contact_name} onChange={update}/></Field>
     <Field label="Teléfono de emergencia"><input name="emergency_contact_phone" value={form.emergency_contact_phone} onChange={update} inputMode="tel"/></Field>
     <Field label="Banco"><input name="bank_name" value={form.bank_name} onChange={update}/></Field>
     <Field label="Últimos 4 de cuenta" hint="Por seguridad no se guarda el número completo."><input name="bank_account_last4" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" value={form.bank_account_last4} onChange={update}/></Field>
    </div>
   </div>

   <div className="prst-investor-form-section"><div className="prst-section-title">4 · Documentos privados</div>
    <div className="prst-capture-grid">
     <Field label={editingId?'Reemplazar foto del rostro':'Foto del rostro'}>
      <div className="prst-capture-actions">
       <PrestaditosCameraCapture label="Tomar foto del rostro" facingMode="user" fileName="rostro" onCapture={setFace}/>
       <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={e=>setFace(e.target.files?.[0]||null)}/>
      </div>
      <small>{face?.name||'Usá la cámara frontal o seleccioná una imagen.'}</small>
     </Field>
     <Field label={editingId?'Reemplazar DUI frente':'DUI frente'}>
      <div className="prst-capture-actions">
       <PrestaditosCameraCapture label="Escanear DUI frente" facingMode="environment" fileName="dui-frente" onCapture={file=>{setDuiFront(file);setOcrApplied(false)}}/>
       <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>{setDuiFront(e.target.files?.[0]||null);setOcrApplied(false)}}/>
      </div>
      <small>{duiFront?.name||'Usá la cámara trasera o seleccioná una imagen.'}</small>
     </Field>
     <Field label={editingId?'Reemplazar DUI reverso':'DUI reverso'}>
      <div className="prst-capture-actions">
       <PrestaditosCameraCapture label="Escanear DUI reverso" facingMode="environment" fileName="dui-reverso" onCapture={setDuiBack}/>
       <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>setDuiBack(e.target.files?.[0]||null)}/>
      </div>
      <small>{duiBack?.name||'Usá la cámara trasera o seleccioná una imagen.'}</small>
     </Field>
    </div>
    <PrestaditosDuiOcr file={duiFront} onApply={({dui,birth_date})=>{setForm(current=>({...current,dui:dui||current.dui,birth_date:birth_date||current.birth_date}));setOcrApplied(true)}}/>
   </div>

   <Field label="Observaciones internas"><textarea name="notes" value={form.notes} onChange={update}/></Field>
   <div className="prst-investor-form-actions"><button type="button" className="prst-mini-button" onClick={reset}>Cancelar</button><button className="prst-primary" disabled={saving||!canEdit}>{saving?'Guardando…':editingId?'Guardar cambios':'Guardar inversionista'}</button></div>
  </form></div>}

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
 const yieldPaid=payments.filter(x=>x.payment_type==='YIELD'&&(x.status||'POSTED')==='POSTED').reduce((s,x)=>s+Number(x.amount||0),0)
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
