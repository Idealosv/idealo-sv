import { useEffect, useMemo, useState } from 'react'

const money=(value)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const pct=(value)=>`${Number(value||0).toFixed(1)}%`
const today=()=>new Date().toISOString().slice(0,10)
const monthStart=()=>`${today().slice(0,7)}-01`

export default function FinancialDashboard({ company, supabase }) {
  const [from,setFrom]=useState(monthStart())
  const [to,setTo]=useState(today())
  const [data,setData]=useState({orders:[],receivables:[],customerPayments:[],purchases:[],expenses:[],payables:[],supplierPayments:[],cashAccounts:[],cashMoves:[],inventoryMoves:[],orderCosts:[]})
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=async()=>{
    setLoading(true);setMessage('')
    const start=`${from}T00:00:00`;const end=`${to}T23:59:59`
    const queries=[
      supabase.from('work_orders').select('id,number,title,total,status,created_at,client_id,clients(name)').eq('company_id',company.id).gte('created_at',start).lte('created_at',end).order('created_at',{ascending:false}),
      supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,created_at').eq('company_id',company.id),
      supabase.from('customer_payments').select('id,amount,paid_at,payment_method').eq('company_id',company.id).gte('paid_at',start).lte('paid_at',end),
      supabase.from('purchases').select('id,total,purchase_date,payment_status').eq('company_id',company.id).gte('purchase_date',from).lte('purchase_date',to),
      supabase.from('expenses').select('id,amount,expense_date,category').eq('company_id',company.id).gte('expense_date',from).lte('expense_date',to),
      supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,created_at').eq('company_id',company.id),
      supabase.from('supplier_payments').select('id,amount,paid_at,payment_method').eq('company_id',company.id).gte('paid_at',start).lte('paid_at',end),
      supabase.from('cash_accounts').select('id,name,account_type,opening_balance,active').eq('company_id',company.id).eq('active',true),
      supabase.from('cash_movements').select('id,cash_account_id,movement_type,source_type,amount,movement_date,concept').eq('company_id',company.id),
      supabase.from('inventory_movements').select('id,work_order_id,movement_type,quantity,unit_cost,created_at').eq('company_id',company.id).eq('movement_type','CONSUMPTION').gte('created_at',start).lte('created_at',end),
      supabase.from('work_order_costs').select('id,work_order_id,cost_type,amount,incurred_at').eq('company_id',company.id).gte('incurred_at',from).lte('incurred_at',to),
    ]
    const r=await Promise.all(queries)
    const err=r.find(x=>x.error)?.error
    if(err)setMessage(err.message)
    else setData({orders:r[0].data||[],receivables:r[1].data||[],customerPayments:r[2].data||[],purchases:r[3].data||[],expenses:r[4].data||[],payables:r[5].data||[],supplierPayments:r[6].data||[],cashAccounts:r[7].data||[],cashMoves:r[8].data||[],inventoryMoves:r[9].data||[],orderCosts:r[10].data||[]})
    setLoading(false)
  }

  useEffect(()=>{load()},[company.id,from,to])

  const metrics=useMemo(()=>{
    const sales=data.orders.reduce((s,r)=>s+Number(r.total||0),0)
    const collections=data.customerPayments.reduce((s,r)=>s+Number(r.amount||0),0)
    const purchases=data.purchases.reduce((s,r)=>s+Number(r.total||0),0)
    const expenses=data.expenses.reduce((s,r)=>s+Number(r.amount||0),0)
    const materialCost=data.inventoryMoves.reduce((s,r)=>s+Number(r.quantity||0)*Number(r.unit_cost||0),0)
    const directCosts=data.orderCosts.reduce((s,r)=>s+Number(r.amount||0),0)
    const realCost=materialCost+directCosts
    const grossProfit=sales-realCost
    const operatingProfit=grossProfit-expenses
    const margin=sales>0?operatingProfit/sales*100:0
    const arOpen=data.receivables.filter(r=>!['PAID','CANCELLED'].includes(r.status)).reduce((s,r)=>s+Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0)),0)
    const apOpen=data.payables.filter(r=>!['PAID','CANCELLED'].includes(r.status)).reduce((s,r)=>s+Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0)),0)
    const overdueAr=data.receivables.filter(r=>r.due_date&&r.due_date<today()&&!['PAID','CANCELLED'].includes(r.status)).reduce((s,r)=>s+Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0)),0)
    const overdueAp=data.payables.filter(r=>r.due_date&&r.due_date<today()&&!['PAID','CANCELLED'].includes(r.status)).reduce((s,r)=>s+Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0)),0)
    const cash=data.cashAccounts.reduce((total,a)=>{
      const moves=data.cashMoves.filter(m=>m.cash_account_id===a.id)
      return total+Number(a.opening_balance||0)+moves.reduce((s,m)=>s+(['INCOME','TRANSFER_IN'].includes(m.movement_type)?Number(m.amount||0):-Number(m.amount||0)),0)
    },0)
    return {sales,collections,purchases,expenses,materialCost,directCosts,realCost,grossProfit,operatingProfit,margin,arOpen,apOpen,overdueAr,overdueAp,cash}
  },[data])

  const topOrders=useMemo(()=>data.orders.map(o=>{
    const material=data.inventoryMoves.filter(m=>m.work_order_id===o.id).reduce((s,m)=>s+Number(m.quantity||0)*Number(m.unit_cost||0),0)
    const other=data.orderCosts.filter(c=>c.work_order_id===o.id).reduce((s,c)=>s+Number(c.amount||0),0)
    const cost=material+other;const profit=Number(o.total||0)-cost
    return {...o,cost,profit,margin:Number(o.total||0)>0?profit/Number(o.total)*100:0}
  }).sort((a,b)=>b.profit-a.profit).slice(0,8),[data])

  if(loading)return <section className="loading-card"><span className="spinner"/><p>Calculando estado financiero…</p></section>

  return <section className="clients-module financial-dashboard">
    <div className="clients-titlebar"><div><p className="form-kicker">CONTROL GERENCIAL</p><h2>Dashboard financiero</h2><p>Ventas, cobros, costos, gastos, caja, cuentas por cobrar y cuentas por pagar en una sola vista.</p></div><span className={metrics.operatingProfit>=0?'status dte-ready':'status dte-pending'}>{metrics.operatingProfit>=0?'Resultado positivo':'Resultado negativo'}</span></div>
    <section className="panel finance-filter"><div className="form-grid three"><label className="field"><span>Desde</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field"><span>Hasta</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><div className="field"><span>Periodo</span><strong>{from} → {to}</strong></div></div></section>
    {message&&<p className="feedback error">{message}</p>}

    <div className="metrics-grid finance-kpis">
      <article className="metric-card"><span>Ventas</span><strong>{money(metrics.sales)}</strong><small>Órdenes creadas en periodo</small></article>
      <article className="metric-card"><span>Cobros recibidos</span><strong>{money(metrics.collections)}</strong><small>Entradas de clientes</small></article>
      <article className="metric-card"><span>Utilidad operativa</span><strong>{money(metrics.operatingProfit)}</strong><small>Margen {pct(metrics.margin)}</small></article>
      <article className="metric-card"><span>Caja + bancos</span><strong>{money(metrics.cash)}</strong><small>Saldo disponible registrado</small></article>
    </div>

    <div className="module-grid two-column">
      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">ESTADO DE RESULTADOS</p><h3>Resultado del periodo</h3></div></div><div className="finance-statement">
        <div><span>Ventas</span><strong>{money(metrics.sales)}</strong></div>
        <div><span>(-) Materiales consumidos</span><strong>{money(metrics.materialCost)}</strong></div>
        <div><span>(-) Costos directos</span><strong>{money(metrics.directCosts)}</strong></div>
        <div className="subtotal"><span>Utilidad bruta</span><strong>{money(metrics.grossProfit)}</strong></div>
        <div><span>(-) Gastos operativos</span><strong>{money(metrics.expenses)}</strong></div>
        <div className="total"><span>UTILIDAD OPERATIVA</span><strong>{money(metrics.operatingProfit)}</strong></div>
      </div></section>

      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">LIQUIDEZ Y DEUDA</p><h3>Posición financiera</h3></div></div><div className="finance-statement">
        <div><span>Cuentas por cobrar</span><strong>{money(metrics.arOpen)}</strong></div>
        <div><span>CxC vencidas</span><strong>{money(metrics.overdueAr)}</strong></div>
        <div><span>Cuentas por pagar</span><strong>{money(metrics.apOpen)}</strong></div>
        <div><span>CxP vencidas</span><strong>{money(metrics.overdueAp)}</strong></div>
        <div><span>Compras del periodo</span><strong>{money(metrics.purchases)}</strong></div>
        <div><span>Pagos a proveedores</span><strong>{money(data.supplierPayments.reduce((s,r)=>s+Number(r.amount||0),0))}</strong></div>
      </div></section>
    </div>

    <section className="panel"><div className="panel-heading"><div><p className="form-kicker">RENTABILIDAD POR ORDEN</p><h3>Trabajos con mayor utilidad</h3></div></div>{topOrders.length?<div className="client-table-wrap"><table className="client-table"><thead><tr><th>Orden</th><th>Venta</th><th>Costo real</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>{topOrders.map(o=><tr key={o.id}><td><strong>OT-{String(o.number).padStart(5,'0')} · {o.clients?.name||'Cliente'}</strong><small>{o.title}</small></td><td>{money(o.total)}</td><td>{money(o.cost)}</td><td><strong>{money(o.profit)}</strong></td><td><span className={o.margin>=30?'status dte-ready':o.margin>=0?'status':'status dte-pending'}>{pct(o.margin)}</span></td></tr>)}</tbody></table></div>:<div className="empty-state"><strong>Sin órdenes en el periodo</strong><p>Cuando registres trabajos, aquí aparecerá su rentabilidad.</p></div>}</section>
  </section>
}
