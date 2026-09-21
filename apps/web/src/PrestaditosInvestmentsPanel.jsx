import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const daysUntil=value=>value?Math.ceil((new Date(`${value}T12:00:00`).getTime()-new Date(`${today()}T12:00:00`).getTime())/86400000):null
const normalized=value=>String(value||'').trim()

const STATUS_LABELS={
 PENDING:'Pendiente',
 ACTIVE:'Activa',
 MATURING:'Próxima a vencer',
 MATURED:'Vencida',
 RENEWED:'Renovada',
 CLOSED:'Cerrada',
 CANCELLED:'Cancelada',
}

const effectiveStatus=investment=>{
 const base=investment?.status||'PENDING'
 if(!['ACTIVE','MATURING'].includes(base)||!investment?.maturity_date)return base
 const days=daysUntil(investment.maturity_date)
 if(days!==null&&days<0)return 'MATURED'
 if(days!==null&&days<=30)return 'MATURING'
 return 'ACTIVE'
}

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}
function Status({value}){return <span className={`prst-status ${String(value||'').toLowerCase()}`}>{STATUS_LABELS[value]||value||'—'}</span>}

export default function PrestaditosInvestmentsPanel({
 company,
 role,
 applications,
 investments,
 beneficiaries,
 payments,
 investorMap,
 saving,
 act,
 preselectedApplicationId='',
 onFormalized,
}){
 const normalizedRole=String(role||'').toLowerCase()
 const canManage=['owner','admin'].includes(normalizedRole)
 const existingApplicationIds=useMemo(()=>new Set(investments.map(x=>x.application_id).filter(Boolean)),[investments])
 const eligible=useMemo(()=>applications.filter(x=>x.status==='FUNDS_RECEIVED'&&!existingApplicationIds.has(x.id)),[applications,existingApplicationIds])

 const emptyForm={application_id:'',granted_at:today(),contract_number:'',projected_gain:'',payment_place:'',payment_method:''}
 const [form,setForm]=useState(emptyForm)
 const [search,setSearch]=useState('')
 const [statusFilter,setStatusFilter]=useState('ALL')
 const [maturityFilter,setMaturityFilter]=useState('ALL')
 const [selectedId,setSelectedId]=useState('')
 const [edit,setEdit]=useState(null)

 useEffect(()=>{
  if(form.application_id)return
  const preferred=eligible.find(x=>x.id===preselectedApplicationId)||eligible[0]
  if(preferred)setForm(current=>({...current,application_id:preferred.id,payment_place:preferred.payment_place||'',payment_method:preferred.payment_method||''}))
 },[eligible,form.application_id,preselectedApplicationId])

 const selectedApplication=applications.find(x=>x.id===form.application_id)||null
 const selected=investments.find(x=>x.id===selectedId)||null

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return investments.filter(row=>{
   const status=effectiveStatus(row)
   if(statusFilter!=='ALL'&&status!==statusFilter)return false
   const d=daysUntil(row.maturity_date)
   if(maturityFilter==='30'&&(d===null||d<0||d>30))return false
   if(maturityFilter==='90'&&(d===null||d<0||d>90))return false
   if(maturityFilter==='OVERDUE'&&(d===null||d>=0))return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   const application=applications.find(x=>x.id===row.application_id)
   const haystack=`${row.investment_code||''} ${row.contract_number||''} ${fullName(investor)} ${investor?.dui||''} ${application?.application_code||''} ${row.principal||''} ${row.payment_place||''}`.toLowerCase()
   return haystack.includes(term)
  }).sort((a,b)=>String(a.maturity_date||'9999').localeCompare(String(b.maturity_date||'9999')))
 },[investments,applications,investorMap,search,statusFilter,maturityFilter])

 const active=investments.filter(x=>['ACTIVE','MATURING'].includes(effectiveStatus(x)))
 const summary=useMemo(()=>({
  active:active.length,
  capital:active.reduce((sum,x)=>sum+Number(x.principal||0),0),
  projected:active.reduce((sum,x)=>sum+Number(x.projected_gain||0),0),
  next30:investments.filter(x=>{const d=daysUntil(x.maturity_date);return d!==null&&d>=0&&d<=30&&['ACTIVE','MATURING'].includes(x.status)}).length,
 }),[investments,active])

 const choose=id=>{
  const row=applications.find(x=>x.id===id)
  setForm({...form,application_id:id,payment_place:row?.payment_place||'',payment_method:row?.payment_method||''})
 }

 const submit=e=>{
  e.preventDefault()
  if(!canManage)return
  act(async()=>{
   const application=applications.find(x=>x.id===form.application_id)
   if(!application)throw new Error('Seleccioná una solicitud lista para formalizar.')
   if(application.status!=='FUNDS_RECEIVED')throw new Error('La solicitud debe estar en Fondos recibidos.')
   if(existingApplicationIds.has(application.id))throw new Error('Esta solicitud ya fue formalizada.')
   const projected=form.projected_gain===''?null:Number(form.projected_gain)
   if(projected!==null&&(!Number.isFinite(projected)||projected<0))throw new Error('Ingresá una ganancia proyectada válida o dejala vacía.')
   const {error}=await supabase.rpc('inv_formalize_application',{
    p_application_id:application.id,
    p_granted_at:form.granted_at,
    p_contract_number:normalized(form.contract_number),
    p_projected_gain:projected,
    p_payment_place:normalized(form.payment_place),
    p_payment_method:normalized(form.payment_method),
   })
   if(error)throw error
   setForm({...emptyForm,application_id:''})
   onFormalized?.()
  },'Inversión formalizada correctamente.')
 }

 const openEdit=row=>setEdit({
  row,
  contract_number:row.contract_number||'',
  projected_gain:row.projected_gain==null?'':String(row.projected_gain),
  payment_place:row.payment_place||'',
  payment_method:row.payment_method||'',
  notes:'',
 })

 const submitEdit=e=>{
  e.preventDefault()
  if(!edit||!canManage)return
  const projected=edit.projected_gain===''?null:Number(edit.projected_gain)
  if(projected!==null&&(!Number.isFinite(projected)||projected<0))return
  const current=edit
  setEdit(null)
  act(async()=>{
   const {error}=await supabase.rpc('inv_update_investment_details',{
    p_investment_id:current.row.id,
    p_contract_number:normalized(current.contract_number),
    p_projected_gain:projected,
    p_payment_place:normalized(current.payment_place),
    p_payment_method:normalized(current.payment_method),
    p_notes:normalized(current.notes),
   })
   if(error)throw error
  },'Datos operativos de la inversión actualizados.')
 }

 return <section className="prst-investment-module">
  <section className="prst-investor-summary prst-investment-summary">
   <article><span>Inversiones activas</span><strong>{summary.active}</strong><small>vigentes</small></article>
   <article><span>Capital activo</span><strong>{money(summary.capital)}</strong><small>formalizado</small></article>
   <article><span>Ganancia proyectada</span><strong>{summary.projected?money(summary.projected):'—'}</strong><small>sin fórmula automática aún</small></article>
   <article><span>Vencen en 30 días</span><strong>{summary.next30}</strong><small>requieren seguimiento</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-investment-form" onSubmit={submit}>
    <div className="prst-card-head">
     <div><small>FORMALIZACIÓN</small><h2>Activar inversión</h2><p>La inversión nace únicamente de una solicitud que ya recibió los fondos.</p></div>
    </div>

    {!canManage&&<div className="prst-note">Tu rol es de consulta. Solo propietario o administrador puede formalizar inversiones.</div>}

    <Field label="Solicitud lista para formalizar *">
     <select value={form.application_id} onChange={e=>choose(e.target.value)} required disabled={!canManage}>
      <option value="">Seleccionar solicitud</option>
      {eligible.map(row=><option key={row.id} value={row.id}>{row.application_code||'Solicitud'} · {fullName(investorMap.get(row.investor_id))} · {money(row.approved_amount??row.requested_amount)} · {row.approved_term_months??row.requested_term_months} meses</option>)}
     </select>
    </Field>

    {selectedApplication&&<FormalizationSnapshot application={selectedApplication} investor={investorMap.get(selectedApplication.investor_id)}/>}

    <div className="prst-form-grid">
     <Field label="Fecha de otorgamiento *"><input type="date" value={form.granted_at} onChange={e=>setForm({...form,granted_at:e.target.value})} required disabled={!canManage}/></Field>
     <Field label="Número de contrato"><input value={form.contract_number} onChange={e=>setForm({...form,contract_number:e.target.value})} disabled={!canManage} placeholder="Puede completarse después"/></Field>
     <Field label="Ganancia proyectada" hint="Manual hasta que definamos la fórmula real de Prestadito$."><input type="number" min="0" step="0.01" value={form.projected_gain} onChange={e=>setForm({...form,projected_gain:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Lugar de pago"><input value={form.payment_place} onChange={e=>setForm({...form,payment_place:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Forma de pago" className="span-2"><input value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})} disabled={!canManage}/></Field>
    </div>

    <div className="prst-note"><strong>Protección:</strong> el capital y el plazo vienen de la aprobación y no se pueden cambiar aquí. El vencimiento se calcula automáticamente y la solicitud solo puede convertirse en inversión una vez.</div>
    <button className="prst-primary" disabled={saving||!canManage||!form.application_id}>{saving?'Formalizando…':'Formalizar inversión'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>PORTAFOLIO</small><h2>Inversiones</h2><p>Control de capital, vigencia, contrato y pagos asociados.</p></div></div>
    <div className="prst-directory-tools prst-investment-tools">
     <input className="prst-search" placeholder="Buscar código, contrato, inversionista, DUI o solicitud" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
      <option value="ALL">Todos los estados</option>
      <option value="ACTIVE">Activas</option>
      <option value="MATURING">Próximas a vencer</option>
      <option value="MATURED">Vencidas</option>
      <option value="RENEWED">Renovadas</option>
      <option value="CLOSED">Cerradas</option>
      <option value="CANCELLED">Canceladas</option>
     </select>
     <select value={maturityFilter} onChange={e=>setMaturityFilter(e.target.value)}>
      <option value="ALL">Todos los vencimientos</option>
      <option value="30">Vencen en 30 días</option>
      <option value="90">Vencen en 90 días</option>
      <option value="OVERDUE">Ya vencidas</option>
     </select>
     <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
    </div>

    {!filtered.length?<Empty title="Sin inversiones para mostrar">Formalizá una solicitud o cambiá los filtros.</Empty>:<div className="prst-table-wrap"><table className="prst-investment-table">
     <thead><tr><th>Inversión</th><th>Inversionista</th><th>Capital</th><th>Vigencia</th><th>Ganancia</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>{filtered.map(row=>{
      const investor=investorMap.get(row.investor_id)
      const d=daysUntil(row.maturity_date)
      const status=effectiveStatus(row)
      return <tr key={row.id}>
       <td><b>{row.investment_code}</b><small>{row.contract_number?`Contrato ${row.contract_number}`:'Contrato pendiente'}</small></td>
       <td><b>{fullName(investor)}</b><small>DUI {investor?.dui||'—'}</small></td>
       <td><b>{money(row.principal)}</b><small>{row.term_months} meses</small></td>
       <td><b>{date(row.granted_at)} → {date(row.maturity_date)}</b><small className={d!==null&&d<=30?'prst-danger-text':''}>{d===null?'—':d<0?`${Math.abs(d)} días vencida`:`${d} días restantes`}</small></td>
       <td><b>{row.projected_gain==null?'Pendiente':money(row.projected_gain)}</b><small>{row.projected_gain==null?'Fórmula aún no definida':'Proyección registrada'}</small></td>
       <td><b>{row.payment_place||'Pendiente'}</b><small>{row.payment_method||'Forma pendiente'}</small></td>
       <td><Status value={status}/></td>
       <td><div className="prst-row-actions"><button type="button" onClick={()=>setSelectedId(row.id)}>Ver</button>{canManage&&<button type="button" onClick={()=>openEdit(row)}>Editar</button>}</div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </article>
  </section>

  {selected&&<InvestmentDetail
   investment={selected}
   application={applications.find(x=>x.id===selected.application_id)}
   investor={investorMap.get(selected.investor_id)}
   beneficiaries={beneficiaries.filter(x=>x.investor_id===selected.investor_id&&x.active!==false)}
   payments={payments.filter(x=>x.investment_id===selected.id)}
   canManage={canManage}
   onClose={()=>setSelectedId('')}
   onEdit={()=>{setSelectedId('');openEdit(selected)}}
  />}

  {edit&&<InvestmentEditModal edit={edit} setEdit={setEdit} onSubmit={submitEdit} saving={saving}/>}
 </section>
}

function FormalizationSnapshot({application,investor}){
 const amount=Number(application.approved_amount??application.requested_amount)
 const term=Number(application.approved_term_months??application.requested_term_months)
 return <div className="prst-formalization-snapshot">
  <div><span>Inversionista</span><strong>{fullName(investor)}</strong><small>{investor?.investor_code||'—'} · DUI {investor?.dui||'—'}</small></div>
  <div><span>Capital aprobado</span><strong>{money(amount)}</strong><small>Solicitud {application.application_code||'—'}</small></div>
  <div><span>Plazo aprobado</span><strong>{term} meses</strong><small>No editable al formalizar</small></div>
  <div><span>Forma de pago</span><strong>{application.payment_method||'Pendiente'}</strong><small>{application.payment_place||'Lugar pendiente'}</small></div>
 </div>
}

function InvestmentDetail({investment,application,investor,beneficiaries,payments,canManage,onClose,onEdit}){
 const status=effectiveStatus(investment)
 const d=daysUntil(investment.maturity_date)
 const yieldPaid=payments.filter(x=>x.payment_type==='YIELD').reduce((sum,x)=>sum+Number(x.amount||0),0)
 const capitalReturned=payments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((sum,x)=>sum+Number(x.amount||0),0)
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="prst-investor-modal prst-investment-modal">
   <header>
    <div><small>EXPEDIENTE DE INVERSIÓN</small><h2>{investment.investment_code}</h2><p>{fullName(investor)} · {STATUS_LABELS[status]||status}</p></div>
    <button type="button" onClick={onClose}>×</button>
   </header>

   <section className="prst-profile-metrics">
    <article><span>Capital</span><strong>{money(investment.principal)}</strong></article>
    <article><span>Plazo</span><strong>{investment.term_months} meses</strong></article>
    <article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong></article>
    <article><span>Vencimiento</span><strong>{date(investment.maturity_date)}</strong></article>
   </section>

   <div className="prst-profile-grid">
    <article><small>Inversionista</small><b>{fullName(investor)}</b><span>{investor?.investor_code||'—'} · DUI {investor?.dui||'—'}</span><span>{investor?.phone||investor?.whatsapp||'Sin teléfono'}</span></article>
    <article><small>Origen</small><b>{application?.application_code||'Solicitud no disponible'}</b><span>Otorgada: {date(investment.granted_at)}</span><span>Vence: {date(investment.maturity_date)}{d!==null?` · ${d<0?Math.abs(d)+' días vencida':d+' días restantes'}`:''}</span></article>
    <article><small>Contrato</small><b>{investment.contract_number||'Número pendiente'}</b><span>Estado: {STATUS_LABELS[status]||status}</span><span>Ganancia proyectada: {investment.projected_gain==null?'Pendiente':money(investment.projected_gain)}</span></article>
    <article><small>Pago</small><b>{investment.payment_place||'Lugar pendiente'}</b><span>{investment.payment_method||'Forma pendiente'}</span><span>Capital devuelto registrado: {money(capitalReturned)}</span></article>
   </div>

   <div className="prst-section-title">Beneficiarios del inversionista</div>
   {!beneficiaries.length?<Empty title="Sin beneficiarios registrados"/>:<div className="prst-compact-list">{beneficiaries.map(row=><div key={row.id}><span><b>{row.full_name}</b><small>{row.relationship||'Relación pendiente'}</small></span><strong>{Number(row.percentage||0).toFixed(2)}%</strong></div>)}</div>}

   <div className="prst-section-title">Historial de pagos de esta inversión</div>
   {!payments.length?<Empty title="Aún no hay pagos registrados"/>:<div className="prst-table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Lugar</th><th>Referencia</th></tr></thead><tbody>{payments.map(row=><tr key={row.id}><td>{date(row.payment_date)}</td><td>{row.payment_type==='YIELD'?'Rendimiento':row.payment_type==='CAPITAL_RETURN'?'Devolución de capital':'Ajuste'}</td><td><b>{money(row.amount)}</b></td><td><b>{row.payment_place||'—'}</b><small>{row.payment_method||'—'}</small></td><td>{row.reference||'—'}</td></tr>)}</tbody></table></div>}

   <div className="prst-modal-actions"><button type="button" onClick={onClose}>Cerrar</button>{canManage&&<button type="button" className="primary" onClick={onEdit}>Editar datos operativos</button>}</div>
  </section>
 </div>
}

function InvestmentEditModal({edit,setEdit,onSubmit,saving}){
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setEdit(null)}>
  <form className="prst-decision-modal" onSubmit={onSubmit}>
   <header><div><small>DATOS OPERATIVOS</small><h2>Editar inversión</h2><p>{edit.row.investment_code}</p></div><button type="button" onClick={()=>setEdit(null)} disabled={saving}>×</button></header>
   <div className="prst-form-grid">
    <Field label="Número de contrato"><input value={edit.contract_number} onChange={e=>setEdit({...edit,contract_number:e.target.value})}/></Field>
    <Field label="Ganancia proyectada" hint="Manual hasta definir la fórmula."><input type="number" min="0" step="0.01" value={edit.projected_gain} onChange={e=>setEdit({...edit,projected_gain:e.target.value})}/></Field>
    <Field label="Lugar de pago"><input value={edit.payment_place} onChange={e=>setEdit({...edit,payment_place:e.target.value})}/></Field>
    <Field label="Forma de pago"><input value={edit.payment_method} onChange={e=>setEdit({...edit,payment_method:e.target.value})}/></Field>
   </div>
   <Field label="Motivo / nota del cambio" hint="Quedará registrado en auditoría."><textarea value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})} placeholder="Ej. Se asignó número de contrato o cambió lugar de pago."/></Field>
   <div className="prst-note"><strong>No editable:</strong> capital, plazo, fecha de otorgamiento y vencimiento se conservan como fueron formalizados.</div>
   <div className="prst-modal-actions"><button type="button" onClick={()=>setEdit(null)} disabled={saving}>Cancelar</button><button type="submit" className="primary" disabled={saving}>{saving?'Guardando…':'Guardar cambios'}</button></div>
  </form>
 </div>
}
