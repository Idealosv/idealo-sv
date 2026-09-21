import { useEffect, useMemo, useState } from 'react'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:String(value)+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const posted=x=>(x.status||'POSTED')==='POSTED'

const outstandingCapital=(investment,payments)=>{
 const returned=payments.filter(x=>posted(x)&&x.investment_id===investment.id&&x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 return Math.max(0,Number(investment.principal||0)-returned)
}

export default function PrestaditosInvestor360Panel({
 investors,
 applications,
 investments,
 contracts,
 beneficiaries,
 payments,
 documents,
 renewals,
 selectedInvestorId,
 selectedInvestmentId,
 onSelectInvestor,
 onNavigate,
}){
 const [localInvestorId,setLocalInvestorId]=useState(selectedInvestorId||'')

 useEffect(()=>{
  if(selectedInvestorId)setLocalInvestorId(selectedInvestorId)
  else if(!localInvestorId&&investors[0])setLocalInvestorId(investors[0].id)
 },[selectedInvestorId,investors,localInvestorId])

 const investor=investors.find(x=>x.id===localInvestorId)||null
 const investorInvestments=useMemo(()=>investments.filter(x=>x.investor_id===localInvestorId).sort((a,b)=>String(b.granted_at||'').localeCompare(String(a.granted_at||''))),[investments,localInvestorId])
 const investorApplications=useMemo(()=>applications.filter(x=>x.investor_id===localInvestorId).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),[applications,localInvestorId])
 const investorContracts=useMemo(()=>contracts.filter(x=>x.investor_id===localInvestorId).sort((a,b)=>String(b.generated_at||'').localeCompare(String(a.generated_at||''))),[contracts,localInvestorId])
 const investorBeneficiaries=useMemo(()=>beneficiaries.filter(x=>x.investor_id===localInvestorId&&x.active!==false),[beneficiaries,localInvestorId])
 const investorPayments=useMemo(()=>payments.filter(x=>x.investor_id===localInvestorId&&posted(x)).sort((a,b)=>String(b.payment_date||'').localeCompare(String(a.payment_date||''))),[payments,localInvestorId])
 const investorDocuments=useMemo(()=>documents.filter(x=>x.investor_id===localInvestorId&&x.status!=='INACTIVE').sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),[documents,localInvestorId])
 const investorRenewals=useMemo(()=>renewals.filter(x=>x.investor_id===localInvestorId).sort((a,b)=>String(b.decided_at||'').localeCompare(String(a.decided_at||''))),[renewals,localInvestorId])

 const currentInvestments=investorInvestments.filter(x=>!['CLOSED','CANCELLED','RENEWED'].includes(x.status))
 const activeCapital=currentInvestments.reduce((s,x)=>s+outstandingCapital(x,investorPayments),0)
 const yieldsPaid=investorPayments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const capitalReturned=investorPayments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 const nextMaturity=[...currentInvestments].filter(x=>x.maturity_date).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date)))[0]
 const selectedInvestment=investorInvestments.find(x=>x.id===selectedInvestmentId)||currentInvestments[0]||investorInvestments[0]||null

 const chooseInvestor=id=>{
  setLocalInvestorId(id)
  onSelectInvestor?.(id)
 }

 const go=(tab,investmentId=selectedInvestment?.id)=>onNavigate?.(tab,{investor_id:localInvestorId,investment_id:investmentId})

 if(!investors.length)return <section className="prst-card"><div className="prst-empty"><strong>Sin inversionistas registrados</strong><p>El Perfil 360 estará disponible cuando exista al menos un expediente.</p></div></section>

 return <section className="prst-profile360-module">
  <section className="prst-card prst-profile360-hero">
   <div className="prst-profile360-head">
    <div>
     <small>PERFIL 360</small>
     <h2>{investor?fullName(investor):'Seleccionar inversionista'}</h2>
     <p>{investor?.investor_code||'—'} · DUI {investor?.dui||'—'} · {investor?.status||'—'}</p>
    </div>
    <label className="prst-field prst-profile360-selector"><span>Cambiar inversionista</span><select value={localInvestorId} onChange={e=>chooseInvestor(e.target.value)}>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)} · {x.investor_code}</option>)}</select></label>
   </div>

   {investor&&<div className="prst-profile360-actions">
    <button type="button" onClick={()=>go('Estado de cuenta')}><b>Estado de cuenta</b><small>Resumen y PDF</small></button>
    <button type="button" onClick={()=>go('Contratos')} disabled={!selectedInvestment}><b>Contrato</b><small>{selectedInvestment?'Abrir inversión seleccionada':'Sin inversión'}</small></button>
    <button type="button" onClick={()=>go('Rendimientos')} disabled={!selectedInvestment}><b>Registrar pago</b><small>Rendimiento o capital</small></button>
    <button type="button" onClick={()=>go('Renovaciones')} disabled={!selectedInvestment}><b>Renovación</b><small>Gestionar vencimiento</small></button>
    <button type="button" onClick={()=>go('Documentos')}><b>Documentos</b><small>Expediente privado</small></button>
   </div>}
  </section>

  {investor&&<>
   <section className="prst-investor-summary prst-profile360-summary">
    <article><span>Capital vigente</span><strong>{money(activeCapital)}</strong><small>{currentInvestments.length} inversión{currentInvestments.length===1?'':'es'} vigente{currentInvestments.length===1?'':'s'}</small></article>
    <article><span>Rendimientos pagados</span><strong>{money(yieldsPaid)}</strong><small>pagos vigentes</small></article>
    <article><span>Capital devuelto</span><strong>{money(capitalReturned)}</strong><small>histórico registrado</small></article>
    <article><span>Próximo vencimiento</span><strong>{nextMaturity?date(nextMaturity.maturity_date):'—'}</strong><small>{nextMaturity?.investment_code||'sin vencimiento activo'}</small></article>
   </section>

   <section className="prst-grid two">
    <article className="prst-card">
     <div className="prst-card-head"><div><small>DATOS PERSONALES</small><h2>Expediente del inversionista</h2></div></div>
     <div className="prst-profile-grid">
      <article><small>Nombre</small><b>{fullName(investor)}</b><span>Nacimiento: {date(investor.birth_date)}</span></article>
      <article><small>DUI / NIT</small><b>{investor.dui||'—'}</b><span>{investor.nit||'Sin NIT'}</span></article>
      <article><small>Contacto</small><b>{investor.phone||investor.whatsapp||'—'}</b><span>{investor.email||'Sin correo'}</span></article>
      <article><small>Dirección</small><b>{investor.address||'—'}</b><span>{[investor.district,investor.department].filter(Boolean).join(', ')||'Sin ubicación detallada'}</span></article>
      <article><small>Emergencia</small><b>{investor.emergency_contact_name||'—'}</b><span>{investor.emergency_contact_phone||'Sin teléfono'}</span></article>
      <article><small>Documentación</small><b>{investor.face_photo_path&&investor.dui_front_path&&investor.dui_back_path?'Completa':'Pendiente'}</b><span>Rostro · DUI frente · DUI reverso</span></article>
     </div>
    </article>

    <article className="prst-card">
     <div className="prst-card-head"><div><small>EXPEDIENTE RELACIONADO</small><h2>Resumen de registros</h2></div></div>
     <div className="prst-profile360-counters">
      <div><span>Solicitudes</span><strong>{investorApplications.length}</strong></div>
      <div><span>Contratos</span><strong>{investorContracts.length}</strong></div>
      <div><span>Beneficiarios</span><strong>{investorBeneficiaries.length}</strong></div>
      <div><span>Documentos</span><strong>{investorDocuments.length}</strong></div>
      <div><span>Pagos</span><strong>{investorPayments.length}</strong></div>
      <div><span>Renovaciones</span><strong>{investorRenewals.length}</strong></div>
     </div>
     <div className="prst-section-title">Beneficiarios activos</div>
     {!investorBeneficiaries.length?<div className="prst-empty compact"><strong>Sin beneficiarios activos</strong></div>:<div className="prst-compact-list">{investorBeneficiaries.map(x=><div key={x.id}><span><b>{x.full_name}</b><small>{x.relationship||'Sin parentesco registrado'}</small></span><strong>{Number(x.percentage||0).toFixed(2)}%</strong></div>)}</div>}
    </article>
   </section>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>INVERSIONES</small><h2>Capital y vigencias</h2><p>Seleccioná una inversión para usarla en los accesos rápidos del Perfil 360.</p></div></div>
    <div className="prst-table-wrap"><table className="prst-profile360-table"><thead><tr><th>Inversión</th><th>Capital</th><th>Tasa anual</th><th>Inicio</th><th>Vence</th><th>Capital pendiente</th><th>Contrato</th><th>Estado</th><th></th></tr></thead><tbody>{investorInvestments.length?investorInvestments.map(inv=>{
     const contract=investorContracts.find(x=>x.investment_id===inv.id)
     const focused=inv.id===selectedInvestment?.id
     return <tr key={inv.id} className={focused?'focused':''}><td><b>{inv.investment_code}</b></td><td>{money(inv.principal)}</td><td>{inv.agreed_return_rate==null?'—':Number(inv.agreed_return_rate)+'% anual'}</td><td>{date(inv.granted_at)}</td><td>{date(inv.maturity_date)}</td><td><b>{money(outstandingCapital(inv,investorPayments))}</b></td><td>{contract?.status==='SIGNED'?'Firmado':contract?'Preparado':'Pendiente'}</td><td>{inv.status}</td><td><button type="button" className="prst-mini-button" onClick={()=>onNavigate?.('Perfil 360',{investor_id:localInvestorId,investment_id:inv.id})}>{focused?'Seleccionada':'Seleccionar'}</button></td></tr>
    }):<tr><td colSpan="9">Sin inversiones registradas.</td></tr>}</tbody></table></div>
   </article>

   <section className="prst-grid two">
    <article className="prst-card">
     <div className="prst-card-head"><div><small>MOVIMIENTOS</small><h2>Últimos pagos</h2></div><button type="button" className="prst-mini-button" onClick={()=>go('Rendimientos')}>Ver módulo</button></div>
     {!investorPayments.length?<div className="prst-empty compact"><strong>Sin pagos registrados</strong></div>:<div className="prst-compact-list">{investorPayments.slice(0,6).map(x=><div key={x.id}><span><b>{x.payment_code||x.payment_type}</b><small>{date(x.payment_date)} · {x.payment_type}</small></span><strong>{money(x.amount)}</strong></div>)}</div>}
    </article>
    <article className="prst-card">
     <div className="prst-card-head"><div><small>DOCUMENTOS</small><h2>Últimos archivos</h2></div><button type="button" className="prst-mini-button" onClick={()=>go('Documentos')}>Ver módulo</button></div>
     {!investorDocuments.length?<div className="prst-empty compact"><strong>Sin documentos activos</strong></div>:<div className="prst-compact-list">{investorDocuments.slice(0,6).map(x=><div key={x.id}><span><b>{x.title||x.document_code}</b><small>{x.document_type} · {date(x.created_at)}</small></span><strong>{x.document_code}</strong></div>)}</div>}
    </article>
   </section>
  </>}
 </section>
}
