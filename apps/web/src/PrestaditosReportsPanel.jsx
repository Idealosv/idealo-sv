import { useMemo, useState } from 'react'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:String(value)+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const today=()=>new Date().toISOString().slice(0,10)
const daysUntil=value=>value?Math.ceil((new Date(String(value)+'T12:00:00').getTime()-new Date(today()+'T12:00:00').getTime())/86400000):null
const csvEscape=value=>'"'+String(value??'').replace(/"/g,'""')+'"'
const downloadCsv=(name,headers,rows)=>{
 const text=[headers.map(csvEscape).join(','),...rows.map(row=>row.map(csvEscape).join(','))].join('\r\n')
 const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const anchor=document.createElement('a')
 anchor.href=url
 anchor.download=name
 anchor.click()
 window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function Metric({label,value,hint,tone=''}){return <article className={'prst-metric '+tone}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosReportsPanel({company,investors,applications,investments,payments,renewals,documents,investorMap}){
 const [report,setReport]=useState('INVESTMENTS')
 const [fromDate,setFromDate]=useState('')
 const [toDate,setToDate]=useState('')
 const [investorFilter,setInvestorFilter]=useState('ALL')

 const postedPayments=useMemo(()=>payments.filter(x=>(x.status||'POSTED')==='POSTED'),[payments])
 const activeInvestments=useMemo(()=>investments.filter(x=>['ACTIVE','MATURING'].includes(x.status)),[investments])

 const summary=useMemo(()=>({
  investors:investors.filter(x=>x.status==='ACTIVE').length,
  capital:activeInvestments.reduce((s,x)=>s+Number(x.principal||0),0),
  projected:activeInvestments.reduce((s,x)=>s+Number(x.projected_gain||0),0),
  yieldPaid:postedPayments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0),
  capitalReturned:postedPayments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0),
  overdue:investments.filter(x=>x.maturity_date&&daysUntil(x.maturity_date)<0&&!['CLOSED','CANCELLED','RENEWED'].includes(x.status)).length,
 }),[investors,activeInvestments,postedPayments,investments])

 const inPeriod=value=>{
  if(!value)return true
  const raw=String(value).slice(0,10)
  if(fromDate&&raw<fromDate)return false
  if(toDate&&raw>toDate)return false
  return true
 }
 const investorOk=id=>investorFilter==='ALL'||id===investorFilter

 const config={
  INVESTMENTS:{title:'Inversiones',headers:['Código','Inversionista','Capital','Plazo','Otorgada','Vence','Ganancia proyectada','Estado']},
  INVESTORS:{title:'Inversionistas',headers:['Código','Inversionista','DUI','Teléfono','Correo','Estado','Registro']},
  APPLICATIONS:{title:'Solicitudes',headers:['Código','Inversionista','Monto solicitado','Plazo','Estado','Fecha']},
  PAYMENTS:{title:'Pagos',headers:['Código','Inversionista','Tipo','Monto','Fecha','Forma','Referencia']},
  MATURITIES:{title:'Vencimientos',headers:['Inversión','Inversionista','Capital','Vence','Días','Estado']},
  RENEWALS:{title:'Renovaciones',headers:['Código','Inversionista','Decisión','Monto','Plazo','Estado','Fecha']},
  DOCUMENTS:{title:'Documentos',headers:['Código','Inversionista','Tipo','Título','Estado','Fecha']},
 }[report]

 const data=useMemo(()=>{
  if(report==='INVESTORS')return investors.filter(x=>investorOk(x.id)&&inPeriod(x.created_at)).map(x=>({id:x.id,cells:[x.investor_code,fullName(x),x.dui,x.phone||x.whatsapp||'',x.email||'',x.status,date(x.created_at)],raw:[x.investor_code,fullName(x),x.dui,x.phone||x.whatsapp||'',x.email||'',x.status,x.created_at]}))
  if(report==='APPLICATIONS')return applications.filter(x=>investorOk(x.investor_id)&&inPeriod(x.created_at)).map(x=>({id:x.id,cells:[x.application_code,fullName(investorMap.get(x.investor_id)),money(x.requested_amount),String(x.requested_term_months)+' meses',x.status,date(x.created_at)],raw:[x.application_code,fullName(investorMap.get(x.investor_id)),x.requested_amount,x.requested_term_months,x.status,x.created_at]}))
  if(report==='PAYMENTS')return postedPayments.filter(x=>investorOk(x.investor_id)&&inPeriod(x.payment_date)).map(x=>({id:x.id,cells:[x.payment_code,fullName(investorMap.get(x.investor_id)),x.payment_type,money(x.amount),date(x.payment_date),x.payment_method||'',x.reference||''],raw:[x.payment_code,fullName(investorMap.get(x.investor_id)),x.payment_type,x.amount,x.payment_date,x.payment_method||'',x.reference||'']}))
  if(report==='MATURITIES')return investments.filter(x=>investorOk(x.investor_id)&&inPeriod(x.maturity_date)).map(x=>({id:x.id,cells:[x.investment_code,fullName(investorMap.get(x.investor_id)),money(x.principal),date(x.maturity_date),daysUntil(x.maturity_date),x.status],raw:[x.investment_code,fullName(investorMap.get(x.investor_id)),x.principal,x.maturity_date,daysUntil(x.maturity_date),x.status]}))
  if(report==='RENEWALS')return renewals.filter(x=>investorOk(x.investor_id)&&inPeriod(x.decided_at)).map(x=>({id:x.id,cells:[x.renewal_code,fullName(investorMap.get(x.investor_id)),x.decision_type,x.renewal_amount==null?'—':money(x.renewal_amount),x.renewal_term_months?String(x.renewal_term_months)+' meses':'—',x.status,date(x.decided_at)],raw:[x.renewal_code,fullName(investorMap.get(x.investor_id)),x.decision_type,x.renewal_amount??'',x.renewal_term_months??'',x.status,x.decided_at]}))
  if(report==='DOCUMENTS')return documents.filter(x=>investorOk(x.investor_id)&&inPeriod(x.created_at)).map(x=>({id:x.id,cells:[x.document_code,fullName(investorMap.get(x.investor_id)),x.document_type,x.title,x.status,date(x.created_at)],raw:[x.document_code,fullName(investorMap.get(x.investor_id)),x.document_type,x.title,x.status,x.created_at]}))
  return investments.filter(x=>investorOk(x.investor_id)&&inPeriod(x.granted_at)).map(x=>({id:x.id,cells:[x.investment_code,fullName(investorMap.get(x.investor_id)),money(x.principal),String(x.term_months)+' meses',date(x.granted_at),date(x.maturity_date),x.projected_gain==null?'—':money(x.projected_gain),x.status],raw:[x.investment_code,fullName(investorMap.get(x.investor_id)),x.principal,x.term_months,x.granted_at,x.maturity_date,x.projected_gain??'',x.status]}))
 },[report,investors,applications,investments,postedPayments,renewals,documents,investorMap,fromDate,toDate,investorFilter])

 const exportCurrent=()=>{
  const stamp=new Date().toISOString().slice(0,10)
  downloadCsv('prestaditos-'+report.toLowerCase()+'-'+stamp+'.csv',config.headers,data.map(x=>x.raw))
 }

 return <section className="prst-reports-module">
  <section className="prst-metrics">
   <Metric label="Inversionistas activos" value={summary.investors} hint="expedientes habilitados"/>
   <Metric label="Capital activo" value={money(summary.capital)} hint="inversiones vigentes" tone="money"/>
   <Metric label="Ganancia proyectada" value={summary.projected?money(summary.projected):'—'} hint="según datos formalizados" tone="money"/>
   <Metric label="Rendimientos pagados" value={money(summary.yieldPaid)} hint="pagos vigentes"/>
   <Metric label="Capital devuelto" value={money(summary.capitalReturned)} hint="devoluciones vigentes"/>
   <Metric label="Vencidas" value={summary.overdue} hint="requieren seguimiento" tone="warn"/>
  </section>

  <article className="prst-card">
   <div className="prst-card-head">
    <div><small>REPORTES GERENCIALES</small><h2>{config.title}</h2><p>Consultas sobre datos reales del vertical de inversionistas.</p></div>
    <button type="button" className="prst-report-export" onClick={exportCurrent} disabled={!data.length}>Exportar CSV</button>
   </div>

   <label className="prst-report-picker">
    <span>Tipo de reporte</span>
    <select value={report} onChange={e=>setReport(e.target.value)}>
     <option value="INVESTMENTS">Inversiones</option>
     <option value="INVESTORS">Inversionistas</option>
     <option value="APPLICATIONS">Solicitudes</option>
     <option value="PAYMENTS">Pagos</option>
     <option value="MATURITIES">Vencimientos</option>
     <option value="RENEWALS">Renovaciones</option>
     <option value="DOCUMENTS">Documentos</option>
    </select>
   </label>

   <div className="prst-report-filters">
    <label><span>Inversionista</span><select value={investorFilter} onChange={e=>setInvestorFilter(e.target.value)}><option value="ALL">Todos</option>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)}</option>)}</select></label>
    <label><span>Desde</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
    <label><span>Hasta</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
    <div><span>Resultados</span><strong>{data.length}</strong></div>
    {(fromDate||toDate||investorFilter!=='ALL')&&<button type="button" onClick={()=>{setFromDate('');setToDate('');setInvestorFilter('ALL')}}>Limpiar filtros</button>}
   </div>

   {!data.length?<Empty title="Sin datos para este reporte">Cambiá los filtros o seleccioná otro reporte.</Empty>:<div className="prst-table-wrap"><table className="prst-report-table"><thead><tr>{config.headers.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.map(row=><tr key={row.id}>{row.cells.map((cell,index)=><td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </article>

  <article className="prst-card prst-report-note">
   <div className="prst-card-head"><div><small>EXPORTACIÓN</small><h2>Información lista para análisis</h2></div></div>
   <p className="prst-copy">La exportación CSV respeta el reporte y los filtros seleccionados. No modifica información del ERP y puede abrirse en Excel o cualquier hoja de cálculo.</p>
   <small className="prst-report-company">Empresa: {company?.name||'Prestadito$ El Salvador'}</small>
  </article>
 </section>
}
