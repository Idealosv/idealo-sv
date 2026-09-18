import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const num=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:1}).format(Number(v||0))
const errorText=e=>String(e?.message||e||'No se pudo cargar el dashboard.')

export default function EggExecutiveDashboard({companyId,onGo}){
 const [data,setData]=useState(null)
 const [balances,setBalances]=useState([])
 const [losses,setLosses]=useState([])
 const [error,setError]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [d,b,l]=await Promise.all([
   supabase.from('egg_executive_dashboard').select('*').eq('company_id',companyId).maybeSingle(),
   supabase.from('egg_customer_balance_report').select('*').eq('company_id',companyId).gt('balance',0).order('balance',{ascending:false}).limit(5),
   supabase.from('egg_loss_summary_report').select('*').eq('company_id',companyId).order('estimated_cost',{ascending:false}).limit(5)
  ])
  for(const r of [d,b,l])if(r.error)throw r.error
  setData(d.data||{});setBalances(b.data||[]);setLosses(l.data||[])
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 if(error)return <div className="eggs-alert error">{error}</div>
 const d=data||{}
 return <section className="eggs-exec">
  <div className="eggs-exec-head">
   <div><small>CENTRO EJECUTIVO</small><h2>Operación, rentabilidad y alertas</h2><p>Indicadores calculados con la información actual de IDEALO Eggs.</p></div>
   <button onClick={load}>Actualizar indicadores</button>
  </div>
  <div className="eggs-exec-grid">
   <article><span>Valor inventario</span><strong>{money(d.stock_value)}</strong><small>{num(d.stock_eggs)} huevos disponibles</small></article>
   <article><span>Utilidad bruta</span><strong>{money(d.profit_total)}</strong><small>{num(d.margin_percent)}% margen</small></article>
   <article><span>Cartera vencida</span><strong>{money(d.overdue_balance)}</strong><small>de {money(d.receivable_balance)} por cobrar</small></article>
   <article><span>Huevos recibidos 30d</span><strong>{num(d.eggs_received_30d)}</strong><small>volumen de abastecimiento</small></article>
   <article><span>Pérdidas</span><strong>{money(d.loss_cost)}</strong><small>{num(d.loss_eggs)} huevos</small></article>
   <article><span>Entregas pendientes</span><strong>{num(d.pending_stops)}</strong><small>{num(d.delivered_stops)} entregadas</small></article>
  </div>
  <div className="eggs-exec-panels">
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>VENTAS</small><h3>Mejores resultados</h3></div><button onClick={()=>onGo?.('Reportes')}>Ver reportes</button></div>
    <div className="eggs-exec-highlight"><span>Cliente con mayor venta</span><b>{d.best_customer||'Sin datos'}</b><strong>{money(d.best_customer_sales)}</strong></div>
    <div className="eggs-exec-highlight"><span>Clasificación con mayor venta</span><b>{d.best_grade||'Sin datos'}</b><strong>{money(d.best_grade_sales)}</strong></div>
   </article>
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>COBROS</small><h3>Mayores saldos</h3></div><button onClick={()=>onGo?.('Caja')}>Ir a caja</button></div>
    <div className="eggs-exec-list">{balances.map(x=><div key={x.customer_id}><span><b>{x.name}</b><small>{x.oldest_overdue_date?'Vencido desde '+x.oldest_overdue_date:'Saldo vigente'}</small></span><strong>{money(x.balance)}</strong></div>)}{!balances.length&&<div className="eggs-empty">Sin saldos pendientes.</div>}</div>
   </article>
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>MERMA</small><h3>Pérdidas principales</h3></div><button onClick={()=>onGo?.('Devoluciones')}>Gestionar pérdidas</button></div>
    <div className="eggs-exec-list">{losses.map((x,i)=><div key={x.loss_type+'-'+x.grade_name+'-'+i}><span><b>{x.loss_type}</b><small>{x.grade_name} · {num(x.eggs_lost)} huevos</small></span><strong>{money(x.estimated_cost)}</strong></div>)}{!losses.length&&<div className="eggs-empty">Sin pérdidas registradas.</div>}</div>
   </article>
  </div>
 </section>
}
