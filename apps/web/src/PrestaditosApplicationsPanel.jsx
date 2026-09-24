import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const dateTime=value=>value?new Date(value).toLocaleString('es-SV',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const normalized=value=>String(value||'').trim()
const STATUS_LABELS={
 PENDING:'Pendiente',
 REVIEW:'En revisión',
 APPROVED:'Aprobada',
 REJECTED:'Rechazada',
 SIGNATURE:'En firma',
 FUNDS_RECEIVED:'Fondos recibidos',
 ACTIVE:'Formalizada',
}
const STATUS_ORDER=['PENDING','REVIEW','APPROVED','SIGNATURE','FUNDS_RECEIVED','ACTIVE']

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}
function Status({value}){return <span className={`prst-status ${String(value||'').toLowerCase()}`}>{STATUS_LABELS[value]||value||'—'}</span>}

export default function PrestaditosApplicationsPanel({
 company,
 role,
 settings,
 investors,
 applications,
 investments,
 investorMap,
 saving,
 act,
 onFormalize,
}){
 const activeInvestors=useMemo(()=>investors.filter(x=>x.status==='ACTIVE'),[investors])
 const termOptions=Array.isArray(settings?.allowed_term_months)?settings.allowed_term_months:[]
 const paymentMethods=Array.isArray(settings?.payment_methods)?settings.payment_methods:[]
 const paymentPlaces=Array.isArray(settings?.payment_places)?settings.payment_places:[]
 const emptyForm={investor_id:'',requested_amount:'',requested_term_months:'',requested_start_date:today(),payment_place:'',payment_method:'',observations:''}
 const [form,setForm]=useState(emptyForm)
 const [editingId,setEditingId]=useState('')
 const [search,setSearch]=useState('')
 const [statusFilter,setStatusFilter]=useState('ALL')
 const [selectedId,setSelectedId]=useState('')
 const [events,setEvents]=useState([])
 const [eventsLoading,setEventsLoading]=useState(false)
 const [eventsRevision,setEventsRevision]=useState(0)
 const [decision,setDecision]=useState(null)

 const normalizedRole=String(role||'').toLowerCase()
 const canSubmit=['owner','admin','staff','operator'].includes(normalizedRole)
 const canReview=['owner','admin'].includes(normalizedRole)
 const selected=applications.find(x=>x.id===selectedId)||null

 useEffect(()=>{
  if(!form.investor_id&&activeInvestors[0])setForm(current=>({...current,investor_id:activeInvestors[0].id}))
 },[activeInvestors,form.investor_id])

 useEffect(()=>{
  if(!selectedId||!company?.id){setEvents([]);return}
  let cancelled=false
  const run=async()=>{
   setEventsLoading(true)
   const {data,error}=await supabase
    .from('inv_application_events')
    .select('*')
    .eq('company_id',company.id)
    .eq('application_id',selectedId)
    .order('created_at',{ascending:true})
   if(!cancelled){
    setEvents(error?[]:(data||[]))
    setEventsLoading(false)
   }
  }
  run()
  return()=>{cancelled=true}
 },[selectedId,company?.id,eventsRevision])

 const investmentByApplication=useMemo(()=>{
  const map=new Map()
  for(const investment of investments||[])if(investment.application_id)map.set(investment.application_id,investment)
  return map
 },[investments])

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return applications.filter(row=>{
   if(statusFilter!=='ALL'&&row.status!==statusFilter)return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   const haystack=`${row.application_code||''} ${fullName(investor)} ${investor?.dui||''} ${investor?.investor_code||''} ${row.requested_amount||''} ${row.payment_place||''} ${row.payment_method||''}`.toLowerCase()
   return haystack.includes(term)
  })
 },[applications,investorMap,search,statusFilter])

 const summary=useMemo(()=>{
  const open=applications.filter(x=>['PENDING','REVIEW'].includes(x.status))
  const approved=applications.filter(x=>['APPROVED','SIGNATURE','FUNDS_RECEIVED'].includes(x.status))
  const requestedOpen=open.reduce((sum,x)=>sum+Number(x.requested_amount||0),0)
  const ready=applications.filter(x=>x.status==='FUNDS_RECEIVED').length
  return {open:open.length,approved:approved.length,requestedOpen,ready}
 },[applications])

 const selectedInvestor=selected?investorMap.get(selected.investor_id):null
 const selectedInvestment=selected?investmentByApplication.get(selected.id):null

 const resetForm=()=>{
  setEditingId('')
  setForm({...emptyForm,investor_id:activeInvestors[0]?.id||''})
 }

 const startEdit=row=>{
  if(row.status!=='PENDING'||!canReview)return
  setEditingId(row.id)
  setForm({
   investor_id:row.investor_id,
   requested_amount:String(row.requested_amount??''),
   requested_term_months:String(row.requested_term_months??''),
   requested_start_date:row.requested_start_date||'',
   payment_place:row.payment_place||'',
   payment_method:row.payment_method||'',
   observations:row.observations||'',
  })
  window.setTimeout(()=>document.querySelector('.prst-application-form')?.scrollIntoView({behavior:'smooth',block:'start'}),30)
 }

 const submit=e=>{
  e.preventDefault()
  if(!canSubmit&&!editingId)return
  act(async()=>{
   const investor=investorMap.get(form.investor_id)
   if(!investor||investor.status!=='ACTIVE')throw new Error('Seleccioná un inversionista activo.')
   const amount=Number(form.requested_amount)
   const term=Number(form.requested_term_months)
   if(!Number.isFinite(amount)||amount<=0)throw new Error('Ingresá un monto de inversión válido.')
   if(!Number.isInteger(term)||term<=0||term>240)throw new Error('Ingresá un plazo válido en meses.')
   const payload={
    investor_id:form.investor_id,
    requested_amount:amount,
    requested_term_months:term,
    requested_start_date:form.requested_start_date||null,
    payment_place:normalized(form.payment_place),
    payment_method:normalized(form.payment_method),
    observations:normalized(form.observations),
   }
   if(editingId){
    const current=applications.find(x=>x.id===editingId)
    if(!current||current.status!=='PENDING')throw new Error('Solo se pueden editar solicitudes que siguen pendientes.')
    const {error}=await supabase.from('inv_applications').update(payload).eq('id',editingId).eq('company_id',company.id)
    if(error)throw error
    await supabase.from('inv_audit_log').insert({
     company_id:company.id,
     investor_id:payload.investor_id,
     action:'APPLICATION_UPDATED',
     detail:{application_id:editingId,requested_amount:amount,requested_term_months:term},
    })
   }else{
    const {data,error}=await supabase.from('inv_applications').insert({...payload,company_id:company.id,status:'PENDING'}).select('id,application_code').single()
    if(error)throw error
    await supabase.from('inv_audit_log').insert({
     company_id:company.id,
     investor_id:payload.investor_id,
     action:'APPLICATION_CREATED',
     detail:{application_id:data.id,application_code:data.application_code,requested_amount:amount,requested_term_months:term},
    })
   }
   resetForm()
  },editingId?'Solicitud actualizada correctamente.':'Solicitud de inversión registrada y enviada a la empresa.')
 }

 const transition=(row,target,{note='',approvedAmount=null,approvedTerm=null,success}={})=>{
  if(!canReview)return
  act(async()=>{
   const {error}=await supabase.rpc('inv_transition_application',{
    p_application_id:row.id,
    p_target_status:target,
    p_note:note,
    p_approved_amount:approvedAmount,
    p_approved_term_months:approvedTerm,
   })
   if(error)throw error
   await supabase.from('inv_audit_log').insert({
    company_id:company.id,
    investor_id:row.investor_id,
    action:'APPLICATION_STATUS_CHANGED',
    detail:{application_id:row.id,application_code:row.application_code,from:row.status,to:target},
   })
   setEventsRevision(value=>value+1)
  },success||`Solicitud actualizada a ${STATUS_LABELS[target]||target}.`)
 }

 const openApprove=row=>setDecision({
  type:'APPROVE',
  row,
  amount:String(row.approved_amount??row.requested_amount??''),
  term:String(row.approved_term_months??row.requested_term_months??''),
  note:row.decision_notes||'',
 })
 const openReject=row=>setDecision({type:'REJECT',row,note:row.decision_notes||''})

 const submitDecision=e=>{
  e.preventDefault()
  if(!decision)return
  if(decision.type==='APPROVE'){
   const amount=Number(decision.amount),term=Number(decision.term)
   if(!Number.isFinite(amount)||amount<=0)return
   if(!Number.isInteger(term)||term<=0)return
   const row=decision.row
   setDecision(null)
   transition(row,'APPROVED',{
    note:normalized(decision.note),
    approvedAmount:amount,
    approvedTerm:term,
    success:'Solicitud aprobada. Ya puede continuar a firma.',
   })
   return
  }
  const note=normalized(decision.note)
  if(!note)return
  const row=decision.row
  setDecision(null)
  transition(row,'REJECTED',{note,success:'Solicitud rechazada con motivo registrado.'})
 }

 const docsCount=investor=>[investor?.face_photo_path,investor?.dui_front_path,investor?.dui_back_path].filter(Boolean).length

 return <section className="prst-application-module">
  <datalist id="prst-application-term-options">{termOptions.map(value=><option key={value} value={value}/>)}</datalist>
  <datalist id="prst-application-place-options">{paymentPlaces.map(value=><option key={value} value={value}/>)}</datalist>
  <datalist id="prst-application-method-options">{paymentMethods.map(value=><option key={value} value={value}/>)}</datalist>
  <section className="prst-investor-summary prst-application-summary">
   <article><span>Solicitudes</span><strong>{applications.length}</strong><small>histórico total</small></article>
   <article><span>Pendientes / revisión</span><strong>{summary.open}</strong><small>{money(summary.requestedOpen)} solicitado</small></article>
   <article><span>Aprobadas en proceso</span><strong>{summary.approved}</strong><small>firma o recepción de fondos</small></article>
   <article><span>Listas para formalizar</span><strong>{summary.ready}</strong><small>fondos recibidos</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-application-form" onSubmit={submit}>
    <div className="prst-card-head">
     <div>
      <small>{editingId?'EDITAR SOLICITUD':'NUEVA SOLICITUD'}</small>
      <h2>{editingId?'Actualizar solicitud':'Registrar solicitud de inversión'}</h2>
      <p>Conserva exactamente lo solicitado por el inversionista antes de cualquier aprobación.</p>
     </div>
     {editingId&&<button type="button" className="prst-mini-button" onClick={resetForm}>Cancelar edición</button>}
    </div>

    {!canSubmit&&!editingId&&<div className="prst-note">Tu rol es de consulta. Solo propietario, administrador o personal autorizado puede registrar solicitudes.</div>}

    <Field label="Inversionista *">
     <select value={form.investor_id} onChange={e=>setForm({...form,investor_id:e.target.value})} required disabled={Boolean(editingId)}>
      <option value="">Seleccionar inversionista</option>
      {activeInvestors.map(x=><option key={x.id} value={x.id}>{fullName(x)} · {x.investor_code} · DUI {x.dui}</option>)}
     </select>
    </Field>

    {form.investor_id&&(()=>{
     const investor=investorMap.get(form.investor_id)
     const docs=docsCount(investor)
     return <div className={`prst-application-investor-check ${docs===3?'complete':'pending'}`}>
      <span><b>{fullName(investor)}</b><small>{investor?.investor_code} · DUI {investor?.dui}</small></span>
      <strong>{docs}/3 documentos</strong>
     </div>
    })()}

    <div className="prst-form-grid">
     <Field label="Monto que desea invertir *"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.requested_amount} onChange={e=>setForm({...form,requested_amount:e.target.value})} required/></Field>
     <Field label="Plazo solicitado *"><div className="prst-input-suffix"><input type="number" min="1" max="240" step="1" list="prst-application-term-options" inputMode="numeric" value={form.requested_term_months} onChange={e=>setForm({...form,requested_term_months:e.target.value})} required/><span>meses</span></div></Field>
     <Field label="Fecha deseada de inicio"><input type="date" value={form.requested_start_date||''} onChange={e=>setForm({...form,requested_start_date:e.target.value})}/></Field>
     <Field label="Lugar de pago"><input list="prst-application-place-options" value={form.payment_place} onChange={e=>setForm({...form,payment_place:e.target.value})} placeholder="Sucursal, banco u otro"/></Field>
     <Field label="Forma de pago" className="span-2"><input list="prst-application-method-options" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})} placeholder="Transferencia, depósito, efectivo u otra"/></Field>
    </div>
    <Field label="Observaciones de la solicitud"><textarea value={form.observations} onChange={e=>setForm({...form,observations:e.target.value})} placeholder="Indicaciones proporcionadas por el inversionista o notas de recepción."/></Field>
    <button className="prst-primary" disabled={saving||(!canSubmit&&!editingId)||!activeInvestors.length}>{saving?'Guardando…':editingId?'Guardar cambios':'Registrar solicitud'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head">
     <div><small>BANDEJA DE CONTROL</small><h2>Solicitudes recibidas</h2><p>Seguimiento desde recepción hasta formalización.</p></div>
    </div>
    <div className="prst-directory-tools prst-application-tools">
     <input className="prst-search" placeholder="Buscar código, inversionista, DUI, monto o lugar" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
      <option value="ALL">Todos los estados</option>
      {Object.entries(STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select>
     <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
    </div>

    {!filtered.length?<Empty title="Sin solicitudes para mostrar">Registrá una nueva solicitud o cambiá los filtros.</Empty>:<div className="prst-table-wrap">
     <table className="prst-application-table">
      <thead><tr><th>Solicitud</th><th>Inversionista</th><th>Solicitado</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>{filtered.map(row=>{
       const investor=investorMap.get(row.investor_id)
       const investment=investmentByApplication.get(row.id)
       return <tr key={row.id}>
        <td><b>{row.application_code||'Código pendiente'}</b><small>{date(row.created_at)}</small></td>
        <td><b>{fullName(investor)}</b><small>{investor?.investor_code||'—'} · DUI {investor?.dui||'—'}</small></td>
        <td><b>{money(row.requested_amount)}</b><small>{row.requested_term_months} meses{row.requested_start_date?` · inicio ${date(row.requested_start_date)}`:''}</small></td>
        <td><b>{row.payment_place||'Pendiente'}</b><small>{row.payment_method||'Forma pendiente'}</small></td>
        <td><Status value={row.status}/>{row.status==='APPROVED'&&<small>{money(row.approved_amount||row.requested_amount)} · {row.approved_term_months||row.requested_term_months} meses</small>}{investment&&<small>{investment.investment_code}</small>}</td>
        <td><div className="prst-row-actions">
         <button type="button" className="primary" onClick={()=>setSelectedId(row.id)}>Gestionar</button>
        </div></td>
       </tr>
      })}</tbody>
     </table>
    </div>}
   </article>
  </section>

  {selected&&<ApplicationDetail
   application={selected}
   investor={selectedInvestor}
   investment={selectedInvestment}
   events={events}
   eventsLoading={eventsLoading}
   canReview={canReview}
   onClose={()=>setSelectedId('')}
   onEdit={()=>{setSelectedId('');startEdit(selected)}}
   onReview={()=>transition(selected,'REVIEW',{success:'Solicitud tomada para revisión.'})}
   onApprove={()=>openApprove(selected)}
   onReject={()=>openReject(selected)}
   onSignature={()=>transition(selected,'SIGNATURE',{success:'Solicitud enviada a etapa de firma.'})}
   onFunds={()=>transition(selected,'FUNDS_RECEIVED',{success:'Recepción de fondos registrada. La solicitud está lista para formalizar.'})}
   onFormalize={()=>{setSelectedId('');onFormalize?.(selected.id)}}
  />}

  {decision&&<DecisionModal decision={decision} setDecision={setDecision} onSubmit={submitDecision} saving={saving}/>}
 </section>
}

function ApplicationDetail({application,investor,investment,events,eventsLoading,canReview,onClose,onEdit,onReview,onApprove,onReject,onSignature,onFunds,onFormalize}){
 const requestedAmount=Number(application.requested_amount||0)
 const approvedAmount=application.approved_amount==null?null:Number(application.approved_amount)
 const docs=[investor?.face_photo_path,investor?.dui_front_path,investor?.dui_back_path].filter(Boolean).length
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="prst-investor-modal prst-application-modal">
   <header>
    <div><small>SOLICITUD DE INVERSIÓN</small><h2>{application.application_code||'Solicitud'}</h2><p>{fullName(investor)} · DUI {investor?.dui||'—'}</p></div>
    <button type="button" onClick={onClose}>×</button>
   </header>

   <section className="prst-profile-metrics">
    <article><span>Monto solicitado</span><strong>{money(requestedAmount)}</strong></article>
    <article><span>Plazo solicitado</span><strong>{application.requested_term_months} meses</strong></article>
    <article><span>Monto aprobado</span><strong>{approvedAmount==null?'—':money(approvedAmount)}</strong></article>
    <article><span>Estado</span><strong>{STATUS_LABELS[application.status]||application.status}</strong></article>
   </section>

   <div className="prst-profile-grid">
    <article><small>Inversionista</small><b>{fullName(investor)}</b><span>{investor?.investor_code||'—'} · {docs}/3 documentos de identidad</span><span>{investor?.phone||investor?.whatsapp||'Sin teléfono'}</span></article>
    <article><small>Solicitud</small><b>Recibida {dateTime(application.created_at)}</b><span>Inicio deseado: {date(application.requested_start_date)}</span><span>{application.observations||'Sin observaciones'}</span></article>
    <article><small>Lugar y forma de pago</small><b>{application.payment_place||'Lugar pendiente'}</b><span>{application.payment_method||'Forma de pago pendiente'}</span></article>
    <article><small>Decisión</small><b>{application.decision_at?dateTime(application.decision_at):'Pendiente'}</b><span>{application.decision_notes||'Sin nota de decisión'}</span>{application.approved_term_months&&<span>Aprobado: {application.approved_term_months} meses</span>}</article>
   </div>

   <div className="prst-section-title">Ruta de la solicitud</div>
   <div className="prst-application-progress">
    {STATUS_ORDER.map((status,index)=>{
     const currentIndex=STATUS_ORDER.indexOf(application.status)
     const reached=application.status==='REJECTED'?status==='PENDING'||status==='REVIEW':index<=currentIndex
     const current=status===application.status
     return <div key={status} className={`${reached?'reached':''} ${current?'current':''}`}>
      <b>{index+1}</b><span>{STATUS_LABELS[status]}</span>
     </div>
    })}
    {application.status==='REJECTED'&&<div className="rejected current"><b>×</b><span>Rechazada</span></div>}
   </div>

   <div className="prst-section-title">Historial</div>
   {eventsLoading?<div className="prst-empty">Cargando historial…</div>:!events.length?<Empty title="Sin movimientos registrados"/>:<div className="prst-timeline">
    {events.map(event=><article key={event.id}>
     <span></span>
     <div><b>{STATUS_LABELS[event.status_to]||event.status_to}</b><small>{dateTime(event.created_at)}{event.status_from?` · desde ${STATUS_LABELS[event.status_from]||event.status_from}`:''}</small>{event.note&&<p>{event.note}</p>}</div>
    </article>)}
   </div>}

   {investment&&<div className="prst-application-linked"><span>INVERSIÓN FORMALIZADA</span><strong>{investment.investment_code}</strong><small>{money(investment.principal)} · vence {date(investment.maturity_date)}</small></div>}

   <div className="prst-modal-actions prst-application-modal-actions">
    <button type="button" onClick={onClose}>Cerrar</button>
    {canReview&&application.status==='PENDING'&&<><button type="button" onClick={onEdit}>Editar</button><button type="button" className="primary" onClick={onReview}>Pasar a revisión</button></>}
    {canReview&&application.status==='REVIEW'&&<><button type="button" className="danger" onClick={onReject}>Rechazar</button><button type="button" className="primary" onClick={onApprove}>Aprobar</button></>}
    {canReview&&application.status==='APPROVED'&&<button type="button" className="primary" onClick={onSignature}>Enviar a firma</button>}
    {canReview&&application.status==='SIGNATURE'&&<button type="button" className="primary" onClick={onFunds}>Registrar fondos recibidos</button>}
    {canReview&&application.status==='FUNDS_RECEIVED'&&!investment&&<button type="button" className="primary" onClick={onFormalize}>Formalizar inversión</button>}
   </div>
  </section>
 </div>
}

function DecisionModal({decision,setDecision,onSubmit,saving}){
 const approve=decision.type==='APPROVE'
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setDecision(null)}>
  <form className="prst-decision-modal" onSubmit={onSubmit}>
   <header><div><small>{approve?'APROBACIÓN':'RECHAZO'}</small><h2>{approve?'Aprobar solicitud':'Rechazar solicitud'}</h2><p>{decision.row.application_code}</p></div><button type="button" onClick={()=>setDecision(null)} disabled={saving}>×</button></header>
   {approve?<>
    <div className="prst-form-grid">
     <Field label="Monto aprobado *"><input type="number" min="0.01" step="0.01" value={decision.amount} onChange={e=>setDecision({...decision,amount:e.target.value})} required/></Field>
     <Field label="Plazo aprobado *"><div className="prst-input-suffix"><input type="number" min="1" max="240" step="1" value={decision.term} onChange={e=>setDecision({...decision,term:e.target.value})} required/><span>meses</span></div></Field>
    </div>
    <div className="prst-comparison-box"><span>Solicitado</span><strong>{money(decision.row.requested_amount)} · {decision.row.requested_term_months} meses</strong><span>A aprobar</span><strong>{money(decision.amount)} · {decision.term||'—'} meses</strong></div>
    <Field label="Nota de aprobación"><textarea value={decision.note} onChange={e=>setDecision({...decision,note:e.target.value})} placeholder="Opcional: condiciones u observaciones de la aprobación."/></Field>
   </>:<Field label="Motivo del rechazo *" hint="Quedará guardado en la trazabilidad de la solicitud."><textarea autoFocus value={decision.note} onChange={e=>setDecision({...decision,note:e.target.value})} required placeholder="Explicá el motivo del rechazo."/></Field>}
   <div className="prst-modal-actions"><button type="button" onClick={()=>setDecision(null)} disabled={saving}>Cancelar</button><button type="submit" className={approve?'primary':'danger'} disabled={saving}>{saving?'Procesando…':approve?'Confirmar aprobación':'Confirmar rechazo'}</button></div>
  </form>
 </div>
}
