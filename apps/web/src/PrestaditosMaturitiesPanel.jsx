import { useMemo, useState } from 'react'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const today=()=>new Date().toISOString().slice(0,10)
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const daysUntil=value=>value?Math.ceil((new Date(`${value}T12:00:00`).getTime()-new Date(`${today()}T12:00:00`).getTime())/86400000):null

function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosMaturitiesPanel({investments,payments,investorMap,onGoRenewals}){
 const [search,setSearch]=useState('')
 const [windowFilter,setWindowFilter]=useState('ALL')
 const [selectedId,setSelectedId]=useState('')

 const relevant=useMemo(()=>investments.filter(x=>x.maturity_date&&!['CLOSED','CANCELLED','RENEWED'].includes(x.status)),[investments])

 const summary=useMemo(()=>({
  overdue:relevant.filter(x=>daysUntil(x.maturity_date)<0).length,
  d7:relevant.filter(x=>{const d=daysUntil(x.maturity_date);return d!==null&&d>=0&&d<=7}).length,
  d30:relevant.filter(x=>{const d=daysUntil(x.maturity_date);return d!==null&&d>=0&&d<=30}).length,
  d90:relevant.filter(x=>{const d=daysUntil(x.maturity_date);return d!==null&&d>=0&&d<=90}).length,
 }),[relevant])

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return relevant.filter(row=>{
   const d=daysUntil(row.maturity_date)
   if(windowFilter==='OVERDUE'&&(d===null||d>=0))return false
   if(windowFilter==='7'&&(d===null||d<0||d>7))return false
   if(windowFilter==='30'&&(d===null||d<0||d>30))return false
   if(windowFilter==='90'&&(d===null||d<0||d>90))return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   return `${row.investment_code||''} ${row.contract_number||''} ${fullName(investor)} ${investor?.dui||''} ${row.principal||''} ${row.payment_place||''}`.toLowerCase().includes(term)
  }).sort((a,b)=>String(a.maturity_date).localeCompare(String(b.maturity_date)))
 },[relevant,investorMap,search,windowFilter])

 const selected=investments.find(x=>x.id===selectedId)||null
 const selectedInvestor=selected?investorMap.get(selected.investor_id):null
 const selectedPayments=selected?payments.filter(x=>x.investment_id===selected.id&&(x.status||'POSTED')==='POSTED'):[]

 return <section className="prst-maturity-module">
  <section className="prst-investor-summary prst-maturity-summary">
   <article><span>Vencidas</span><strong>{summary.overdue}</strong><small>requieren decisión</small></article>
   <article><span>Próximos 7 días</span><strong>{summary.d7}</strong><small>atención inmediata</small></article>
   <article><span>Próximos 30 días</span><strong>{summary.d30}</strong><small>gestión preventiva</small></article>
   <article><span>Próximos 90 días</span><strong>{summary.d90}</strong><small>planificación</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head"><div><small>CONTROL DE VENCIMIENTOS</small><h2>Calendario de inversiones</h2><p>Prioriza inversiones vencidas y próximas a vencer sin modificar los contratos automáticamente.</p></div></div>
   <div className="prst-directory-tools prst-maturity-tools">
    <input className="prst-search" placeholder="Buscar inversión, contrato, inversionista o DUI" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select value={windowFilter} onChange={e=>setWindowFilter(e.target.value)}>
     <option value="ALL">Todos los vencimientos</option>
     <option value="OVERDUE">Vencidas</option>
     <option value="7">Próximos 7 días</option>
     <option value="30">Próximos 30 días</option>
     <option value="90">Próximos 90 días</option>
    </select>
    <span>{filtered.length} resultado{filtered.length===1?'':'s'}</span>
   </div>

   {!filtered.length?<Empty title="Sin vencimientos para mostrar">No hay inversiones dentro del filtro seleccionado.</Empty>:<div className="prst-table-wrap"><table className="prst-maturity-table">
    <thead><tr><th>Inversión</th><th>Inversionista</th><th>Capital</th><th>Otorgada</th><th>Vencimiento</th><th>Tiempo</th><th>Lugar de pago</th><th>Acciones</th></tr></thead>
    <tbody>{filtered.map(row=>{
     const investor=investorMap.get(row.investor_id)
     const d=daysUntil(row.maturity_date)
     const level=d<0?'overdue':d<=7?'urgent':d<=30?'warning':'normal'
     return <tr key={row.id} className={`prst-maturity-row ${level}`}>
      <td><b>{row.investment_code}</b><small>{row.contract_number?`Contrato ${row.contract_number}`:'Contrato pendiente'}</small></td>
      <td><b>{fullName(investor)}</b><small>DUI {investor?.dui||'—'} · {investor?.phone||investor?.whatsapp||'sin teléfono'}</small></td>
      <td><b>{money(row.principal)}</b><small>{row.term_months} meses</small></td>
      <td>{date(row.granted_at)}</td>
      <td><b>{date(row.maturity_date)}</b></td>
      <td><span className={`prst-maturity-badge ${level}`}>{d<0?`${Math.abs(d)} días vencida`:d===0?'Vence hoy':`${d} días`}</span></td>
      <td><b>{row.payment_place||'Pendiente'}</b><small>{row.payment_method||'Forma pendiente'}</small></td>
      <td><div className="prst-row-actions"><button type="button" onClick={()=>setSelectedId(row.id)}>Ver</button>{d<=30&&<button type="button" className="approve" onClick={()=>onGoRenewals?.(row.id)}>Gestionar</button>}</div></td>
     </tr>
    })}</tbody>
   </table></div>}
  </article>

  {selected&&<MaturityDetail investment={selected} investor={selectedInvestor} payments={selectedPayments} onClose={()=>setSelectedId('')} onManage={()=>{setSelectedId('');onGoRenewals?.(selected.id)}}/>}
 </section>
}

function MaturityDetail({investment,investor,payments,onClose,onManage}){
 const d=daysUntil(investment.maturity_date)
 const yieldPaid=payments.filter(x=>x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const capitalReturned=payments.filter(x=>x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 const outstanding=Math.max(0,Number(investment.principal||0)-capitalReturned)
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="prst-investor-modal prst-maturity-modal">
   <header><div><small>VENCIMIENTO DE INVERSIÓN</small><h2>{investment.investment_code}</h2><p>{fullName(investor)} · vence {date(investment.maturity_date)}</p></div><button type="button" onClick={onClose}>×</button></header>
   <section className="prst-profile-metrics">
    <article><span>Capital original</span><strong>{money(investment.principal)}</strong></article>
    <article><span>Capital pendiente</span><strong>{money(outstanding)}</strong></article>
    <article><span>Rendimientos pagados</span><strong>{money(yieldPaid)}</strong></article>
    <article><span>Tiempo</span><strong>{d<0?`${Math.abs(d)} días vencida`:d===0?'Vence hoy':`${d} días`}</strong></article>
   </section>
   <div className="prst-profile-grid">
    <article><small>Inversionista</small><b>{fullName(investor)}</b><span>DUI {investor?.dui||'—'}</span><span>{investor?.phone||investor?.whatsapp||'Sin teléfono'}</span></article>
    <article><small>Contrato</small><b>{investment.contract_number||'Número pendiente'}</b><span>Otorgada {date(investment.granted_at)}</span><span>Plazo {investment.term_months} meses</span></article>
    <article><small>Pago</small><b>{investment.payment_place||'Lugar pendiente'}</b><span>{investment.payment_method||'Forma pendiente'}</span></article>
    <article><small>Proyección</small><b>{investment.projected_gain==null?'Ganancia pendiente':money(investment.projected_gain)}</b><span>{investment.projected_gain==null?'Aún no se definió la fórmula automática.':'Proyección registrada manualmente.'}</span></article>
   </div>
   <div className="prst-note"><strong>Importante:</strong> llegar a la fecha de vencimiento no renueva ni cierra la inversión automáticamente. La decisión debe registrarse en Renovaciones.</div>
   <div className="prst-modal-actions"><button type="button" onClick={onClose}>Cerrar</button><button type="button" className="primary" onClick={onManage}>Gestionar vencimiento</button></div>
  </section>
 </div>
}
