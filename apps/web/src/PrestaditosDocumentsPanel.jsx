import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const TYPES={
 IDENTITY:'Identidad',
 CONTRACT:'Contrato',
 PAYMENT_PROOF:'Comprobante de pago',
 BENEFICIARY:'Beneficiario',
 FORM:'Formulario',
 ANNEX:'Anexo',
 OTHER:'Otro',
}
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const normalized=value=>String(value||'').trim()
const fileSize=value=>{
 const n=Number(value||0)
 if(!n)return '—'
 if(n<1024)return `${n} B`
 if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`
 return `${(n/(1024*1024)).toFixed(1)} MB`
}

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosDocumentsPanel({
 company,
 role,
 investors,
 applications,
 investments,
 documents,
 investorMap,
 saving,
 act,
}){
 const canUpload=['owner','admin','staff'].includes(String(role||'').toLowerCase())
 const canManage=['owner','admin'].includes(String(role||'').toLowerCase())
 const empty={investor_id:'',application_id:'',investment_id:'',document_type:'CONTRACT',title:'',document_date:'',notes:''}
 const [form,setForm]=useState(empty)
 const [file,setFile]=useState(null)
 const [search,setSearch]=useState('')
 const [typeFilter,setTypeFilter]=useState('ALL')
 const [statusFilter,setStatusFilter]=useState('ACTIVE')
 const [investorFilter,setInvestorFilter]=useState('ALL')
 const [deactivate,setDeactivate]=useState(null)

 useEffect(()=>{
  if(!form.investor_id&&investors[0])setForm(current=>({...current,investor_id:investors[0].id}))
 },[investors,form.investor_id])

 const investorApplications=applications.filter(x=>x.investor_id===form.investor_id)
 const investorInvestments=investments.filter(x=>x.investor_id===form.investor_id)

 useEffect(()=>{
  if(form.application_id&&!investorApplications.some(x=>x.id===form.application_id))setForm(current=>({...current,application_id:''}))
  if(form.investment_id&&!investorInvestments.some(x=>x.id===form.investment_id))setForm(current=>({...current,investment_id:''}))
 },[form.investor_id])

 const summary=useMemo(()=>({
  active:documents.filter(x=>x.status==='ACTIVE').length,
  contracts:documents.filter(x=>x.status==='ACTIVE'&&x.document_type==='CONTRACT').length,
  proofs:documents.filter(x=>x.status==='ACTIVE'&&x.document_type==='PAYMENT_PROOF').length,
  inactive:documents.filter(x=>x.status==='INACTIVE').length,
 }),[documents])

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return documents.filter(row=>{
   if(typeFilter!=='ALL'&&row.document_type!==typeFilter)return false
   if(statusFilter!=='ALL'&&row.status!==statusFilter)return false
   if(investorFilter!=='ALL'&&row.investor_id!==investorFilter)return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   const investment=investments.find(x=>x.id===row.investment_id)
   const application=applications.find(x=>x.id===row.application_id)
   return `${row.document_code||''} ${row.title||''} ${TYPES[row.document_type]||''} ${fullName(investor)} ${investor?.dui||''} ${investment?.investment_code||''} ${application?.application_code||''} ${row.notes||''}`.toLowerCase().includes(term)
  })
 },[documents,applications,investments,investorMap,search,typeFilter,statusFilter,investorFilter])

 const upload=async()=>{
  if(!file)throw new Error('Seleccioná un archivo.')
  if(!form.investor_id)throw new Error('Seleccioná un inversionista.')
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin'
  const stamp=Date.now()
  const path=`${company.id}/${form.investor_id}/documents/${stamp}-${Math.random().toString(36).slice(2,8)}.${ext}`
  const {error}=await supabase.storage.from('investor-documents').upload(path,file,{upsert:false,contentType:file.type||undefined})
  if(error)throw error
  return path
 }

 const submit=e=>{
  e.preventDefault()
  if(!canUpload)return
  act(async()=>{
   if(!file)throw new Error('Seleccioná un archivo.')
   if(file.size>10*1024*1024)throw new Error('El archivo supera el límite de 10 MB.')
   const path=await upload()
   const {error}=await supabase.rpc('inv_record_document',{
    p_company_id:company.id,
    p_investor_id:form.investor_id,
    p_application_id:form.application_id||null,
    p_investment_id:form.investment_id||null,
    p_document_type:form.document_type,
    p_title:normalized(form.title),
    p_storage_path:path,
    p_mime_type:file.type||'',
    p_file_size:file.size||null,
    p_document_date:form.document_date||null,
    p_notes:normalized(form.notes),
   })
   if(error){
    await supabase.storage.from('investor-documents').remove([path]).catch(()=>null)
    throw error
   }
   setForm({...empty,investor_id:form.investor_id})
   setFile(null)
  },'Documento guardado en el expediente privado.')
 }

 const openDocument=async row=>{
  const {data,error}=await supabase.storage.from('investor-documents').createSignedUrl(row.storage_path,120)
  if(error)throw error
  window.open(data.signedUrl,'_blank','noopener,noreferrer')
 }

 const changeActive=(row,active,reason='')=>{
  act(async()=>{
   const {error}=await supabase.rpc('inv_set_document_active',{p_document_id:row.id,p_active:active,p_reason:reason})
   if(error)throw error
  },active?'Documento reactivado.':'Documento inactivado sin eliminar su historial.')
 }

 const submitDeactivate=e=>{
  e.preventDefault()
  if(!deactivate)return
  const reason=normalized(deactivate.reason)
  if(!reason)return
  const row=deactivate.row
  setDeactivate(null)
  changeActive(row,false,reason)
 }

 return <section className="prst-documents-module">
  <section className="prst-investor-summary prst-documents-summary">
   <article><span>Documentos activos</span><strong>{summary.active}</strong><small>archivos vigentes</small></article>
   <article><span>Contratos</span><strong>{summary.contracts}</strong><small>documentos contractuales</small></article>
   <article><span>Comprobantes</span><strong>{summary.proofs}</strong><small>pagos y respaldos</small></article>
   <article><span>Inactivos</span><strong>{summary.inactive}</strong><small>histórico conservado</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-documents-form" onSubmit={submit}>
    <div className="prst-card-head"><div><small>NUEVO DOCUMENTO</small><h2>Agregar al expediente</h2><p>Los archivos permanecen privados y se vinculan al inversionista.</p></div></div>
    {!canUpload&&<div className="prst-note">Tu rol es de consulta. No tenés permiso para cargar documentos.</div>}

    <Field label="Inversionista *"><select value={form.investor_id} onChange={e=>setForm({...form,investor_id:e.target.value,application_id:'',investment_id:''})} required disabled={!canUpload}><option value="">Seleccionar</option>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)} · {x.investor_code}</option>)}</select></Field>

    <div className="prst-form-grid">
     <Field label="Tipo de documento *"><select value={form.document_type} onChange={e=>setForm({...form,document_type:e.target.value})} disabled={!canUpload}>{Object.entries(TYPES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
     <Field label="Fecha del documento"><input type="date" value={form.document_date} onChange={e=>setForm({...form,document_date:e.target.value})} disabled={!canUpload}/></Field>
     <Field label="Solicitud relacionada"><select value={form.application_id} onChange={e=>setForm({...form,application_id:e.target.value})} disabled={!canUpload}><option value="">Sin solicitud</option>{investorApplications.map(x=><option key={x.id} value={x.id}>{x.application_code||'Solicitud'} · {x.status}</option>)}</select></Field>
     <Field label="Inversión relacionada"><select value={form.investment_id} onChange={e=>setForm({...form,investment_id:e.target.value})} disabled={!canUpload}><option value="">Sin inversión</option>{investorInvestments.map(x=><option key={x.id} value={x.id}>{x.investment_code}</option>)}</select></Field>
     <Field label="Título *" className="span-2"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required disabled={!canUpload} placeholder="Ej. Contrato de inversión firmado"/></Field>
    </div>

    <Field label="Archivo *" hint="Imágenes o PDF. Máximo 10 MB."><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)} disabled={!canUpload}/>{file&&<small>{file.name} · {fileSize(file.size)}</small>}</Field>
    <Field label="Observaciones"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} disabled={!canUpload} placeholder="Detalles internos del documento."/></Field>

    <div className="prst-note"><strong>Privacidad:</strong> el archivo no es público. Se abre mediante un enlace temporal firmado y queda separado por empresa e inversionista.</div>
    <button className="prst-primary" disabled={saving||!canUpload||!file}>{saving?'Guardando…':'Guardar documento'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>REPOSITORIO</small><h2>Documentos del expediente</h2><p>Identidad, contratos, formularios, comprobantes y anexos.</p></div></div>
    <div className="prst-directory-tools prst-documents-tools">
     <input className="prst-search" placeholder="Buscar código, título, inversionista, DUI o inversión" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select value={investorFilter} onChange={e=>setInvestorFilter(e.target.value)}><option value="ALL">Todos los inversionistas</option>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)}</option>)}</select>
     <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="ALL">Todos los tipos</option>{Object.entries(TYPES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option><option value="ALL">Todos</option></select>
     <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
    </div>

    {!filtered.length?<Empty title="Sin documentos para mostrar">Cargá un documento o cambiá los filtros.</Empty>:<div className="prst-table-wrap"><table className="prst-documents-table">
     <thead><tr><th>Documento</th><th>Inversionista</th><th>Relación</th><th>Tipo</th><th>Archivo</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>{filtered.map(row=>{
      const investor=investorMap.get(row.investor_id)
      const application=applications.find(x=>x.id===row.application_id)
      const investment=investments.find(x=>x.id===row.investment_id)
      return <tr key={row.id}>
       <td><b>{row.title}</b><small>{row.document_code} · {date(row.document_date||row.created_at)}</small></td>
       <td><b>{fullName(investor)}</b><small>DUI {investor?.dui||'—'}</small></td>
       <td><b>{investment?.investment_code||application?.application_code||'Expediente general'}</b><small>{investment?'Inversión':application?'Solicitud':'Inversionista'}</small></td>
       <td>{TYPES[row.document_type]||row.document_type}</td>
       <td><b>{row.mime_type?.includes('pdf')?'PDF':'Archivo'}</b><small>{fileSize(row.file_size)}</small></td>
       <td><span className={`prst-status ${row.status==='ACTIVE'?'active':'inactive'}`}>{row.status==='ACTIVE'?'Activo':'Inactivo'}</span>{row.status==='INACTIVE'&&<small>{row.inactivation_reason||'Sin motivo'}</small>}</td>
       <td><div className="prst-row-actions"><button type="button" onClick={()=>openDocument(row)}>Abrir</button>{canManage&&row.status==='ACTIVE'&&<button type="button" className="danger" onClick={()=>setDeactivate({row,reason:''})}>Inactivar</button>}{canManage&&row.status==='INACTIVE'&&<button type="button" className="approve" onClick={()=>changeActive(row,true)}>Reactivar</button>}</div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </article>
  </section>

  {deactivate&&<div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setDeactivate(null)}>
   <form className="prst-decision-modal" onSubmit={submitDeactivate}>
    <header><div><small>INACTIVAR DOCUMENTO</small><h2>{deactivate.row.title}</h2><p>{deactivate.row.document_code}</p></div><button type="button" onClick={()=>setDeactivate(null)} disabled={saving}>×</button></header>
    <div className="prst-note"><strong>No se eliminará el archivo.</strong> Quedará fuera de los documentos vigentes, pero se conservará para auditoría.</div>
    <Field label="Motivo *"><textarea autoFocus value={deactivate.reason} onChange={e=>setDeactivate({...deactivate,reason:e.target.value})} required placeholder="Ej. documento sustituido por una versión nueva."/></Field>
    <div className="prst-modal-actions"><button type="button" onClick={()=>setDeactivate(null)}>Cancelar</button><button type="submit" className="danger" disabled={saving||!deactivate.reason.trim()}>Confirmar inactivación</button></div>
   </form>
  </div>}
 </section>
}
