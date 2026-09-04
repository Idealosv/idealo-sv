import { useEffect, useMemo, useState } from 'react'

const money=(v)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const iso=(d=new Date())=>d.toISOString().slice(0,10)
const monthStart=()=>`${iso().slice(0,7)}-01`
const addDays=(date,n)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);return iso(d)}
const balance=(r)=>Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0))
const open=(r)=>!['PAID','CANCELLED'].includes(String(r.status||'').toUpperCase())

export default function DashboardIntelligence({company,supabase}){
  const [data,setData]=useState({snapshot:{},orders:[],receivables:[],payables:[],inventory:[],integrity:[]})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      setLoading(true);setError('')
      const start=monthStart(),end=iso(),next30=addDays(end,30)
      const results=await Promise.all([
        supabase.rpc('financial_dashboard_snapshot',{p_company:company.id,p_start:start,p_end:end}),
        supabase.from('work_orders').select('id,number,title,status,priority,due_at,total,clients(name)').eq('company_id',company.id).order('due_at',{ascending:true}).limit(120),
        supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,clients(name)').eq('company_id',company.id).order('due_date',{ascending:true}).limit(200),
        supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,suppliers(name)').eq('company_id',company.id).order('due_date',{ascending:true}).limit(200),
        supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,unit').eq('company_id',company.id).eq('active',true).limit(500),
        supabase.rpc('audit_dte_financial_integrity',{p_company:company.id})
      ])
      if(!alive)return
      const err=results.find(r=>r.error)?.error
      if(err){setError(err.message);setLoading(false);return}
      setData({snapshot:results[0].data||{},orders:results[1].data||[],receivables:results[2].data||[],payables:results[3].data||[],inventory:results[4].data||[],integrity:results[5].data||[]})
      setLoading(false)
    }
    load();return()=>{alive=false}
  },[company.id,supabase])

  const stats=useMemo(()=>{
    const s=data.snapshot||{},today=iso(),next7=addDays(today,7),next30=addDays(today,30)
    const overdueAr=data.receivables.filter(r=>open(r)&&r.due_date&&r.due_date<today)
    const overdueAp=data.payables.filter(r=>open(r)&&r.due_date&&r.due_date<today)
    const due7Ar=data.receivables.filter(r=>open(r)&&r.due_date>=today&&r.due_date<=next7).reduce((a,r)=>a+balance(r),0)
    const due7Ap=data.payables.filter(r=>open(r)&&r.due_date>=today&&r.due_date<=next7).reduce((a,r)=>a+balance(r),0)
    const due30Ar=data.receivables.filter(r=>open(r)&&r.due_date>=today&&r.due_date<=next30).reduce((a,r)=>a+balance(r),0)
    const due30Ap=data.payables.filter(r=>open(r)&&r.due_date>=today&&r.due_date<=next30).reduce((a,r)=>a+balance(r),0)
    const lateOrders=data.orders.filter(o=>o.due_at&&o.due_at.slice(0,10)<today&&!['DELIVERED','COMPLETED','CANCELLED'].includes(String(o.status||'').toUpperCase()))
    const lowStock=data.inventory.filter(i=>Number(i.current_stock||0)<=Number(i.minimum_stock||0))
    const integrityErrors=data.integrity.filter(x=>String(x.severity).toUpperCase()==='ERROR'&&Number(x.affected||0)>0)
    let health=100
    if(Number(s.cash_total||0)<0)health-=25
    if(Number(s.receivables_overdue||0)>0)health-=Math.min(20,overdueAr.length*4)
    if(Number(s.payables_overdue||0)>Math.max(Number(s.cash_total||0),0))health-=15
    if(lateOrders.length)health-=Math.min(20,lateOrders.length*3)
    if(lowStock.length)health-=Math.min(10,lowStock.length)
    if(integrityErrors.length)health-=25
    health=Math.max(0,Math.round(health))
    return {...s,overdueAr,overdueAp,due7Ar,due7Ap,due30Ar,due30Ap,lateOrders,lowStock,integrityErrors,health,forecast7:Number(s.cash_total||0)+due7Ar-due7Ap,forecast30:Number(s.cash_total||0)+due30Ar-due30Ap}
  },[data])

  const decisions=useMemo(()=>{
    const d=[]
    if(stats.integrityErrors.length)d.push({level:'critical',title:`${stats.integrityErrors.length} inconsistencia(s) financiera(s)`,detail:'Revisar la auditoría DTE ↔ Finanzas antes de continuar.'})
    if(stats.overdueAr.length)d.push({level:'critical',title:`${stats.overdueAr.length} cobro(s) vencido(s)`,detail:`Cartera vencida: ${money(stats.receivables_overdue)}`})
    if(stats.lateOrders.length)d.push({level:'critical',title:`${stats.lateOrders.length} trabajo(s) atrasado(s)`,detail:'Revisá fechas de entrega y avance de producción.'})
    if(stats.forecast7<0)d.push({level:'critical',title:'Caja proyectada negativa en 7 días',detail:`Proyección: ${money(stats.forecast7)}`})
    if(stats.overdueAp.length)d.push({level:'important',title:`${stats.overdueAp.length} pago(s) vencido(s)`,detail:`Proveedores: ${money(stats.payables_overdue)}`})
    if(stats.lowStock.length)d.push({level:'important',title:`${stats.lowStock.length} material(es) en mínimo`,detail:'Prepará reposición antes de afectar producción.'})
    if(!d.length)d.push({level:'good',title:'Operación sin alertas críticas',detail:'Caja, cartera, obligaciones y DTE no muestran inconsistencias críticas.'})
    return d.slice(0,6)
  },[stats])

  if(loading)return <section className="intel-shell panel"><strong>Analizando datos reales del ERP…</strong></section>
  if(error)return <section className="intel-shell panel"><strong>No se pudo cargar inteligencia gerencial</strong><p>{error}</p></section>

  return <section className="dashboard-intelligence">
    <div className="intel-head"><div><p className="form-kicker">INTELIGENCIA GERENCIAL</p><h2>Centro de decisiones</h2><p>Finanzas, cartera, producción, inventario y DTE desde datos conciliados del ERP.</p></div><div className={`health-score ${stats.health>=75?'good':stats.health>=50?'warn':'bad'}`}><span>Índice IDEALO</span><strong>{stats.health}/100</strong><small>{stats.health>=75?'Salud buena':stats.health>=50?'Requiere atención':'Atención prioritaria'}</small></div></div>

    <div className="finance-kpis metrics-grid">
      <article className="metric-card"><span>Disponible actual</span><strong>{money(stats.cash_total)}</strong><small>Caja {money(stats.cash_available)} · Banco {money(stats.bank_available)}</small></article>
      <article className="metric-card"><span>Entradas del mes</span><strong>{money(stats.cash_in)}</strong><small>Flujo real de Caja/Banco</small></article>
      <article className="metric-card"><span>Salidas del mes</span><strong>{money(stats.cash_out)}</strong><small>Sin duplicar compras/gastos</small></article>
      <article className="metric-card"><span>Flujo neto</span><strong>{money(stats.net_cash)}</strong><small>Entradas menos salidas</small></article>
      <article className="metric-card"><span>Cuentas por cobrar</span><strong>{money(stats.receivables)}</strong><small>Vencido {money(stats.receivables_overdue)}</small></article>
      <article className="metric-card"><span>Cuentas por pagar</span><strong>{money(stats.payables)}</strong><small>Vencido {money(stats.payables_overdue)}</small></article>
      <article className="metric-card"><span>Compras del mes</span><strong>{money(stats.purchases_period)}</strong><small>Gastos {money(stats.expenses_period)}</small></article>
      <article className="metric-card"><span>Ventas DTE producción</span><strong>{money(stats.accepted_dte_total)}</strong><small>{stats.accepted_dte_count||0} aceptados por MH</small></article>
    </div>

    <div className="decision-grid">{decisions.map((d,i)=><article key={`${d.title}-${i}`} className={`decision-card ${d.level}`}><strong>{d.title}</strong><p>{d.detail}</p></article>)}</div>

    <div className="intel-grid three">
      <section className="panel"><p className="form-kicker">PRONÓSTICO DE CAJA</p><h3>Liquidez futura</h3><div className="forecast-list"><Forecast label="7 días" value={stats.forecast7} inValue={stats.due7Ar} outValue={stats.due7Ap}/><Forecast label="30 días" value={stats.forecast30} inValue={stats.due30Ar} outValue={stats.due30Ap}/></div></section>
      <section className="panel"><p className="form-kicker">COBROS Y PAGOS</p><h3>Obligaciones pendientes</h3><div className="forecast-list"><Line label="CxC total" value={stats.receivables}/><Line label="CxC vencida" value={stats.receivables_overdue}/><Line label="CxP total" value={stats.payables}/><Line label="CxP vencida" value={stats.payables_overdue} total/></div></section>
      <section className="panel"><p className="form-kicker">CONTROL FINANCIERO</p><h3>DTE ↔ Finanzas</h3><div className="yesterday-grid"><Mini label="Errores" value={stats.integrityErrors.length}/><Mini label="DTE producción" value={stats.accepted_dte_count||0}/><Mini label="Anticipos pendientes" value={money(stats.pending_advances)}/><Mini label="Stock crítico" value={stats.lowStock.length}/><Mini label="OT atrasadas" value={stats.lateOrders.length}/><Mini label="Caja/Banco" value={money(stats.cash_total)}/></div></section>
    </div>

    <div className="intel-grid two">
      <section className="panel"><p className="form-kicker">COBROS PRIORITARIOS</p><h3>Clientes vencidos</h3>{stats.overdueAr.length?<div className="risk-list">{stats.overdueAr.slice(0,6).map(r=><div key={r.id}><div><strong>{r.clients?.name||'Cliente'}</strong><small>Venció {r.due_date}</small></div><span className="risk-high">{money(balance(r))}</span></div>)}</div>:<div className="intel-empty">No hay cuentas por cobrar vencidas.</div>}</section>
      <section className="panel"><p className="form-kicker">PAGOS PRIORITARIOS</p><h3>Proveedores vencidos</h3>{stats.overdueAp.length?<div className="risk-list">{stats.overdueAp.slice(0,6).map(r=><div key={r.id}><div><strong>{r.suppliers?.name||'Proveedor'}</strong><small>Venció {r.due_date}</small></div><span className="risk-mid">{money(balance(r))}</span></div>)}</div>:<div className="intel-empty">No hay cuentas por pagar vencidas.</div>}</section>
    </div>
  </section>
}

function Forecast({label,value,inValue,outValue}){return <div><span>{label}</span><strong>{money(value)}</strong><small>+{money(inValue)} cobros · -{money(outValue)} pagos</small></div>}
function Line({label,value,total}){return <div className={total?'forecast-total':''}><span>{label}</span><strong>{money(value)}</strong></div>}
function Mini({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}
