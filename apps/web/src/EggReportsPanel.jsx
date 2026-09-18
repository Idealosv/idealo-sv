import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const num=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:2}).format(Number(v||0))
const errorText=e=>String(e?.message||e||'No se pudo cargar el reporte.')

export default function EggReportsPanel({companyId}){
 const [sales,setSales]=useState([])
 const [balances,setBalances]=useState([])
 const [suppliers,setSuppliers]=useState([])
 const [losses,setLosses]=useState([])
 const [routes,setRoutes]=useState([])
 const [error,setError]=useState('')

 const load=useCallback(async()=>{
  if(!companyId)return
  setError('')
  const [s,b,p,l,r]=await Promise.all([
   supabase.from('egg_sales_profitability_report').select('*').eq('company_id',companyId).order('order_date',{ascending:false}),
   supabase.from('egg_customer_balance_report').select('*').eq('company_id',companyId).order('balance',{ascending:false}),
   supabase.from('egg_supplier_purchase_report').select('*').eq('company_id',companyId).order('purchase_cost',{ascending:false}),
   supabase.from('egg_loss_summary_report').select('*').eq('company_id',companyId).order('estimated_cost',{ascending:false}),
   supabase.from('egg_route_performance_report').select('*').eq('company_id',companyId).order('route_date',{ascending:false})
  ])
  for(const x of [s,b,p,l,r])if(x.error)throw x.error
  setSales(s.data||[]);setBalances(b.data||[]);setSuppliers(p.data||[]);setLosses(l.data||[]);setRoutes(r.data||[])
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])

 const metrics=useMemo(()=>{
  const revenue=sales.reduce((a,x)=>a+Number(x.line_total||0),0)
  const cost=sales.reduce((a,x)=>a+Number(x.cost_total||0),0)
  const profit=sales.reduce((a,x)=>a+Number(x.profit_amount||0),0)
  const receivable=balances.reduce((a,x)=>a+Number(x.balance||0),0)
  const lossCost=losses.reduce((a,x)=>a+Number(x.estimated_cost||0),0)
  return{revenue,cost,profit,receivable,lossCost,margin:revenue?profit/revenue*100:0}
 },[sales,balances,losses])

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  <section className="eggs-metrics">
   <article className="eggs-metric"><span>Ventas</span><strong>{money(metrics.revenue)}</strong><small>ingreso acumulado</small></article>
   <article className="eggs-metric"><span>Costo vendido</span><strong>{money(metrics.cost)}</strong><small>costo estimado</small></article>
   <article className="eggs-metric"><span>Utilidad bruta</span><strong>{money(metrics.profit)}</strong><small>{num(metrics.margin)}% margen</small></article>
   <article className="eggs-metric"><span>Por cobrar</span><strong>{money(metrics.receivable)}</strong><small>cartera abierta</small></article>
   <article className="eggs-metric"><span>Pérdidas</span><strong>{money(metrics.lossCost)}</strong><small>costo estimado</small></article>
   <article className="eggs-metric"><span>Rutas</span><strong>{routes.length}</strong><small>despachos registrados</small></article>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>RENTABILIDAD</small><h2>Ventas por pedido y clasificación</h2></div><button onClick={load}>Actualizar</button></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Tamaño</th><th>Huevos</th><th>Venta</th><th>Costo</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>
    {sales.slice(0,100).map(x=><tr key={x.order_id+'-'+x.grade_id}><td><b>{x.order_number}</b><small>{x.order_date}</small></td><td>{x.customer_name}</td><td>{x.grade_name}</td><td>{num(x.total_eggs)}</td><td>{money(x.line_total)}</td><td>{money(x.cost_total)}</td><td><b>{money(x.profit_amount)}</b></td><td>{num(x.margin_percent)}%</td></tr>)}
    {!sales.length&&<tr><td colSpan="8"><div className="eggs-empty">Todavía no hay ventas para analizar.</div></td></tr>}
   </tbody></table></div>
  </section>

  <section className="eggs-two-column">
   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>CARTERA</small><h2>Clientes por cobrar</h2></div></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Cliente</th><th>Ventas</th><th>Saldo</th><th>Vencido desde</th></tr></thead><tbody>
     {balances.map(x=><tr key={x.customer_id}><td>{x.name}</td><td>{money(x.sales_total)}</td><td><b>{money(x.balance)}</b></td><td>{x.oldest_overdue_date||'—'}</td></tr>)}
     {!balances.length&&<tr><td colSpan="4"><div className="eggs-empty">Sin cartera registrada.</div></td></tr>}
    </tbody></table></div>
   </section>

   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>COMPRAS</small><h2>Proveedores y costo</h2></div></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Proveedor</th><th>Lotes</th><th>Huevos</th><th>Costo</th><th>Costo/huevo</th></tr></thead><tbody>
     {suppliers.map(x=><tr key={x.supplier_id||x.supplier_name}><td>{x.supplier_name}</td><td>{x.batches_count}</td><td>{num(x.eggs_received)}</td><td>{money(x.purchase_cost)}</td><td>{money(x.avg_cost_per_egg)}</td></tr>)}
     {!suppliers.length&&<tr><td colSpan="5"><div className="eggs-empty">Sin compras registradas.</div></td></tr>}
    </tbody></table></div>
   </section>
  </section>

  <section className="eggs-two-column">
   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>MERMA</small><h2>Pérdidas por causa</h2></div></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Tipo</th><th>Tamaño</th><th>Eventos</th><th>Huevos</th><th>Costo</th></tr></thead><tbody>
     {losses.map((x,i)=><tr key={x.loss_type+'-'+x.grade_name+'-'+i}><td>{x.loss_type}</td><td>{x.grade_name}</td><td>{x.events_count}</td><td>{num(x.eggs_lost)}</td><td>{money(x.estimated_cost)}</td></tr>)}
     {!losses.length&&<tr><td colSpan="5"><div className="eggs-empty">Sin pérdidas registradas.</div></td></tr>}
    </tbody></table></div>
   </section>
   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>REPARTO</small><h2>Desempeño de rutas</h2></div></div>
    <div className="eggs-table-wrap"><table><thead><tr><th>Ruta</th><th>Motorista</th><th>Paradas</th><th>Entregas</th><th>Fallidas</th><th>Cobrado</th></tr></thead><tbody>
     {routes.map(x=><tr key={x.route_id}><td><b>{x.route_code}</b><small>{x.route_date}</small></td><td>{x.driver_name||'—'}</td><td>{x.stops}</td><td>{x.delivered}</td><td>{x.failed}</td><td>{money(x.collected_amount)}</td></tr>)}
     {!routes.length&&<tr><td colSpan="6"><div className="eggs-empty">Sin rutas registradas.</div></td></tr>}
    </tbody></table></div>
   </section>
  </section>
 </div>
}
