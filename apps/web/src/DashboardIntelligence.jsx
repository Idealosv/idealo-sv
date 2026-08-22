import { useEffect, useMemo, useState } from 'react'

const money=(v)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const iso=(d=new Date())=>d.toISOString().slice(0,10)
const monthStart=()=>`${iso().slice(0,7)}-01`
const addDays=(date,n)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);return iso(d)}
const sum=(rows,key)=>rows.reduce((s,r)=>s+Number(r?.[key]||0),0)
const balance=(r)=>Math.max(0,Number(r.amount_total||0)-Number(r.amount_paid||0))
const open=(r)=>!['PAID','CANCELLED'].includes(r.status)
const progress=(value,target)=>target?Math.max(0,value/target*100):0
const STORAGE='idealo.dashboard.goals.'

export default function DashboardIntelligence({company,supabase}){
  const [data,setData]=useState({orders:[],payments:[],expenses:[],receivables:[],payables:[],cashAccounts:[],cashMoves:[],inventory:[],quality:[],dtes:[]})
  const [loading,setLoading]=useState(true)
  const [goals,setGoals]=useState({sales:10000,collections:8000,profit:3000})
  const [editing,setEditing]=useState(false)

  useEffect(()=>{const saved=localStorage.getItem(`${STORAGE}${company.id}`);if(saved){try{setGoals(g=>({...g,...JSON.parse(saved)}))}catch{}}},[company.id])

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      setLoading(true)
      const start=monthStart()
      const results=await Promise.all([
        supabase.from('work_orders').select('id,number,title,total,status,priority,due_at,created_at,clients(name)').eq('company_id',company.id).gte('created_at',`${start}T00:00:00`).order('created_at',{ascending:false}),
        supabase.from('customer_payments').select('id,amount,paid_at').eq('company_id',company.id).gte('paid_at',`${start}T00:00:00`),
        supabase.from('expenses').select('id,amount,expense_date').eq('company_id',company.id).gte('expense_date',start),
        supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,clients(name)').eq('company_id',company.id),
        supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,suppliers(name)').eq('company_id',company.id),
        supabase.from('cash_accounts').select('id,name,opening_balance,active').eq('company_id',company.id).eq('active',true),
        supabase.from('cash_movements').select('id,cash_account_id,movement_type,amount,movement_date').eq('company_id',company.id),
        supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,unit').eq('company_id',company.id).eq('active',true),
        supabase.from('quality_incidents').select('id,status,severity,occurred_at').eq('company_id',company.id).gte('occurred_at',`${start}T00:00:00`),
        supabase.from('dte_documents').select('id,status,created_at,control_number').eq('company_id',company.id).gte('created_at',`${start}T00:00:00`),
      ])
      if(!alive)return
      const err=results.find(r=>r.error)?.error
      if(!err)setData({orders:results[0].data||[],payments:results[1].data||[],expenses:results[2].data||[],receivables:results[3].data||[],payables:results[4].data||[],cashAccounts:results[5].data||[],cashMoves:results[6].data||[],inventory:results[7].data||[],quality:results[8].data||[],dtes:results[9].data||[]})
      setLoading(false)
    }
    load();return()=>{alive=false}
  },[company.id,supabase])

  const stats=useMemo(()=>{
    const today=iso(),yesterday=addDays(today,-1),monthDay=Math.max(1,new Date().getDate()),daysInMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()
    const sales=sum(data.orders,'total'),collections=sum(data.payments,'amount'),expenses=sum(data.expenses,'amount')
    const cash=data.cashAccounts.reduce((total,a)=>total+Number(a.opening_balance||0)+data.cashMoves.filter(m=>m.cash_account_id===a.id).reduce((s,m)=>s+(['INCOME','TRANSFER_IN'].includes(m.movement_type)?Number(m.amount||0):-Number(m.amount||0)),0),0)
    const due=(rows,n)=>rows.filter(r=>open(r)&&r.due_date&&r.due_date>=today&&r.due_date<=addDays(today,n)).reduce((s,r)=>s+balance(r),0)
    const ar7=due(data.receivables,7),ar15=due(data.receivables,15),ar30=due(data.receivables,30),ap7=due(data.payables,7),ap15=due(data.payables,15),ap30=due(data.payables,30)
    const overdueAr=data.receivables.filter(r=>open(r)&&r.due_date&&r.due_date<today),overdueAp=data.payables.filter(r=>open(r)&&r.due_date&&r.due_date<today)
    const lowStock=data.inventory.filter(i=>Number(i.current_stock||0)<=Number(i.minimum_stock||0))
    const riskyOrders=data.orders.filter(o=>!['DELIVERED','CANCELLED'].includes(o.status)).map(o=>{let risk=0;const reasons=[];if(o.due_at){const hours=(new Date(o.due_at)-new Date())/36e5;if(hours<0){risk+=60;reasons.push('vencida')}else if(hours<=24){risk+=40;reasons.push('vence en 24 h')}else if(hours<=72){risk+=20;reasons.push('vence en 72 h')}}if(['HIGH','URGENT'].includes(o.priority)){risk+=25;reasons.push('prioridad alta')}if(['PENDING','DESIGN','APPROVAL'].includes(o.status)&&o.due_at&&new Date(o.due_at)-new Date()<72*36e5){risk+=20;reasons.push('avance insuficiente')}return {...o,risk:Math.min(100,risk),reasons}}).filter(o=>o.risk>=20).sort((a,b)=>b.risk-a.risk).slice(0,6)
    const openQuality=data.quality.filter(q=>!['RESOLVED','CANCELLED'].includes(q.status)),rejectedDte=data.dtes.filter(d=>d.status==='REJECTED')
    const ar=data.receivables.filter(open).reduce((s,r)=>s+balance(r),0),ap=data.payables.filter(open).reduce((s,r)=>s+balance(r),0),profit=sales-expenses
    const projectedSales=sales/monthDay*daysInMonth,projectedExpenses=expenses/monthDay*daysInMonth,projectedCollections=collections/monthDay*daysInMonth
    const health=Math.round((Math.max(0,100-riskscore(riskyOrders.length,12))+Math.max(0,100-riskscore(lowStock.length,8))+Math.max(0,100-riskscore(openQuality.length,10))+Math.max(0,100-riskscore(rejectedDte.length,18))+Math.max(0,Math.min(100,50+(cash+ar-ap)/Math.max(1,ap||1)*20))+(sales?Math.max(0,Math.min(100,50+profit/sales*100)):50))/6)
    return {sales,collections,expenses,cash,profit,forecast7:cash+ar7-ap7,forecast15:cash+ar15-ap15,forecast30:cash+ar30-ap30,ar7,ar15,ar30,ap7,ap15,ap30,projectedSales,projectedExpenses,projectedCollections,projectedProfit:projectedSales-projectedExpenses,yesterdaySales:data.orders.filter(o=>o.created_at?.slice(0,10)===yesterday).reduce((s,o)=>s+Number(o.total||0),0),yesterdayCollections:data.payments.filter(p=>p.paid_at?.slice(0,10)===yesterday).reduce((s,p)=>s+Number(p.amount||0),0),yesterdayExpenses:data.expenses.filter(e=>e.expense_date===yesterday).reduce((s,e)=>s+Number(e.amount||0),0),overdueAr,overdueAp,lowStock,riskyOrders,openQuality,rejectedDte,health}
  },[data])

  const decisions=useMemo(()=>{
    const d=[]
    if(stats.riskyOrders.length)d.push({level:'critical',title:`${stats.riskyOrders.length} trabajo(s) en riesgo`,detail:'Revisá fecha de entrega, prioridad y avance.'})
    if(stats.overdueAr.length)d.push({level:'critical',title:`${stats.overdueAr.length} cobro(s) vencido(s)`,detail:`Cartera vencida: ${money(stats.overdueAr.reduce((s,r)=>s+balance(r),0))}`})
    if(stats.lowStock.length)d.push({level:'important',title:`${stats.lowStock.length} material(es) en mínimo`,detail:'Prepará compra antes de afectar producción.'})
    if(stats.forecast7<0)d.push({level:'critical',title:'Caja proyectada negativa en 7 días',detail:`Proyección: ${money(stats.forecast7)}`})
    if(stats.overdueAp.length)d.push({level:'important',title:`${stats.overdueAp.length} pago(s) vencido(s)`,detail:`Proveedores: ${money(stats.overdueAp.reduce((s,r)=>s+balance(r),0))}`})
    if(stats.rejectedDte.length)d.push({level:'critical',title:`${stats.rejectedDte.length} DTE rechazado(s)`,detail:'Revisar transmisión con Hacienda.'})
    if(stats.openQuality.length)d.push({level:'important',title:`${stats.openQuality.length} incidencia(s) de calidad`,detail:'Pueden afectar costo, entrega y margen.'})
    if(!d.length)d.push({level:'good',title:'Operación sin alertas críticas',detail:'No hay riesgos importantes detectados con los datos actuales.'})
    return d.slice(0,5)
  },[stats])

  const saveGoals=()=>{localStorage.setItem(`${STORAGE}${company.id}`,JSON.stringify(goals));setEditing(false)}
  if(loading)return <section className="intel-shell panel"><strong>Analizando decisiones y proyecciones…</strong></section>

  return <section className="dashboard-intelligence">
    <div className="intel-head"><div><p className="form-kicker">INTELIGENCIA OPERATIVA</p><h2>Centro de decisiones</h2><p>Prioriza lo que necesita atención y proyecta el cierre con datos reales del ERP.</p></div><div className={`health-score ${stats.health>=75?'good':stats.health>=50?'warn':'bad'}`}><span>Índice IDEALO</span><strong>{stats.health}/100</strong><small>{stats.health>=75?'Salud buena':stats.health>=50?'Requiere atención':'Atención prioritaria'}</small></div></div>
    <div className="decision-grid">{decisions.map((d,i)=><article key={`${d.title}-${i}`} className={`decision-card ${d.level}`}><strong>{d.title}</strong><p>{d.detail}</p></article>)}</div>
    <div className="intel-grid three">
      <section className="panel"><p className="form-kicker">PRONÓSTICO DE CAJA</p><h3>Liquidez futura</h3><div className="forecast-list"><Forecast label="7 días" value={stats.forecast7} inValue={stats.ar7} outValue={stats.ap7}/><Forecast label="15 días" value={stats.forecast15} inValue={stats.ar15} outValue={stats.ap15}/><Forecast label="30 días" value={stats.forecast30} inValue={stats.ar30} outValue={stats.ap30}/></div></section>
      <section className="panel"><p className="form-kicker">CIERRE DE MES</p><h3>Proyección al ritmo actual</h3><div className="forecast-list"><Line label="Ventas" value={stats.projectedSales}/><Line label="Cobros" value={stats.projectedCollections}/><Line label="Gastos" value={stats.projectedExpenses}/><Line label="Resultado proyectado" value={stats.projectedProfit} total/></div></section>
      <section className="panel"><p className="form-kicker">QUÉ CAMBIÓ DESDE AYER</p><h3>Movimiento reciente</h3><div className="yesterday-grid"><Mini label="Ventas" value={money(stats.yesterdaySales)}/><Mini label="Cobros" value={money(stats.yesterdayCollections)}/><Mini label="Gastos" value={money(stats.yesterdayExpenses)}/><Mini label="Riesgos OT" value={stats.riskyOrders.length}/><Mini label="Stock crítico" value={stats.lowStock.length}/><Mini label="DTE rechazados" value={stats.rejectedDte.length}/></div></section>
    </div>
    <div className="intel-grid two">
      <section className="panel"><p className="form-kicker">TRABAJOS EN RIESGO</p><h3>Órdenes que requieren seguimiento</h3>{stats.riskyOrders.length?<div className="risk-list">{stats.riskyOrders.map(o=><div key={o.id}><div><strong>OT-{String(o.number).padStart(5,'0')} · {o.clients?.name||'Cliente'}</strong><small>{o.title} · {o.reasons.join(' · ')}</small></div><span className={o.risk>=60?'risk-high':'risk-mid'}>{o.risk}% riesgo</span></div>)}</div>:<div className="intel-empty">No se detectan órdenes con riesgo relevante.</div>}</section>
      <section className="panel"><div className="intel-section-head"><div><p className="form-kicker">METAS DEL MES</p><h3>Objetivos de gestión</h3></div><button type="button" className="intel-edit" onClick={()=>setEditing(!editing)}>{editing?'Cancelar':'Configurar'}</button></div>{editing?<div className="goal-editor"><label>Ventas<input type="number" value={goals.sales} onChange={e=>setGoals({...goals,sales:Number(e.target.value)})}/></label><label>Cobros<input type="number" value={goals.collections} onChange={e=>setGoals({...goals,collections:Number(e.target.value)})}/></label><label>Resultado<input type="number" value={goals.profit} onChange={e=>setGoals({...goals,profit:Number(e.target.value)})}/></label><button type="button" onClick={saveGoals}>Guardar metas</button></div>:<div className="goal-list"><Goal label="Ventas" value={stats.sales} target={goals.sales}/><Goal label="Cobros" value={stats.collections} target={goals.collections}/><Goal label="Resultado" value={stats.profit} target={goals.profit}/></div>}</section>
    </div>
  </section>
}

const riskscore=(count,weight)=>Math.min(100,count*weight)
function Forecast({label,value,inValue,outValue}){return <div><span>{label}</span><strong>{money(value)}</strong><small>+{money(inValue)} cobros · -{money(outValue)} pagos</small></div>}
function Line({label,value,total}){return <div className={total?'forecast-total':''}><span>{label}</span><strong>{money(value)}</strong></div>}
function Mini({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}
function Goal({label,value,target}){const p=progress(value,target);return <div className="goal-row"><div><span>{label}</span><strong>{money(value)} / {money(target)}</strong></div><div className="goal-track"><i style={{width:`${Math.min(100,p)}%`}}/></div><small>{p.toFixed(0)}%</small></div>}
