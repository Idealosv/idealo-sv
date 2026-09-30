import { useMemo, useState } from 'react'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:`${value}T12:00:00`).toLocaleDateString('es-SV',{day:'2-digit',month:'short',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'

function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosTreasuryPanel({investments,payments,investorMap}){
 const [search,setSearch]=useState('')
 const [typeFilter,setTypeFilter]=useState('ALL')
 const [fromDate,setFromDate]=useState('')
 const [toDate,setToDate]=useState('')

 const movements=useMemo(()=>{
  const income=investments
   .filter(x=>x.status!=='CANCELLED')
   .map(x=>({
    id:`investment-${x.id}`,
    date:x.granted_at,
    type:'CAPITAL_IN',
    direction:'IN',
    amount:Number(x.principal||0),
    investor_id:x.investor_id,
    investment_id:x.id,
    investment_code:x.investment_code,
    reference:x.contract_number||'',
    place:x.payment_place||'',
    method:x.payment_method||'',
    status:'POSTED',
   }))

  const out=payments.map(x=>({
   id:`payment-${x.id}`,
   date:x.payment_date,
   type:x.payment_type,
   direction:'OUT',
   amount:Number(x.amount||0),
   investor_id:x.investor_id,
   investment_id:x.investment_id,
   investment_code:investments.find(i=>i.id===x.investment_id)?.investment_code||'',
   reference:x.reference||x.payment_code||'',
   place:x.payment_place||'',
   method:x.payment_method||'',
   status:x.status||'POSTED',
  }))

  return [...income,...out].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))
 },[investments,payments])

 const posted=movements.filter(x=>x.status==='POSTED')
 const capitalIn=posted.filter(x=>x.type==='CAPITAL_IN').reduce((s,x)=>s+x.amount,0)
 const yieldOut=posted.filter(x=>x.type==='YIELD').reduce((s,x)=>s+x.amount,0)
 const capitalOut=posted.filter(x=>x.type==='CAPITAL_RETURN').reduce((s,x)=>s+x.amount,0)
 const adjustments=posted.filter(x=>x.type==='ADJUSTMENT').reduce((s,x)=>s+x.amount,0)
 const net=capitalIn-yieldOut-capitalOut-adjustments

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return movements.filter(row=>{
   if(typeFilter!=='ALL'&&row.type!==typeFilter)return false
   if(fromDate&&String(row.date)<fromDate)return false
   if(toDate&&String(row.date)>toDate)return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   return `${fullName(investor)} ${investor?.dui||''} ${row.investment_code||''} ${row.reference||''} ${row.place||''} ${row.method||''}`.toLowerCase().includes(term)
  })
 },[movements,search,typeFilter,fromDate,toDate,investorMap])

 const label=type=>({
  CAPITAL_IN:'Entrada de capital',
  YIELD:'Pago de rendimiento',
  CAPITAL_RETURN:'Devolución de capital',
  ADJUSTMENT:'Ajuste autorizado',
 }[type]||type)

 return <section className="prst-treasury-module">
  <section className="prst-investor-summary prst-treasury-summary">
   <article><span>Capital recibido</span><strong>{money(capitalIn)}</strong><small>inversiones formalizadas</small></article>
   <article><span>Rendimientos pagados</span><strong>{money(yieldOut)}</strong><small>salidas vigentes</small></article>
   <article><span>Capital devuelto</span><strong>{money(capitalOut)}</strong><small>devoluciones vigentes</small></article>
   <article><span>Posición neta</span><strong>{money(net)}</strong><small>entradas menos salidas registradas</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head">
    <div><small>TESORERÍA DE INVERSIONISTAS</small><h2>Libro consolidado de movimientos</h2><p>Entradas de capital y salidas relacionadas exclusivamente con inversiones.</p></div>
   </div>

   <div className="prst-directory-tools prst-treasury-tools">
    <input className="prst-search" placeholder="Buscar inversionista, DUI, inversión, referencia o lugar" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
     <option value="ALL">Todos los movimientos</option>
     <option value="CAPITAL_IN">Entradas de capital</option>
     <option value="YIELD">Rendimientos</option>
     <option value="CAPITAL_RETURN">Devoluciones de capital</option>
     <option value="ADJUSTMENT">Ajustes</option>
    </select>
    <span>{filtered.length} movimiento{filtered.length===1?'':'s'}</span>
   </div>

   <div className="prst-date-filters">
    <label className="prst-field"><span>Desde</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
    <label className="prst-field"><span>Hasta</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
    {(fromDate||toDate)&&<button type="button" onClick={()=>{setFromDate('');setToDate('')}}>Limpiar fechas</button>}
   </div>

   {!filtered.length?<Empty title="Sin movimientos para mostrar">No hay operaciones que coincidan con los filtros seleccionados.</Empty>:<div className="prst-table-wrap"><table className="prst-treasury-table">
    <thead><tr><th>Fecha</th><th>Movimiento</th><th>Inversionista</th><th>Inversión</th><th>Entrada</th><th>Salida</th><th>Pago / referencia</th><th>Estado</th></tr></thead>
    <tbody>{filtered.map(row=>{
     const investor=investorMap.get(row.investor_id)
     return <tr key={row.id} className={row.status==='REVERSED'?'prst-row-reversed':''}>
      <td>{date(row.date)}</td>
      <td><b>{label(row.type)}</b></td>
      <td><b>{fullName(investor)}</b><small>DUI {investor?.dui||'—'}</small></td>
      <td>{row.investment_code||'—'}</td>
      <td>{row.direction==='IN'?<b className="prst-money-in">{money(row.amount)}</b>:'—'}</td>
      <td>{row.direction==='OUT'?<b className="prst-money-out">{money(row.amount)}</b>:'—'}</td>
      <td><b>{row.place||'—'}</b><small>{row.method||'—'}{row.reference?` · ${row.reference}`:''}</small></td>
      <td><span className={`prst-status ${row.status==='POSTED'?'active':'rejected'}`}>{row.status==='POSTED'?'Vigente':'Revertido'}</span></td>
     </tr>
    })}</tbody>
   </table></div>}
  </article>

  <article className="prst-card prst-treasury-note">
   <div className="prst-card-head"><div><small>ALCANCE</small><h2>Solo movimientos de inversionistas</h2></div></div>
   <p className="prst-copy">Tesorería no mezcla clientes, préstamos, ventas, inventario ni facturación comercial. Una entrada de capital nace de una inversión formalizada; una salida nace del libro de pagos al inversionista.</p>
   {adjustments>0&&<div className="prst-note"><strong>Ajustes autorizados vigentes:</strong> {money(adjustments)}. Se muestran separados de rendimientos y devolución de capital.</div>}
  </article>
 </section>
}
