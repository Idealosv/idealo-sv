import { useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const monthLabel=value=>value?new Date(String(value).slice(0,7)+'-01T12:00:00').toLocaleDateString('es-SV',{month:'long',year:'numeric'}):'—'
const currentMonth=()=>new Date().toISOString().slice(0,7)

function Metric({label,value,hint=''}){return <article><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}

export default function PrestaditosMonthlyCloseoutPanel({company,role,closeouts,saving,act}){
 const canManage=['owner','admin'].includes(String(role||'').toLowerCase())
 const [period,setPeriod]=useState(currentMonth())
 const [notes,setNotes]=useState('')
 const [selectedId,setSelectedId]=useState('')

 const selected=closeouts.find(x=>x.id===selectedId)||closeouts[0]||null
 const metrics=selected?.metrics||{}

 const latestByMonth=useMemo(()=>{
  const map=new Map()
  for(const row of closeouts){
   const key=String(row.period_month||'').slice(0,7)
   if(!map.has(key)||Number(row.version)>Number(map.get(key).version))map.set(key,row)
  }
  return Array.from(map.values()).sort((a,b)=>String(b.period_month).localeCompare(String(a.period_month)))
 },[closeouts])

 const generate=e=>{
  e.preventDefault()
  if(!canManage||!period)return
  act(async()=>{
   const {error}=await supabase.rpc('inv_generate_monthly_closeout',{
    p_company_id:company.id,
    p_period:period+'-01',
    p_notes:notes.trim(),
   })
   if(error)throw error
   setNotes('')
  },'Cierre mensual generado como snapshot sin alterar movimientos.')
 }

 const printCloseout=row=>{
  if(!row)return
  const m=row.metrics||{}
  const popup=window.open('','_blank')
  if(!popup)return
  try{popup.opener=null}catch{}
  const html='<!doctype html><html><head><meta charset="utf-8"><title>'+row.closeout_code+'</title><style>'+
   'body{font-family:Arial,sans-serif;padding:34px;color:#111}h1{margin:0;font-size:22px}.brand{border-bottom:3px solid #c62828;padding-bottom:10px}.meta{margin:14px 0;color:#555}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.grid div{border:1px solid #ddd;border-radius:7px;padding:12px}.grid small{display:block;color:#666;text-transform:uppercase;font-weight:bold;font-size:9px}.grid strong{display:block;margin-top:4px;font-size:16px}.note{margin-top:18px;border:1px solid #e4cf9a;background:#fff9ea;padding:10px;border-radius:7px}.footer{margin-top:22px;color:#777;font-size:10px}@media print{button{display:none}}</style></head><body>'+
   '<div class="brand"><h1>PRESTADITO$ EL SALVADOR</h1><b>Cierre mensual · '+row.closeout_code+'</b></div>'+
   '<div class="meta">Período: '+monthLabel(row.period_month)+' · versión '+row.version+'</div>'+
   '<div class="grid">'+
   '<div><small>Nuevas inversiones</small><strong>'+(m.new_investments??0)+'</strong></div>'+
   '<div><small>Capital formalizado</small><strong>'+money(m.capital_formalized)+'</strong></div>'+
   '<div><small>Pagos registrados</small><strong>'+(m.payments_count??0)+'</strong></div>'+
   '<div><small>Rendimientos pagados</small><strong>'+money(m.yield_paid)+'</strong></div>'+
   '<div><small>Capital devuelto</small><strong>'+money(m.capital_returned)+'</strong></div>'+
   '<div><small>Ajustes</small><strong>'+money(m.adjustments)+'</strong></div>'+
   '<div><small>Vencimientos</small><strong>'+(m.maturities??0)+'</strong></div>'+
   '<div><small>Renovaciones ejecutadas</small><strong>'+(m.renewals_executed??0)+'</strong></div>'+
   '<div><small>Contratos firmados</small><strong>'+(m.contracts_signed??0)+'</strong></div>'+
   '</div>'+
   '<div class="note"><strong>Alcance:</strong> este cierre es un snapshot de actividad del mes. No bloquea, modifica ni elimina inversiones, pagos, contratos o renovaciones.</div>'+
   (row.notes?'<p><strong>Notas:</strong> '+String(row.notes).replace(/[&<>]/g,'')+'</p>':'')+
   '<div class="footer">Generado: '+new Date(row.generated_at).toLocaleString('es-SV')+'</div>'+
   '<button onclick="window.print()">Imprimir / guardar PDF</button></body></html>'
  popup.document.write(html);popup.document.close()
 }

 return <section className="prst-closeout-module">
  <section className="prst-investor-summary prst-closeout-summary">
   <Metric label="Cierres guardados" value={closeouts.length} hint="todas las versiones"/>
   <Metric label="Meses cerrados" value={latestByMonth.length} hint="con al menos un snapshot"/>
   <Metric label="Último período" value={latestByMonth[0]?monthLabel(latestByMonth[0].period_month):'—'} hint={latestByMonth[0]?latestByMonth[0].closeout_code:'sin cierres'}/>
   <Metric label="Modo" value="Snapshot" hint="no bloquea movimientos"/>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form" onSubmit={generate}>
    <div className="prst-card-head"><div><small>CIERRE MENSUAL</small><h2>Generar resumen del mes</h2><p>Consolida actividad registrada sin alterar la contabilidad operativa.</p></div></div>
    {!canManage&&<div className="prst-note">Solo propietario o administrador puede generar cierres mensuales.</div>}
    <label className="prst-field"><span>Mes *</span><input type="month" max={currentMonth()} value={period} onChange={e=>setPeriod(e.target.value)} disabled={!canManage}/></label>
    <label className="prst-field"><span>Notas internas</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} disabled={!canManage} placeholder="Observaciones del cierre, si aplica."/></label>
    <div className="prst-note"><strong>Control:</strong> si generás nuevamente el mismo mes, se crea una nueva versión. Las versiones anteriores se conservan para auditoría.</div>
    <button className="prst-primary" disabled={saving||!canManage||!period}>{saving?'Generando…':'Generar cierre mensual'}</button>
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>HISTORIAL</small><h2>Cierres mensuales</h2><p>Última versión por mes y acceso al historial completo.</p></div></div>
    {!closeouts.length?<div className="prst-empty"><strong>Sin cierres generados</strong><p>El primer cierre aparecerá aquí.</p></div>:<div className="prst-table-wrap"><table className="prst-closeout-table"><thead><tr><th>Código</th><th>Período</th><th>Versión</th><th>Capital</th><th>Rendimientos</th><th>Capital devuelto</th><th>Acciones</th></tr></thead><tbody>{closeouts.map(row=><tr key={row.id}><td><b>{row.closeout_code}</b><small>{new Date(row.generated_at).toLocaleString('es-SV')}</small></td><td>{monthLabel(row.period_month)}</td><td>v{row.version}</td><td>{money(row.metrics?.capital_formalized)}</td><td>{money(row.metrics?.yield_paid)}</td><td>{money(row.metrics?.capital_returned)}</td><td><div className="prst-row-actions"><button type="button" onClick={()=>setSelectedId(row.id)}>Ver</button><button type="button" onClick={()=>printCloseout(row)}>PDF</button></div></td></tr>)}</tbody></table></div>}
   </article>
  </section>

  {selected&&<article className="prst-card">
   <div className="prst-card-head"><div><small>DETALLE DEL SNAPSHOT</small><h2>{selected.closeout_code} · {monthLabel(selected.period_month)}</h2><p>Versión {selected.version}</p></div><button type="button" className="prst-report-export" onClick={()=>printCloseout(selected)}>Imprimir / guardar PDF</button></div>
   <section className="prst-metrics prst-closeout-detail">
    <article><span>Nuevas inversiones</span><strong>{metrics.new_investments??0}</strong><small>formalizadas en el mes</small></article>
    <article><span>Capital formalizado</span><strong>{money(metrics.capital_formalized)}</strong><small>nuevas inversiones</small></article>
    <article><span>Rendimientos pagados</span><strong>{money(metrics.yield_paid)}</strong><small>pagos vigentes</small></article>
    <article><span>Capital devuelto</span><strong>{money(metrics.capital_returned)}</strong><small>pagos vigentes</small></article>
    <article><span>Vencimientos</span><strong>{metrics.maturities??0}</strong><small>fechas del período</small></article>
    <article><span>Renovaciones</span><strong>{metrics.renewals_executed??0}</strong><small>ejecutadas</small></article>
   </section>
   {selected.notes&&<div className="prst-note"><strong>Notas:</strong> {selected.notes}</div>}
  </article>}
 </section>
}
