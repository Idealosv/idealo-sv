import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const daysUntil=value=>value?Math.ceil((new Date(`${value}T12:00:00`).getTime()-new Date(`${today()}T12:00:00`).getTime())/86400000):null
const normalized=value=>String(value||'').trim()

const DECISION_LABELS={
 RENEW_CAPITAL:'Renovar capital',
 RENEW_CAPITAL_YIELD:'Renovar capital + rendimiento',
 RENEW_CUSTOM:'Renovación personalizada',
 WITHDRAW:'Retirar / no renovar',
}

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosRenewalsPanel({
 company,
 role,
 settings,
 investments,
 payments,
 renewals,
 investorMap,
 saving,
 act,
 preselectedInvestmentId='',
 onHandled,
}){
 const canManage=['owner','admin'].includes(String(role||'').toLowerCase())
 const termOptions=Array.isArray(settings?.allowed_term_months)?settings.allowed_term_months:[]
 const paymentMethods=Array.isArray(settings?.payment_methods)?settings.payment_methods:[]
 const paymentPlaces=Array.isArray(settings?.payment_places)?settings.payment_places:[]
 const eligible=useMemo(()=>investments.filter(row=>{
  const d=daysUntil(row.maturity_date)
  return row.maturity_date&&d!==null&&d<=30&&!['CLOSED','CANCELLED','RENEWED'].includes(row.status)
 }),[investments])

 const [selectedInvestmentId,setSelectedInvestmentId]=useState('')
 const [form,setForm]=useState({decision_type:'RENEW_CAPITAL',renewal_amount:'',renewal_term_months:'',requested_start_date:'',payment_place:'',payment_method:'',notes:''})
 const [search,setSearch]=useState('')
 const [statusFilter,setStatusFilter]=useState('RECORDED')
 const [cancel,setCancel]=useState(null)

 useEffect(()=>{
  if(selectedInvestmentId)return
  const preferred=eligible.find(x=>x.id===preselectedInvestmentId)||eligible[0]
  if(preferred)setSelectedInvestmentId(preferred.id)
 },[eligible,selectedInvestmentId,preselectedInvestmentId])

 const selectedInvestment=investments.find(x=>x.id===selectedInvestmentId)||null
 const selectedInvestor=selectedInvestment?investorMap.get(selectedInvestment.investor_id):null
 const selectedRenewal=selectedInvestment?renewals.find(x=>x.investment_id===selectedInvestment.id&&x.status==='RECORDED')||null:null
 const postedPayments=selectedInvestment?payments.filter(x=>x.investment_id===selectedInvestment.id&&(x.status||'POSTED')==='POSTED'):[]
 const capitalReturned=postedPayments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((sum,x)=>sum+Number(x.amount||0),0)
 const yieldPaid=postedPayments.filter(x=>x.payment_type==='YIELD').reduce((sum,x)=>sum+Number(x.amount||0),0)
 const capitalPending=selectedInvestment?Math.max(0,Number(selectedInvestment.principal||0)-capitalReturned):0
 const projectedYieldPending=selectedInvestment?.projected_gain==null?null:Math.max(0,Number(selectedInvestment.projected_gain||0)-yieldPaid)

 useEffect(()=>{
  if(!selectedInvestment)return
  if(selectedRenewal){
   setForm({
    decision_type:selectedRenewal.decision_type,
    renewal_amount:selectedRenewal.renewal_amount==null?'':String(selectedRenewal.renewal_amount),
    renewal_term_months:selectedRenewal.renewal_term_months==null?'':String(selectedRenewal.renewal_term_months),
    requested_start_date:selectedRenewal.requested_start_date||selectedInvestment.maturity_date||'',
    payment_place:selectedRenewal.payment_place||selectedInvestment.payment_place||'',
    payment_method:selectedRenewal.payment_method||selectedInvestment.payment_method||'',
    notes:selectedRenewal.notes||'',
   })
  }else{
   setForm({
    decision_type:'RENEW_CAPITAL',
    renewal_amount:capitalPending?String(capitalPending):'',
    renewal_term_months:'',
    requested_start_date:selectedInvestment.maturity_date||'',
    payment_place:selectedInvestment.payment_place||'',
    payment_method:selectedInvestment.payment_method||'',
    notes:'',
   })
  }
 },[selectedInvestmentId,selectedRenewal?.id])

 const changeType=type=>{
  let amount=form.renewal_amount
  if(type==='RENEW_CAPITAL')amount=capitalPending?String(capitalPending):''
  if(type==='RENEW_CAPITAL_YIELD'&&projectedYieldPending!==null)amount=String(capitalPending+projectedYieldPending)
  if(type==='WITHDRAW')amount=''
  setForm({...form,decision_type:type,renewal_amount:amount,renewal_term_months:type==='WITHDRAW'?'':form.renewal_term_months,requested_start_date:type==='WITHDRAW'?'':form.requested_start_date})
 }

 const submit=e=>{
  e.preventDefault()
  if(!canManage||!selectedInvestment)return
  act(async()=>{
   const withdraw=form.decision_type==='WITHDRAW'
   const amount=withdraw?null:Number(form.renewal_amount)
   const term=withdraw?null:Number(form.renewal_term_months)
   if(!withdraw&&(!Number.isFinite(amount)||amount<=0))throw new Error('Ingresá el monto que se pretende renovar.')
   if(!withdraw&&(!Number.isInteger(term)||term<=0))throw new Error('Ingresá el nuevo plazo en meses.')
   const {error}=await supabase.rpc('inv_save_renewal_decision',{
    p_investment_id:selectedInvestment.id,
    p_decision_type:form.decision_type,
    p_renewal_amount:amount,
    p_renewal_term_months:term,
    p_requested_start_date:withdraw?null:(form.requested_start_date||null),
    p_payment_place:normalized(form.payment_place),
    p_payment_method:normalized(form.payment_method),
    p_notes:normalized(form.notes),
   })
   if(error)throw error
   onHandled?.()
  },selectedRenewal?'Decisión de vencimiento actualizada.':'Decisión de vencimiento registrada.')
 }

 const submitCancel=e=>{
  e.preventDefault()
  if(!cancel)return
  const reason=normalized(cancel.reason)
  if(!reason)return
  const current=cancel
  setCancel(null)
  act(async()=>{
   const {error}=await supabase.rpc('inv_cancel_renewal_decision',{p_renewal_id:current.row.id,p_reason:reason})
   if(error)throw error
  },'Decisión cancelada. El historial se conserva.')
 }

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return renewals.filter(row=>{
   if(statusFilter!=='ALL'&&row.status!==statusFilter)return false
   if(!term)return true
   const investment=investments.find(x=>x.id===row.investment_id)
   const investor=investorMap.get(row.investor_id)
   return `${row.renewal_code||''} ${DECISION_LABELS[row.decision_type]||''} ${investment?.investment_code||''} ${fullName(investor)} ${investor?.dui||''}`.toLowerCase().includes(term)
  }).sort((a,b)=>String(b.decided_at||'').localeCompare(String(a.decided_at||'')))
 },[renewals,investments,investorMap,search,statusFilter])

 const summary=useMemo(()=>({
  pending:eligible.length,
  recorded:renewals.filter(x=>x.status==='RECORDED').length,
  withdraw:renewals.filter(x=>x.status==='RECORDED'&&x.decision_type==='WITHDRAW').length,
  renew:renewals.filter(x=>x.status==='RECORDED'&&x.decision_type!=='WITHDRAW').length,
 }),[eligible,renewals])

 return <section className="prst-renewal-module">
  <datalist id="prst-renewal-term-options">{termOptions.map(value=><option key={value} value={value}/>)}</datalist>
  <datalist id="prst-renewal-place-options">{paymentPlaces.map(value=><option key={value} value={value}/>)}</datalist>
  <datalist id="prst-renewal-method-options">{paymentMethods.map(value=><option key={value} value={value}/>)}</datalist>
  <section className="prst-investor-summary prst-renewal-summary">
   <article><span>Por gestionar</span><strong>{summary.pending}</strong><small>vencidas o ≤30 días</small></article>
   <article><span>Decisiones registradas</span><strong>{summary.recorded}</strong><small>pendientes de ejecución</small></article>
   <article><span>Intención de renovar</span><strong>{summary.renew}</strong><small>capital / personalizada</small></article>
   <article><span>No renovar</span><strong>{summary.withdraw}</strong><small>retiro registrado</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-renewal-form" onSubmit={submit}>
    <div className="prst-card-head"><div><small>DECISIÓN AL VENCIMIENTO</small><h2>Gestionar renovación</h2><p>Registra la decisión del inversionista sin crear una nueva inversión automáticamente.</p></div></div>

    {!canManage&&<div className="prst-note">Tu rol es de consulta. Solo propietario o administrador puede registrar decisiones de renovación.</div>}

    <Field label="Inversión *"><select value={selectedInvestmentId} onChange={e=>setSelectedInvestmentId(e.target.value)} disabled={!canManage} required><option value="">Seleccionar</option>{eligible.map(row=><option key={row.id} value={row.id}>{row.investment_code} · {fullName(investorMap.get(row.investor_id))} · vence {date(row.maturity_date)}</option>)}</select></Field>

    {selectedInvestment&&<div className="prst-formalization-snapshot">
     <div><span>Inversionista</span><strong>{fullName(selectedInvestor)}</strong><small>DUI {selectedInvestor?.dui||'—'}</small></div>
     <div><span>Capital pendiente</span><strong>{money(capitalPending)}</strong><small>capital original {money(selectedInvestment.principal)}</small></div>
     <div><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>{projectedYieldPending==null?'proyección no definida':`proyección pendiente ${money(projectedYieldPending)}`}</small></div>
     <div><span>Vencimiento</span><strong>{date(selectedInvestment.maturity_date)}</strong><small>{daysUntil(selectedInvestment.maturity_date)<0?`${Math.abs(daysUntil(selectedInvestment.maturity_date))} días vencida`:`${daysUntil(selectedInvestment.maturity_date)} días restantes`}</small></div>
    </div>}

    <Field label="Decisión *"><select value={form.decision_type} onChange={e=>changeType(e.target.value)} disabled={!canManage||!selectedInvestment}>
     <option value="RENEW_CAPITAL">Renovar capital</option>
     <option value="RENEW_CAPITAL_YIELD">Renovar capital + rendimiento</option>
     <option value="RENEW_CUSTOM">Renovación personalizada</option>
     <option value="WITHDRAW">Retirar / no renovar</option>
    </select></Field>

    {form.decision_type!=='WITHDRAW'&&<div className="prst-form-grid">
     <Field label="Monto que se pretende renovar *"><input type="number" min="0.01" step="0.01" value={form.renewal_amount} onChange={e=>setForm({...form,renewal_amount:e.target.value})} required disabled={!canManage}/></Field>
     <Field label="Nuevo plazo *"><div className="prst-input-suffix"><input type="number" min="1" max="240" step="1" list="prst-renewal-term-options" value={form.renewal_term_months} onChange={e=>setForm({...form,renewal_term_months:e.target.value})} required disabled={!canManage}/><span>meses</span></div></Field>
     <Field label="Inicio solicitado"><input type="date" value={form.requested_start_date} onChange={e=>setForm({...form,requested_start_date:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Lugar de pago"><input list="prst-renewal-place-options" value={form.payment_place} onChange={e=>setForm({...form,payment_place:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Forma de pago" className="span-2"><input list="prst-renewal-method-options" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})} disabled={!canManage}/></Field>
    </div>}

    <Field label="Observaciones / instrucciones"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} disabled={!canManage} placeholder="Condiciones conversadas con el inversionista."/></Field>

    {form.decision_type==='RENEW_CAPITAL_YIELD'&&<div className="prst-note"><strong>Importante:</strong> el monto mostrado es solo una referencia basada en la proyección registrada. Como aún no hemos definido la fórmula real de rendimiento de Prestadito$, confirmá manualmente el monto antes de guardar.</div>}
    <div className="prst-note"><strong>Esta etapa solo registra la decisión.</strong> No cierra la inversión anterior ni crea una nueva automáticamente. La ejecución final se habilitará cuando definamos las reglas exactas de renovación y rendimiento.</div>
    <button className="prst-primary" disabled={saving||!canManage||!selectedInvestment}>{saving?'Guardando…':selectedRenewal?'Actualizar decisión':'Guardar decisión'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>HISTORIAL</small><h2>Decisiones de renovación</h2><p>Trazabilidad de lo indicado por cada inversionista.</p></div></div>
    <div className="prst-directory-tools prst-renewal-tools">
     <input className="prst-search" placeholder="Buscar código, inversión, inversionista o DUI" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="RECORDED">Registradas</option><option value="CANCELLED">Canceladas</option><option value="EXECUTED">Ejecutadas</option><option value="ALL">Todas</option></select>
     <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
    </div>

    {!filtered.length?<Empty title="Sin decisiones para mostrar"/>:<div className="prst-table-wrap"><table className="prst-renewal-table">
     <thead><tr><th>Decisión</th><th>Inversionista</th><th>Inversión</th><th>Acción</th><th>Monto / plazo</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>{filtered.map(row=>{
      const investment=investments.find(x=>x.id===row.investment_id)
      const investor=investorMap.get(row.investor_id)
      return <tr key={row.id}>
       <td><b>{row.renewal_code}</b><small>{date(row.decided_at)}</small></td>
       <td><b>{fullName(investor)}</b><small>DUI {investor?.dui||'—'}</small></td>
       <td><b>{investment?.investment_code||'—'}</b><small>vence {date(investment?.maturity_date)}</small></td>
       <td>{DECISION_LABELS[row.decision_type]||row.decision_type}</td>
       <td>{row.decision_type==='WITHDRAW'?<b>No aplica</b>:<><b>{money(row.renewal_amount)}</b><small>{row.renewal_term_months} meses</small></>}</td>
       <td><span className={`prst-status ${row.status==='RECORDED'?'review':row.status==='CANCELLED'?'rejected':'active'}`}>{row.status==='RECORDED'?'Registrada':row.status==='CANCELLED'?'Cancelada':'Ejecutada'}</span>{row.status==='CANCELLED'&&<small>{row.cancel_reason}</small>}</td>
       <td><div className="prst-row-actions">{row.status==='RECORDED'&&canManage&&<><button type="button" onClick={()=>setSelectedInvestmentId(row.investment_id)}>Editar</button><button type="button" className="danger" onClick={()=>setCancel({row,reason:''})}>Cancelar</button></>}</div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </article>
  </section>

  {cancel&&<div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setCancel(null)}>
   <form className="prst-decision-modal" onSubmit={submitCancel}>
    <header><div><small>CANCELAR DECISIÓN</small><h2>{cancel.row.renewal_code}</h2><p>La decisión quedará en el historial.</p></div><button type="button" onClick={()=>setCancel(null)} disabled={saving}>×</button></header>
    <Field label="Motivo *"><textarea autoFocus value={cancel.reason} onChange={e=>setCancel({...cancel,reason:e.target.value})} required placeholder="Ej. el inversionista cambió su instrucción."/></Field>
    <div className="prst-modal-actions"><button type="button" onClick={()=>setCancel(null)}>Volver</button><button type="submit" className="danger" disabled={saving||!cancel.reason.trim()}>Confirmar cancelación</button></div>
   </form>
  </div>}
 </section>
}
