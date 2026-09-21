import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const normalized=value=>String(value||'').trim()
const startOfMonth=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10)}

const TYPE_LABELS={YIELD:'Rendimiento',CAPITAL_RETURN:'Devolución de capital',ADJUSTMENT:'Ajuste autorizado'}

function Field({label,children,hint,className=''}){return <label className={`prst-field ${className}`.trim()}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosPaymentsPanel({company,role,settings,investments,payments,investorMap,saving,act}){
 const normalizedRole=String(role||'').toLowerCase()
 const paymentMethods=Array.isArray(settings?.payment_methods)?settings.payment_methods:[]
 const paymentPlaces=Array.isArray(settings?.payment_places)?settings.payment_places:[]
 const canManage=['owner','admin'].includes(normalizedRole)
 const usableInvestments=useMemo(()=>investments.filter(x=>x.status!=='CANCELLED'),[investments])
 const [form,setForm]=useState({investment_id:'',payment_type:'YIELD',amount:'',payment_date:today(),payment_place:'',payment_method:'',reference:'',notes:''})
 const [search,setSearch]=useState('')
 const [typeFilter,setTypeFilter]=useState('ALL')
 const [statusFilter,setStatusFilter]=useState('POSTED')
 const [fromDate,setFromDate]=useState('')
 const [toDate,setToDate]=useState('')
 const [reverse,setReverse]=useState(null)
 const [selectedInvestmentId,setSelectedInvestmentId]=useState('')

 useEffect(()=>{
  if(!form.investment_id&&usableInvestments[0]){
   const row=usableInvestments[0]
   setForm(current=>({...current,investment_id:row.id,payment_place:row.payment_place||'',payment_method:row.payment_method||''}))
  }
 },[usableInvestments,form.investment_id])

 const paymentRows=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return payments.filter(row=>{
   if(typeFilter!=='ALL'&&row.payment_type!==typeFilter)return false
   if(statusFilter!=='ALL'&&(row.status||'POSTED')!==statusFilter)return false
   if(fromDate&&String(row.payment_date)<fromDate)return false
   if(toDate&&String(row.payment_date)>toDate)return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   const investment=investments.find(x=>x.id===row.investment_id)
   return `${row.payment_code||''} ${fullName(investor)} ${investor?.dui||''} ${investment?.investment_code||''} ${row.reference||''} ${row.payment_place||''}`.toLowerCase().includes(term)
  })
 },[payments,investments,investorMap,search,typeFilter,statusFilter,fromDate,toDate])

 const posted=payments.filter(x=>(x.status||'POSTED')==='POSTED')
 const monthStart=startOfMonth()
 const summary=useMemo(()=>({
  yieldPaid:posted.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0),
  capitalReturned:posted.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0),
  monthPaid:posted.filter(x=>String(x.payment_date)>=monthStart).reduce((s,x)=>s+Number(x.amount||0),0),
  reversed:payments.filter(x=>x.status==='REVERSED').length,
 }),[payments,posted,monthStart])

 const selectInvestment=id=>{
  const row=investments.find(x=>x.id===id)
  setForm({...form,investment_id:id,payment_place:row?.payment_place||'',payment_method:row?.payment_method||''})
 }

 const selectedInvestment=investments.find(x=>x.id===form.investment_id)||null
 const selectedInvestor=selectedInvestment?investorMap.get(selectedInvestment.investor_id):null
 const selectedPostedPayments=selectedInvestment?posted.filter(x=>x.investment_id===selectedInvestment.id):[]
 const capitalReturned=selectedPostedPayments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 const yieldPaid=selectedPostedPayments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const outstandingCapital=selectedInvestment?Math.max(0,Number(selectedInvestment.principal||0)-capitalReturned):0
 const projectedPending=selectedInvestment?.projected_gain==null?null:Math.max(0,Number(selectedInvestment.projected_gain||0)-yieldPaid)

 const submit=e=>{
  e.preventDefault()
  if(!canManage)return
  act(async()=>{
   const investment=investments.find(x=>x.id===form.investment_id)
   if(!investment)throw new Error('Seleccioná una inversión.')
   const amount=Number(form.amount)
   if(!Number.isFinite(amount)||amount<=0)throw new Error('Ingresá un monto válido.')
   if(form.payment_type==='CAPITAL_RETURN'&&amount>outstandingCapital)throw new Error('La devolución supera el capital pendiente de esta inversión.')
   const {error}=await supabase.rpc('inv_record_payment',{
    p_investment_id:investment.id,
    p_payment_type:form.payment_type,
    p_amount:amount,
    p_payment_date:form.payment_date,
    p_payment_place:normalized(form.payment_place),
    p_payment_method:normalized(form.payment_method),
    p_reference:normalized(form.reference),
    p_notes:normalized(form.notes),
   })
   if(error)throw error
   setForm({...form,amount:'',reference:'',notes:''})
  },'Pago registrado en el libro del inversionista.')
 }

 const submitReverse=e=>{
  e.preventDefault()
  if(!reverse||!canManage)return
  const reason=normalized(reverse.reason)
  if(!reason)return
  const current=reverse
  setReverse(null)
  act(async()=>{
   const {error}=await supabase.rpc('inv_reverse_payment',{p_payment_id:current.row.id,p_reason:reason})
   if(error)throw error
  },'Pago revertido. El registro original permanece visible para auditoría.')
 }

 const selectedLedger=selectedInvestmentId?payments.filter(x=>x.investment_id===selectedInvestmentId):[]
 const selectedLedgerInvestment=investments.find(x=>x.id===selectedInvestmentId)||null

 return <section className="prst-payment-module">
  <datalist id="prst-payment-place-options">{paymentPlaces.map(value=><option key={value} value={value}/>)}</datalist>
  <datalist id="prst-payment-method-options">{paymentMethods.map(value=><option key={value} value={value}/>)}</datalist>
  <section className="prst-investor-summary prst-payment-summary">
   <article><span>Rendimientos pagados</span><strong>{money(summary.yieldPaid)}</strong><small>pagos vigentes</small></article>
   <article><span>Capital devuelto</span><strong>{money(summary.capitalReturned)}</strong><small>devoluciones registradas</small></article>
   <article><span>Pagado este mes</span><strong>{money(summary.monthPaid)}</strong><small>todo tipo de pago</small></article>
   <article><span>Pagos revertidos</span><strong>{summary.reversed}</strong><small>con trazabilidad</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form prst-payment-form" onSubmit={submit}>
    <div className="prst-card-head"><div><small>NUEVO MOVIMIENTO</small><h2>Registrar pago al inversionista</h2><p>Rendimientos, devolución de capital o ajustes autorizados.</p></div></div>
    {!canManage&&<div className="prst-note">Tu rol es de consulta. Solo propietario o administrador puede registrar o revertir pagos.</div>}

    <Field label="Inversión *"><select value={form.investment_id} onChange={e=>selectInvestment(e.target.value)} required disabled={!canManage}><option value="">Seleccionar inversión</option>{usableInvestments.map(x=><option key={x.id} value={x.id}>{x.investment_code} · {fullName(investorMap.get(x.investor_id))} · {money(x.principal)}</option>)}</select></Field>

    {selectedInvestment&&<div className="prst-payment-snapshot">
     <div><span>Inversionista</span><strong>{fullName(selectedInvestor)}</strong><small>{selectedInvestment.investment_code}</small></div>
     <div><span>Capital pendiente</span><strong>{money(outstandingCapital)}</strong><small>de {money(selectedInvestment.principal)}</small></div>
     <div><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>{projectedPending==null?'Proyección no definida':`Proyección pendiente ${money(projectedPending)}`}</small></div>
    </div>}

    <div className="prst-form-grid">
     <Field label="Tipo de pago *"><select value={form.payment_type} onChange={e=>setForm({...form,payment_type:e.target.value})} disabled={!canManage}><option value="YIELD">Rendimiento</option><option value="CAPITAL_RETURN">Devolución de capital</option><option value="ADJUSTMENT">Ajuste autorizado</option></select></Field>
     <Field label="Monto *"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required disabled={!canManage}/></Field>
     <Field label="Fecha *"><input type="date" value={form.payment_date} onChange={e=>setForm({...form,payment_date:e.target.value})} required disabled={!canManage}/></Field>
     <Field label="Lugar de pago"><input list="prst-payment-place-options" value={form.payment_place} onChange={e=>setForm({...form,payment_place:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Forma de pago"><input list="prst-payment-method-options" value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})} disabled={!canManage}/></Field>
     <Field label="Referencia"><input value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} disabled={!canManage} placeholder="Transferencia, recibo, comprobante..."/></Field>
    </div>
    <Field label="Notas"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} disabled={!canManage}/></Field>
    <div className="prst-note"><strong>Rendimiento:</strong> el sistema todavía no calcula automáticamente cuánto corresponde pagar. Los pagos de rendimiento se registran según la regla real de Prestadito$ cuando nos la definas.</div>
    <button className="prst-primary" disabled={saving||!canManage||!form.investment_id}>{saving?'Registrando…':'Registrar pago'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>LIBRO DE PAGOS</small><h2>Movimientos al inversionista</h2><p>Ningún pago se elimina: si hay un error se revierte con motivo.</p></div></div>
    <div className="prst-directory-tools prst-payment-tools">
     <input className="prst-search" placeholder="Buscar pago, inversionista, DUI, inversión o referencia" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="ALL">Todos los tipos</option><option value="YIELD">Rendimientos</option><option value="CAPITAL_RETURN">Capital</option><option value="ADJUSTMENT">Ajustes</option></select>
     <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="POSTED">Vigentes</option><option value="REVERSED">Revertidos</option><option value="ALL">Todos</option></select>
     <span>{paymentRows.length} resultado{paymentRows.length===1?'':'s'}</span>
    </div>
    <div className="prst-date-filters"><Field label="Desde"><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></Field><Field label="Hasta"><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></Field>{(fromDate||toDate)&&<button type="button" onClick={()=>{setFromDate('');setToDate('')}}>Limpiar fechas</button>}</div>

    {!paymentRows.length?<Empty title="Sin pagos para mostrar">Registrá un pago o cambiá los filtros.</Empty>:<div className="prst-table-wrap"><table className="prst-payment-table">
     <thead><tr><th>Pago</th><th>Inversionista</th><th>Inversión</th><th>Tipo</th><th>Monto</th><th>Pago</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>{paymentRows.map(row=>{
      const investor=investorMap.get(row.investor_id)
      const investment=investments.find(x=>x.id===row.investment_id)
      const status=row.status||'POSTED'
      return <tr key={row.id} className={status==='REVERSED'?'prst-row-reversed':''}>
       <td><b>{row.payment_code||'Código pendiente'}</b><small>{date(row.payment_date)}</small></td>
       <td><b>{fullName(investor)}</b><small>DUI {investor?.dui||'—'}</small></td>
       <td><b>{investment?.investment_code||'—'}</b><small>{investment?.contract_number?`Contrato ${investment.contract_number}`:'Contrato pendiente'}</small></td>
       <td>{TYPE_LABELS[row.payment_type]||row.payment_type}</td>
       <td><b>{money(row.amount)}</b></td>
       <td><b>{row.payment_place||'—'}</b><small>{row.payment_method||'—'}{row.reference?` · ${row.reference}`:''}</small></td>
       <td><span className={`prst-status ${status==='POSTED'?'active':'rejected'}`}>{status==='POSTED'?'Vigente':'Revertido'}</span>{status==='REVERSED'&&<small>{row.reversal_reason||'Sin motivo'}</small>}</td>
       <td><div className="prst-row-actions"><button type="button" onClick={()=>setSelectedInvestmentId(row.investment_id)}>Historial</button>{canManage&&status==='POSTED'&&<button type="button" className="danger" onClick={()=>setReverse({row,reason:''})}>Revertir</button>}</div></td>
      </tr>
     })}</tbody>
    </table></div>}
   </article>
  </section>

  {selectedLedgerInvestment&&<LedgerModal investment={selectedLedgerInvestment} payments={selectedLedger} investor={investorMap.get(selectedLedgerInvestment.investor_id)} onClose={()=>setSelectedInvestmentId('')}/>}
  {reverse&&<ReverseModal reverse={reverse} setReverse={setReverse} onSubmit={submitReverse} saving={saving}/>}
 </section>
}

function LedgerModal({investment,payments,investor,onClose}){
 const posted=payments.filter(x=>(x.status||'POSTED')==='POSTED')
 const yieldPaid=posted.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const capitalReturned=posted.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="prst-investor-modal prst-payment-modal">
   <header><div><small>HISTORIAL DE PAGOS</small><h2>{investment.investment_code}</h2><p>{fullName(investor)}</p></div><button type="button" onClick={onClose}>×</button></header>
   <section className="prst-profile-metrics"><article><span>Capital</span><strong>{money(investment.principal)}</strong></article><article><span>Capital devuelto</span><strong>{money(capitalReturned)}</strong></article><article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong></article><article><span>Movimientos</span><strong>{payments.length}</strong></article></section>
   {!payments.length?<Empty title="Sin movimientos"/>:<div className="prst-table-wrap"><table><thead><tr><th>Fecha</th><th>Código</th><th>Tipo</th><th>Monto</th><th>Referencia</th><th>Estado</th></tr></thead><tbody>{payments.map(row=><tr key={row.id}><td>{date(row.payment_date)}</td><td>{row.payment_code||'—'}</td><td>{TYPE_LABELS[row.payment_type]||row.payment_type}</td><td><b>{money(row.amount)}</b></td><td>{row.reference||'—'}</td><td>{row.status==='REVERSED'?<span className="prst-status rejected">Revertido</span>:<span className="prst-status active">Vigente</span>}</td></tr>)}</tbody></table></div>}
   <div className="prst-modal-actions"><button type="button" onClick={onClose}>Cerrar</button></div>
  </section>
 </div>
}

function ReverseModal({reverse,setReverse,onSubmit,saving}){
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setReverse(null)}>
  <form className="prst-decision-modal" onSubmit={onSubmit}>
   <header><div><small>REVERSIÓN</small><h2>Revertir pago</h2><p>{reverse.row.payment_code} · {money(reverse.row.amount)}</p></div><button type="button" onClick={()=>setReverse(null)} disabled={saving}>×</button></header>
   <div className="prst-note"><strong>El pago no se eliminará.</strong> Quedará marcado como revertido y conservará su importe, fecha y referencia para auditoría.</div>
   <Field label="Motivo de la reversión *"><textarea autoFocus value={reverse.reason} onChange={e=>setReverse({...reverse,reason:e.target.value})} required placeholder="Ej. transferencia duplicada o referencia incorrecta."/></Field>
   <div className="prst-modal-actions"><button type="button" onClick={()=>setReverse(null)} disabled={saving}>Cancelar</button><button type="submit" className="danger" disabled={saving||!reverse.reason.trim()}>{saving?'Revirtiendo…':'Confirmar reversión'}</button></div>
  </form>
 </div>
}
