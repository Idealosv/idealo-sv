import { useEffect, useMemo, useState } from 'react'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:String(value)+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]))

const posted=payment=>(payment.status||'POSTED')==='POSTED'
const outstandingFor=(investment,payments)=>{
 const returned=payments.filter(x=>posted(x)&&x.investment_id===investment.id&&x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 return Math.max(0,Number(investment.principal||0)-returned)
}

export default function PrestaditosInvestorStatementPanel({company,investors,investments,payments,beneficiaries,contracts}){
 const [investorId,setInvestorId]=useState('')

 useEffect(()=>{if(!investorId&&investors[0])setInvestorId(investors[0].id)},[investors,investorId])

 const investor=investors.find(x=>x.id===investorId)||null
 const investorInvestments=useMemo(()=>investments.filter(x=>x.investor_id===investorId).sort((a,b)=>String(b.granted_at||'').localeCompare(String(a.granted_at||''))),[investments,investorId])
 const investorPayments=useMemo(()=>payments.filter(x=>x.investor_id===investorId&&posted(x)).sort((a,b)=>String(b.payment_date||'').localeCompare(String(a.payment_date||''))),[payments,investorId])
 const activeBeneficiaries=useMemo(()=>beneficiaries.filter(x=>x.investor_id===investorId&&x.active!==false),[beneficiaries,investorId])

 const currentInvestments=investorInvestments.filter(x=>!['CLOSED','CANCELLED','RENEWED'].includes(x.status))
 const capitalCurrent=currentInvestments.reduce((s,x)=>s+outstandingFor(x,investorPayments),0)
 const historicalPrincipal=investorInvestments.filter(x=>x.status!=='CANCELLED').reduce((s,x)=>s+Number(x.principal||0),0)
 const yieldPaid=investorPayments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const capitalReturned=investorPayments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)

 const printStatement=()=>{
  if(!investor)return
  const popup=window.open('','_blank')
  if(!popup)return
  try{popup.opener=null}catch{}

  const investmentRows=investorInvestments.map(inv=>{
   const contract=contracts.find(x=>x.investment_id===inv.id)
   return '<tr>'+
    '<td>'+escapeHtml(inv.investment_code)+'</td>'+
    '<td>'+escapeHtml(date(inv.granted_at))+'</td>'+
    '<td>'+escapeHtml(date(inv.maturity_date))+'</td>'+
    '<td>'+escapeHtml(String(inv.term_months||''))+' meses</td>'+
    '<td>'+escapeHtml(money(inv.principal))+'</td>'+
    '<td>'+escapeHtml(inv.agreed_return_rate==null?'—':Number(inv.agreed_return_rate)+'% anual')+'</td>'+
    '<td>'+escapeHtml(money(outstandingFor(inv,investorPayments)))+'</td>'+
    '<td>'+escapeHtml(contract?.status==='SIGNED'?'Firmado':contract?'Preparado':'Sin contrato')+'</td>'+
    '<td>'+escapeHtml(inv.status||'')+'</td>'+
   '</tr>'
  }).join('')

  const paymentRows=investorPayments.map(p=>{
   const inv=investments.find(x=>x.id===p.investment_id)
   return '<tr><td>'+escapeHtml(date(p.payment_date))+'</td><td>'+escapeHtml(p.payment_code||'')+'</td><td>'+escapeHtml(inv?.investment_code||'')+'</td><td>'+escapeHtml(p.payment_type)+'</td><td>'+escapeHtml(money(p.amount))+'</td><td>'+escapeHtml(p.reference||'')+'</td></tr>'
  }).join('')

  const beneficiaryRows=activeBeneficiaries.map(b=>'<tr><td>'+escapeHtml(b.full_name)+'</td><td>'+escapeHtml(b.relationship||'')+'</td><td>'+escapeHtml(Number(b.percentage||0).toFixed(2)+'%')+'</td><td>'+escapeHtml(b.phone||'')+'</td></tr>').join('')

  popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta '+escapeHtml(investor.investor_code||'')+'</title><style>'+
   'body{font-family:Arial,sans-serif;color:#151719;margin:0;padding:34px;font-size:12px}h1{font-size:23px;margin:0}.brand{border-bottom:3px solid #c62828;padding-bottom:12px;margin-bottom:18px}.brand b{color:#c62828}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}.meta div,.kpis div{border:1px solid #d8dadd;border-radius:7px;padding:9px}.meta small,.kpis small{display:block;color:#6b7075;font-size:9px;text-transform:uppercase;font-weight:bold}.meta strong,.kpis strong{display:block;margin-top:3px;font-size:13px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 20px}h2{font-size:14px;margin:22px 0 8px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:7px;border:1px solid #dfe2e4;text-align:left;vertical-align:top}th{background:#f3f4f5}.note{margin-top:18px;padding:10px;border:1px solid #e0c78f;background:#fff9eb;border-radius:7px;font-size:10px;line-height:1.45}.footer{margin-top:24px;color:#72777c;font-size:9px}.actions{margin:18px 0}@media print{.actions{display:none}body{padding:18px}.kpis{grid-template-columns:repeat(4,1fr)}}'+
   '</style></head><body>'+
   '<div class="brand"><h1>PRESTADITO$ EL SALVADOR</h1><b>Estado de cuenta del inversionista</b><div>Empresa: '+escapeHtml(company?.name||'Prestadito$ El Salvador')+'</div></div>'+
   '<div class="meta"><div><small>Inversionista</small><strong>'+escapeHtml(fullName(investor))+'</strong></div><div><small>Código</small><strong>'+escapeHtml(investor.investor_code||'—')+'</strong></div><div><small>DUI</small><strong>'+escapeHtml(investor.dui||'—')+'</strong></div><div><small>Contacto</small><strong>'+escapeHtml(investor.phone||investor.whatsapp||investor.email||'—')+'</strong></div></div>'+
   '<div class="kpis"><div><small>Capital vigente</small><strong>'+escapeHtml(money(capitalCurrent))+'</strong></div><div><small>Capital formalizado histórico</small><strong>'+escapeHtml(money(historicalPrincipal))+'</strong></div><div><small>Rendimientos pagados</small><strong>'+escapeHtml(money(yieldPaid))+'</strong></div><div><small>Capital devuelto</small><strong>'+escapeHtml(money(capitalReturned))+'</strong></div></div>'+
   '<h2>Inversiones</h2><table><thead><tr><th>Inversión</th><th>Inicio</th><th>Vence</th><th>Plazo</th><th>Capital</th><th>Tasa</th><th>Capital pendiente</th><th>Contrato</th><th>Estado</th></tr></thead><tbody>'+(investmentRows||'<tr><td colspan="9">Sin inversiones registradas.</td></tr>')+'</tbody></table>'+
   '<h2>Movimientos vigentes</h2><table><thead><tr><th>Fecha</th><th>Código</th><th>Inversión</th><th>Tipo</th><th>Monto</th><th>Referencia</th></tr></thead><tbody>'+(paymentRows||'<tr><td colspan="6">Sin movimientos registrados.</td></tr>')+'</tbody></table>'+
   '<h2>Beneficiarios activos</h2><table><thead><tr><th>Beneficiario</th><th>Relación</th><th>Porcentaje</th><th>Teléfono</th></tr></thead><tbody>'+(beneficiaryRows||'<tr><td colspan="4">Sin beneficiarios activos.</td></tr>')+'</tbody></table>'+
   '<div class="note"><strong>Alcance del estado de cuenta:</strong> muestra capital y movimientos efectivamente registrados en el ERP. Los porcentajes 10%, 12% y 15% son anuales. No se inventa un rendimiento pendiente para plazos diferentes de 12 meses mientras la regla de prorrateo no esté definida.</div>'+
   '<div class="footer">Generado: '+escapeHtml(new Date().toLocaleString('es-SV'))+'</div>'+
   '<div class="actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div>'+
   '</body></html>')
  popup.document.close()
 }

 return <section className="prst-statement-module">
  <section className="prst-investor-summary prst-statement-summary">
   <article><span>Capital vigente</span><strong>{money(capitalCurrent)}</strong><small>saldo de capital en inversiones vigentes</small></article>
   <article><span>Capital histórico</span><strong>{money(historicalPrincipal)}</strong><small>formalizado no cancelado</small></article>
   <article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong><small>movimientos vigentes</small></article>
   <article><span>Capital devuelto</span><strong>{money(capitalReturned)}</strong><small>devoluciones registradas</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head">
    <div><small>ESTADO DE CUENTA</small><h2>Resumen del inversionista</h2><p>Consulta e impresión de capital, inversiones, movimientos y beneficiarios.</p></div>
    <button type="button" className="prst-report-export" onClick={printStatement} disabled={!investor}>Imprimir / guardar PDF</button>
   </div>

   <label className="prst-field prst-statement-select"><span>Inversionista</span><select value={investorId} onChange={e=>setInvestorId(e.target.value)}><option value="">Seleccionar</option>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)} · {x.investor_code}</option>)}</select></label>

   {!investor?<div className="prst-empty"><strong>Seleccioná un inversionista</strong></div>:<>
    <div className="prst-profile-grid">
     <article><small>Inversionista</small><b>{fullName(investor)}</b><span>{investor.investor_code}</span></article>
     <article><small>DUI</small><b>{investor.dui||'—'}</b><span>{investor.phone||investor.whatsapp||'Sin teléfono'}</span></article>
     <article><small>Inversiones</small><b>{investorInvestments.length}</b><span>{currentInvestments.length} vigentes</span></article>
     <article><small>Beneficiarios activos</small><b>{activeBeneficiaries.length}</b><span>{activeBeneficiaries.reduce((s,x)=>s+Number(x.percentage||0),0).toFixed(2)}% asignado</span></article>
    </div>

    <div className="prst-section-title">Inversiones</div>
    <div className="prst-table-wrap"><table className="prst-statement-table"><thead><tr><th>Inversión</th><th>Capital</th><th>Tasa anual</th><th>Inicio</th><th>Vence</th><th>Capital pendiente</th><th>Estado</th></tr></thead><tbody>{investorInvestments.length?investorInvestments.map(inv=><tr key={inv.id}><td><b>{inv.investment_code}</b><small>{inv.contract_number||'Sin número de contrato'}</small></td><td>{money(inv.principal)}</td><td>{inv.agreed_return_rate==null?'—':Number(inv.agreed_return_rate)+'% anual'}</td><td>{date(inv.granted_at)}</td><td>{date(inv.maturity_date)}</td><td><b>{money(outstandingFor(inv,investorPayments))}</b></td><td>{inv.status}</td></tr>):<tr><td colSpan="7">Sin inversiones registradas.</td></tr>}</tbody></table></div>

    <div className="prst-section-title">Movimientos</div>
    <div className="prst-table-wrap"><table className="prst-statement-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Inversión</th><th>Monto</th><th>Referencia</th></tr></thead><tbody>{investorPayments.length?investorPayments.map(p=><tr key={p.id}><td>{date(p.payment_date)}</td><td>{p.payment_type}</td><td>{investments.find(x=>x.id===p.investment_id)?.investment_code||'—'}</td><td><b>{money(p.amount)}</b></td><td>{p.reference||'—'}</td></tr>):<tr><td colSpan="5">Sin movimientos vigentes.</td></tr>}</tbody></table></div>

    <div className="prst-note"><strong>Documento informativo:</strong> el estado de cuenta refleja datos registrados en el ERP y no calcula rendimientos no confirmados por la política financiera definitiva.</div>
   </>}
  </article>
 </section>
}
