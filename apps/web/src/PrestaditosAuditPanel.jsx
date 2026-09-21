import { useMemo, useState } from 'react'

const dateTime=value=>value?new Date(value).toLocaleString('es-SV',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
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

const ACTIONS={
 INVESTOR_CREATED:'Inversionista creado',
 INVESTOR_UPDATED:'Inversionista actualizado',
 INVESTOR_STATUS_CHANGED:'Estado de inversionista cambiado',
 APPLICATION_CREATED:'Solicitud creada',
 APPLICATION_UPDATED:'Solicitud actualizada',
 APPLICATION_STATUS_CHANGED:'Estado de solicitud cambiado',
 INVESTMENT_ACTIVATED:'Inversión formalizada',
 INVESTMENT_DETAILS_UPDATED:'Datos de inversión actualizados',
 BENEFICIARY_ADDED:'Beneficiario agregado',
 BENEFICIARY_UPDATED:'Beneficiario actualizado',
 BENEFICIARY_DEACTIVATED:'Beneficiario inactivado',
 BENEFICIARY_REACTIVATED:'Beneficiario reactivado',
 INVESTOR_PAYMENT_RECORDED:'Pago registrado',
 INVESTOR_PAYMENT_REVERSED:'Pago revertido',
 RENEWAL_DECISION_RECORDED:'Decisión de renovación registrada',
 RENEWAL_DECISION_UPDATED:'Decisión de renovación actualizada',
 RENEWAL_DECISION_CANCELLED:'Decisión de renovación cancelada',
 DOCUMENT_RECORDED:'Documento registrado',
 DOCUMENT_INACTIVATED:'Documento inactivado',
 DOCUMENT_REACTIVATED:'Documento reactivado',
 INVESTMENT_RETURN_RATE_ASSIGNED:'Porcentaje de rendimiento asignado',
 INVESTMENT_RETURN_RATE_UPDATED:'Porcentaje de rendimiento actualizado',
 CONTRACT_PREPARED:'Contrato preparado',
 CONTRACT_SIGNED_RECORDED:'Contrato firmado registrado',
 RENEWAL_EXECUTED:'Renovación ejecutada',
 WITHDRAWAL_FINALIZED:'Retiro finalizado',
}

const categoryOf=action=>{
 if(String(action).startsWith('INVESTOR_')&&!String(action).includes('PAYMENT'))return 'INVESTOR'
 if(String(action).startsWith('APPLICATION_'))return 'APPLICATION'
 if(String(action).startsWith('INVESTMENT_'))return 'INVESTMENT'
 if(String(action).startsWith('BENEFICIARY_'))return 'BENEFICIARY'
 if(String(action).includes('PAYMENT'))return 'PAYMENT'
 if(String(action).startsWith('RENEWAL_'))return 'RENEWAL'
 if(String(action).startsWith('DOCUMENT_')||String(action).startsWith('CONTRACT_'))return 'DOCUMENT'
 return 'OTHER'
}

const CATEGORY_LABELS={
 ALL:'Todas',
 INVESTOR:'Inversionistas',
 APPLICATION:'Solicitudes',
 INVESTMENT:'Inversiones',
 BENEFICIARY:'Beneficiarios',
 PAYMENT:'Pagos',
 RENEWAL:'Renovaciones',
 DOCUMENT:'Documentos',
 OTHER:'Otros',
}

function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosAuditPanel({company,audit,investorMap}){
 const [search,setSearch]=useState('')
 const [category,setCategory]=useState('ALL')
 const [investorFilter,setInvestorFilter]=useState('ALL')
 const [fromDate,setFromDate]=useState('')
 const [toDate,setToDate]=useState('')
 const [selected,setSelected]=useState(null)

 const investors=useMemo(()=>Array.from(investorMap.values()).sort((a,b)=>fullName(a).localeCompare(fullName(b))),[investorMap])

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return audit.filter(row=>{
   if(category!=='ALL'&&categoryOf(row.action)!==category)return false
   if(investorFilter!=='ALL'&&row.investor_id!==investorFilter)return false
   const raw=String(row.created_at||'').slice(0,10)
   if(fromDate&&raw<fromDate)return false
   if(toDate&&raw>toDate)return false
   if(!term)return true
   const investor=investorMap.get(row.investor_id)
   return (String(row.action||'')+' '+String(ACTIONS[row.action]||'')+' '+fullName(investor)+' '+JSON.stringify(row.detail||{})).toLowerCase().includes(term)
  })
 },[audit,investorMap,search,category,investorFilter,fromDate,toDate])

 const counts=useMemo(()=>({
  total:audit.length,
  investors:audit.filter(x=>categoryOf(x.action)==='INVESTOR').length,
  financial:audit.filter(x=>['INVESTMENT','PAYMENT','RENEWAL'].includes(categoryOf(x.action))).length,
  documents:audit.filter(x=>categoryOf(x.action)==='DOCUMENT').length,
 }),[audit])

 const exportCsv=()=>{
  const headers=['Fecha','Categoría','Acción','Inversionista','Usuario ID','Inversión ID','Detalle']
  const rows=filtered.map(row=>[
   row.created_at,
   CATEGORY_LABELS[categoryOf(row.action)]||categoryOf(row.action),
   ACTIONS[row.action]||row.action,
   fullName(investorMap.get(row.investor_id)),
   row.created_by||'',
   row.investment_id||'',
   JSON.stringify(row.detail||{}),
  ])
  downloadCsv('prestaditos-auditoria-'+new Date().toISOString().slice(0,10)+'.csv',headers,rows)
 }

 return <section className="prst-audit-module">
  <section className="prst-investor-summary prst-audit-summary">
   <article><span>Eventos cargados</span><strong>{counts.total}</strong><small>últimos movimientos</small></article>
   <article><span>Expedientes</span><strong>{counts.investors}</strong><small>cambios de inversionistas</small></article>
   <article><span>Financieros</span><strong>{counts.financial}</strong><small>inversiones, pagos y renovaciones</small></article>
   <article><span>Documentales</span><strong>{counts.documents}</strong><small>archivos y expedientes</small></article>
  </section>

  <article className="prst-card">
   <div className="prst-card-head">
    <div><small>TRAZABILIDAD</small><h2>Auditoría del ERP</h2><p>Quién hizo qué, cuándo y sobre qué expediente.</p></div>
    <button type="button" className="prst-report-export" onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</button>
   </div>

   <div className="prst-audit-filters">
    <input className="prst-search" placeholder="Buscar acción, inversionista o contenido del cambio" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(CATEGORY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <select value={investorFilter} onChange={e=>setInvestorFilter(e.target.value)}><option value="ALL">Todos los inversionistas</option>{investors.map(x=><option key={x.id} value={x.id}>{fullName(x)}</option>)}</select>
    <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} aria-label="Desde"/>
    <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} aria-label="Hasta"/>
    {(search||category!=='ALL'||investorFilter!=='ALL'||fromDate||toDate)&&<button type="button" onClick={()=>{setSearch('');setCategory('ALL');setInvestorFilter('ALL');setFromDate('');setToDate('')}}>Limpiar</button>}
   </div>

   {!filtered.length?<Empty title="Sin eventos para mostrar">No hay movimientos que coincidan con los filtros.</Empty>:<div className="prst-table-wrap"><table className="prst-audit-table">
    <thead><tr><th>Fecha y hora</th><th>Categoría</th><th>Acción</th><th>Inversionista</th><th>Responsable</th><th>Detalle</th></tr></thead>
    <tbody>{filtered.map(row=>{
     const categoryKey=categoryOf(row.action)
     const actor=row.created_by?String(row.created_by).slice(0,8):'Sistema'
     return <tr key={row.id}>
      <td><b>{dateTime(row.created_at)}</b></td>
      <td><span className={'prst-audit-category '+categoryKey.toLowerCase()}>{CATEGORY_LABELS[categoryKey]||categoryKey}</span></td>
      <td><b>{ACTIONS[row.action]||row.action}</b><small>{row.action}</small></td>
      <td>{row.investor_id?<><b>{fullName(investorMap.get(row.investor_id))}</b><small>{row.investor_id.slice(0,8)}…</small></>:'—'}</td>
      <td><b>{actor==='Sistema'?'Sistema':'Usuario '+actor}</b><small>{row.created_by?'ID interno':'Evento automático'}</small></td>
      <td><button type="button" className="prst-audit-detail-button" onClick={()=>setSelected(row)}>Ver detalle</button></td>
     </tr>
    })}</tbody>
   </table></div>}

   <div className="prst-audit-foot">Mostrando {filtered.length} de {audit.length} eventos cargados. La vista actual conserva hasta los últimos 250 eventos del vertical.</div>
  </article>

  {selected&&<AuditDetail row={selected} investor={investorMap.get(selected.investor_id)} onClose={()=>setSelected(null)}/>}
 </section>
}

function AuditDetail({row,investor,onClose}){
 const detail=row.detail&&typeof row.detail==='object'?row.detail:{value:row.detail}
 const entries=Object.entries(detail||{})
 return <div className="prst-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
  <section className="prst-investor-modal prst-audit-modal">
   <header><div><small>DETALLE DE AUDITORÍA</small><h2>{ACTIONS[row.action]||row.action}</h2><p>{dateTime(row.created_at)}</p></div><button type="button" onClick={onClose}>×</button></header>
   <div className="prst-profile-grid">
    <article><small>Categoría</small><b>{CATEGORY_LABELS[categoryOf(row.action)]}</b><span>{row.action}</span></article>
    <article><small>Inversionista</small><b>{row.investor_id?fullName(investor):'No asociado'}</b><span>{row.investor_id||'—'}</span></article>
    <article><small>Inversión</small><b>{row.investment_id?'Asociada':'No asociada'}</b><span>{row.investment_id||'—'}</span></article>
    <article><small>Responsable</small><b>{row.created_by?'Usuario autenticado':'Sistema'}</b><span>{row.created_by||'—'}</span></article>
   </div>
   <div className="prst-section-title">Datos registrados en el evento</div>
   {!entries.length?<Empty title="Evento sin detalle adicional"/>:<div className="prst-audit-detail-grid">{entries.map(([key,value])=><article key={key}><span>{key.replace(/_/g,' ')}</span><strong>{value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value)}</strong></article>)}</div>}
   <div className="prst-modal-actions"><button type="button" onClick={onClose}>Cerrar</button></div>
  </section>
 </div>
}
