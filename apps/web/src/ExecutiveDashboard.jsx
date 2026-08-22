import { useEffect, useMemo, useState } from 'react'

const money=(v)=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(v||0))
const pct=(v)=>`${Number(v||0).toFixed(1)}%`
const isoDate=(d=new Date())=>d.toISOString().slice(0,10)
const monthStart=()=>`${isoDate().slice(0,7)}-01`
const sum=(rows,key)=>rows.reduce((s,r)=>s+Number(r?.[key]||0),0)
const balance=(row)=>Math.max(0,Number(row.amount_total||0)-Number(row.amount_paid||0))
const isOpen=(row)=>!['PAID','CANCELLED'].includes(row.status)
const startOfDay=(date)=>`${date}T00:00:00`
const endOfDay=(date)=>`${date}T23:59:59`
const daysBetween=(a,b)=>Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1)
const previousRange=(from,to)=>{const days=daysBetween(from,to);const end=new Date(`${from}T00:00:00`);end.setDate(end.getDate()-1);const start=new Date(end);start.setDate(start.getDate()-(days-1));return {from:isoDate(start),to:isoDate(end)}}

const STATUS_LABELS={PENDING:'Pendiente',DESIGN:'Diseño',APPROVAL:'Aprobación',PRODUCTION:'Producción',READY:'Listo',DELIVERED:'Entregado',CANCELLED:'Cancelado'}

function openMainModule(name){
  const buttons=[...document.querySelectorAll('.idealo-main-menu-item')]
  buttons.find((button)=>button.textContent.trim()===name)?.click()
}

export default function ExecutiveDashboard({company,supabase}){
  const [from,setFrom]=useState(monthStart())
  const [to,setTo]=useState(isoDate())
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [system,setSystem]=useState({api:'checking',database:'checking'})
  const [data,setData]=useState({clients:[],quotes:[],orders:[],receivables:[],customerPayments:[],purchases:[],expenses:[],payables:[],supplierPayments:[],cashAccounts:[],cashMoves:[],inventoryItems:[],inventoryMoves:[],orderCosts:[],deliveries:[],schedule:[],qualityIncidents:[],employees:[],attendance:[],commissions:[],dtes:[],products:[],orderItems:[],prevOrders:[],prevPayments:[],prevExpenses:[]})

  const load=async()=>{
    setLoading(true);setMessage('')
    const prev=previousRange(from,to)
    const start=startOfDay(from),end=endOfDay(to)
    const prevStart=startOfDay(prev.from),prevEnd=endOfDay(prev.to)
    const queries=[
      supabase.from('clients').select('id,name,status,client_type,preferred_dte_type,created_at').eq('company_id',company.id),
      supabase.from('quotes').select('id,number,status,total,valid_until,created_at,client_id,clients(name)').eq('company_id',company.id).gte('created_at',start).lte('created_at',end).order('created_at',{ascending:false}),
      supabase.from('work_orders').select('id,number,title,total,status,priority,due_at,created_at,client_id,clients(name)').eq('company_id',company.id).order('created_at',{ascending:false}),
      supabase.from('accounts_receivable').select('id,number,amount_total,amount_paid,status,due_date,created_at,client_id,clients(name)').eq('company_id',company.id),
      supabase.from('customer_payments').select('id,amount,paid_at,payment_method,client_id,clients(name)').eq('company_id',company.id).gte('paid_at',start).lte('paid_at',end).order('paid_at',{ascending:false}),
      supabase.from('purchases').select('id,number,total,purchase_date,payment_status,due_date,concept,supplier_id,suppliers(name)').eq('company_id',company.id).gte('purchase_date',from).lte('purchase_date',to).order('purchase_date',{ascending:false}),
      supabase.from('expenses').select('id,amount,expense_date,category,concept').eq('company_id',company.id).gte('expense_date',from).lte('expense_date',to).order('expense_date',{ascending:false}),
      supabase.from('accounts_payable').select('id,number,amount_total,amount_paid,status,due_date,created_at,supplier_id,suppliers(name)').eq('company_id',company.id),
      supabase.from('supplier_payments').select('id,amount,paid_at,payment_method,supplier_id,suppliers(name)').eq('company_id',company.id).gte('paid_at',start).lte('paid_at',end).order('paid_at',{ascending:false}),
      supabase.from('cash_accounts').select('id,name,account_type,opening_balance,active').eq('company_id',company.id).eq('active',true),
      supabase.from('cash_movements').select('id,cash_account_id,movement_type,source_type,amount,movement_date,concept').eq('company_id',company.id).order('movement_date',{ascending:false}),
      supabase.from('inventory_items').select('id,name,sku,category,unit,current_stock,average_cost,minimum_stock,active').eq('company_id',company.id).eq('active',true),
      supabase.from('inventory_movements').select('id,inventory_item_id,work_order_id,movement_type,quantity,unit_cost,created_at').eq('company_id',company.id).gte('created_at',start).lte('created_at',end),
      supabase.from('work_order_costs').select('id,work_order_id,cost_type,amount,source_type,incurred_at').eq('company_id',company.id).gte('incurred_at',from).lte('incurred_at',to),
      supabase.from('deliveries').select('id,number,status,delivery_method,scheduled_at,delivered_at,delivery_address,work_order_id,client_id,clients(name)').eq('company_id',company.id).order('scheduled_at',{ascending:true}),
      supabase.from('production_schedule_events').select('id,title,event_type,status,priority,scheduled_start,scheduled_end,estimated_hours,location,work_order_id').eq('company_id',company.id).order('scheduled_start',{ascending:true}),
      supabase.from('quality_incidents').select('id,title,incident_type,severity,status,material_cost,labor_cost,outsourced_cost,other_cost,occurred_at,work_order_id').eq('company_id',company.id).order('occurred_at',{ascending:false}),
      supabase.from('employees').select('id,full_name,position,active,hourly_cost').eq('company_id',company.id).eq('active',true),
      supabase.from('attendance_records').select('id,employee_id,work_date,status,check_in,check_out').eq('company_id',company.id).eq('work_date',isoDate()),
      supabase.from('employee_commissions').select('id,employee_id,amount,status,commission_date').eq('company_id',company.id),
      supabase.from('dte_documents').select('id,dte_type,status,environment,control_number,mh_receipt_seal,mh_message,created_at,updated_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(50),
      supabase.from('finished_products').select('id,name,category,sale_price,active').eq('company_id',company.id).eq('active',true),
      supabase.from('work_order_items').select('id,work_order_id,product_id,description,quantity,line_total').order('id',{ascending:false}).limit(1000),
      supabase.from('work_orders').select('id,total,created_at').eq('company_id',company.id).gte('created_at',prevStart).lte('created_at',prevEnd),
      supabase.from('customer_payments').select('id,amount,paid_at').eq('company_id',company.id).gte('paid_at',prevStart).lte('paid_at',prevEnd),
      supabase.from('expenses').select('id,amount,expense_date').eq('company_id',company.id).gte('expense_date',prev.from).lte('expense_date',prev.to),
    ]
    const r=await Promise.all(queries)
    const err=r.find((x)=>x.error)?.error
    if(err)setMessage(err.message)
    else setData({clients:r[0].data||[],quotes:r[1].data||[],orders:r[2].data||[],receivables:r[3].data||[],customerPayments:r[4].data||[],purchases:r[5].data||[],expenses:r[6].data||[],payables:r[7].data||[],supplierPayments:r[8].data||[],cashAccounts:r[9].data||[],cashMoves:r[10].data||[],inventoryItems:r[11].data||[],inventoryMoves:r[12].data||[],orderCosts:r[13].data||[],deliveries:r[14].data||[],schedule:r[15].data||[],qualityIncidents:r[16].data||[],employees:r[17].data||[],attendance:r[18].data||[],commissions:r[19].data||[],dtes:r[20].data||[],products:r[21].data||[],orderItems:r[22].data||[],prevOrders:r[23].data||[],prevPayments:r[24].data||[],prevExpenses:r[25].data||[]})
    setLoading(false)
  }

  useEffect(()=>{load()},[company.id,from,to])
  useEffect(()=>{const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000';fetch(`${apiUrl}/api/system/status`).then(r=>r.ok?r.json():Promise.reject()).then(s=>setSystem({api:s.api||'ok',database:s.database||'ok'})).catch(()=>setSystem({api:'offline',database:'unknown'}))},[])

  const metrics=useMemo(()=>{
    const periodOrders=data.orders.filter(o=>o.created_at>=startOfDay(from)&&o.created_at<=endOfDay(to))
    const sales=sum(periodOrders,'total'),collections=sum(data.customerPayments,'amount'),purchases=sum(data.purchases,'total'),expenses=sum(data.expenses,'amount')
    const consumption=data.inventoryMoves.filter(m=>m.movement_type==='CONSUMPTION')
    const materialCost=consumption.reduce((s,m)=>s+Number(m.quantity||0)*Number(m.unit_cost||0),0)
    const directCosts=sum(data.orderCosts,'amount'),realCost=materialCost+directCosts,grossProfit=sales-realCost,operatingProfit=grossProfit-expenses,margin=sales?operatingProfit/sales*100:0
    const arOpen=data.receivables.filter(isOpen).reduce((s,r)=>s+balance(r),0),apOpen=data.payables.filter(isOpen).reduce((s,r)=>s+balance(r),0)
    const overdueAr=data.receivables.filter(r=>isOpen(r)&&r.due_date&&r.due_date<isoDate()).reduce((s,r)=>s+balance(r),0),overdueAp=data.payables.filter(r=>isOpen(r)&&r.due_date&&r.due_date<isoDate()).reduce((s,r)=>s+balance(r),0)
    const cash=data.cashAccounts.reduce((total,a)=>{const moves=data.cashMoves.filter(m=>m.cash_account_id===a.id);return total+Number(a.opening_balance||0)+moves.reduce((s,m)=>s+(['INCOME','TRANSFER_IN'].includes(m.movement_type)?Number(m.amount||0):-Number(m.amount||0)),0)},0)
    const activeOrders=data.orders.filter(o=>!['DELIVERED','CANCELLED'].includes(o.status)),lateOrders=activeOrders.filter(o=>o.due_at&&o.due_at<new Date().toISOString())
    const lowStock=data.inventoryItems.filter(i=>Number(i.current_stock||0)<=Number(i.minimum_stock||0)),stockValue=data.inventoryItems.reduce((s,i)=>s+Number(i.current_stock||0)*Number(i.average_cost||0),0)
    const openIncidents=data.qualityIncidents.filter(i=>!['RESOLVED','CANCELLED'].includes(i.status)),reworkCost=data.qualityIncidents.filter(i=>i.occurred_at>=startOfDay(from)&&i.occurred_at<=endOfDay(to)).reduce((s,i)=>s+Number(i.material_cost||0)+Number(i.labor_cost||0)+Number(i.outsourced_cost||0)+Number(i.other_cost||0),0)
    const prevSales=sum(data.prevOrders,'total'),prevCollections=sum(data.prevPayments,'amount'),prevExpenses=sum(data.prevExpenses,'amount')
    const trend=(current,previous)=>previous?((current-previous)/previous*100):current?100:0
    return {periodOrders,sales,collections,purchases,expenses,materialCost,directCosts,realCost,grossProfit,operatingProfit,margin,arOpen,apOpen,overdueAr,overdueAp,cash,activeOrders,lateOrders,lowStock,stockValue,openIncidents,reworkCost,prevSales,prevCollections,prevExpenses,salesTrend:trend(sales,prevSales),collectionTrend:trend(collections,prevCollections),expenseTrend:trend(expenses,prevExpenses)}
  },[data,from,to])

  const production=useMemo(()=>['PENDING','DESIGN','APPROVAL','PRODUCTION','READY','DELIVERED'].map(status=>({status,count:data.orders.filter(o=>o.status===status).length})),[data.orders])
  const expenseGroups=useMemo(()=>Object.entries(data.expenses.reduce((a,r)=>{a[r.category]=(a[r.category]||0)+Number(r.amount||0);return a},{})).sort((a,b)=>b[1]-a[1]),[data.expenses])
  const todayAgenda=useMemo(()=>data.schedule.filter(e=>e.scheduled_start?.slice(0,10)===isoDate()&&!['COMPLETED','CANCELLED'].includes(e.status)).slice(0,8),[data.schedule])
  const todayDeliveries=useMemo(()=>data.deliveries.filter(d=>d.scheduled_at?.slice(0,10)===isoDate()&&!['DELIVERED','CANCELLED'].includes(d.status)),[data.deliveries])
  const topOrders=useMemo(()=>metrics.periodOrders.map(o=>{const material=data.inventoryMoves.filter(m=>m.work_order_id===o.id&&m.movement_type==='CONSUMPTION').reduce((s,m)=>s+Number(m.quantity||0)*Number(m.unit_cost||0),0);const other=data.orderCosts.filter(c=>c.work_order_id===o.id).reduce((s,c)=>s+Number(c.amount||0),0);const cost=material+other,profit=Number(o.total||0)-cost;return {...o,cost,profit,margin:Number(o.total||0)?profit/Number(o.total)*100:0}}).sort((a,b)=>b.profit-a.profit).slice(0,8),[data,metrics.periodOrders])
  const quoteStats=useMemo(()=>({total:data.quotes.length,amount:sum(data.quotes,'total'),approved:data.quotes.filter(q=>['APPROVED','CONVERTED'].includes(q.status)).length,pending:data.quotes.filter(q=>['DRAFT','SENT'].includes(q.status)).length,rejected:data.quotes.filter(q=>q.status==='REJECTED').length,expired:data.quotes.filter(q=>q.status==='EXPIRED').length,conversion:data.quotes.length?data.quotes.filter(q=>['APPROVED','CONVERTED'].includes(q.status)).length/data.quotes.length*100:0}),[data.quotes])
  const dteStats=useMemo(()=>({processed:data.dtes.filter(d=>d.status==='PROCESSED').length,rejected:data.dtes.filter(d=>d.status==='REJECTED').length,pending:data.dtes.filter(d=>!['PROCESSED','REJECTED','INVALIDATED'].includes(d.status)).length,latest:data.dtes[0]}),[data.dtes])
  const alerts=useMemo(()=>{
    const rows=[]
    metrics.lateOrders.forEach(o=>rows.push({level:'critical',title:`OT-${o.number} atrasada`,detail:o.title}))
    data.receivables.filter(r=>isOpen(r)&&r.due_date&&r.due_date<isoDate()).slice(0,5).forEach(r=>rows.push({level:'critical',title:'Cobro vencido',detail:`${r.clients?.name||'Cliente'} · ${money(balance(r))}`}))
    data.payables.filter(r=>isOpen(r)&&r.due_date&&r.due_date<isoDate()).slice(0,5).forEach(r=>rows.push({level:'important',title:'Pago a proveedor vencido',detail:`${r.suppliers?.name||'Proveedor'} · ${money(balance(r))}`}))
    metrics.lowStock.slice(0,6).forEach(i=>rows.push({level:Number(i.current_stock)<=0?'critical':'important',title:`Stock ${Number(i.current_stock)<=0?'agotado':'bajo'}`,detail:`${i.name}: ${i.current_stock} ${i.unit}`}))
    data.dtes.filter(d=>d.status==='REJECTED').slice(0,3).forEach(d=>rows.push({level:'critical',title:'DTE rechazado',detail:d.control_number||d.mh_message||'Revisar transmisión'}))
    metrics.openIncidents.slice(0,4).forEach(i=>rows.push({level:i.severity==='CRITICAL'?'critical':'important',title:'Incidencia de calidad',detail:i.title}))
    return rows.slice(0,14)
  },[data,metrics])
  const health=useMemo(()=>Math.max(0,Math.min(100,100-(metrics.lateOrders.length*5)-(metrics.lowStock.length*2)-(metrics.openIncidents.length*4)-(metrics.overdueAr>0?8:0)-(metrics.overdueAp>0?6:0)-(dteStats.rejected*5)-(metrics.operatingProfit<0?15:0))),[metrics,dteStats])
  const activity=useMemo(()=>[
    ...data.customerPayments.map(r=>({at:r.paid_at,label:`Cobro ${money(r.amount)} · ${r.clients?.name||'Cliente'}`})),
    ...data.purchases.map(r=>({at:`${r.purchase_date}T12:00:00`,label:`Compra ${money(r.total)} · ${r.suppliers?.name||r.concept}`})),
    ...metrics.periodOrders.map(r=>({at:r.created_at,label:`OT-${r.number} creada · ${r.title}`})),
    ...data.dtes.map(r=>({at:r.updated_at,label:`DTE ${r.control_number||r.dte_type} · ${r.status}`})),
    ...data.qualityIncidents.map(r=>({at:r.occurred_at,label:`Calidad · ${r.title}`})),
  ].filter(x=>x.at).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,10),[data,metrics.periodOrders])

  if(loading)return <section className="loading-card"><span className="spinner"/><p>Preparando el tablero ejecutivo…</p></section>

  return <section className="executive-dashboard">
    <div className="exec-head">
      <div><p className="form-kicker">CENTRO DE CONTROL · {company.name}</p><h2>Dashboard</h2><p>Ventas, producción, caja, inventario, agenda, calidad y DTE en tiempo real.</p></div>
      <div className="exec-head-actions"><span className={`health-badge ${health>=80?'good':health>=60?'warn':'bad'}`}>Salud {health}/100</span><button type="button" className="exec-refresh" onClick={load}>Actualizar</button></div>
    </div>

    <section className="panel exec-filter"><div className="exec-presets"><button onClick={()=>{const d=isoDate();setFrom(d);setTo(d)}}>Hoy</button><button onClick={()=>{const d=new Date();const day=d.getDay()||7;d.setDate(d.getDate()-day+1);setFrom(isoDate(d));setTo(isoDate())}}>Semana</button><button onClick={()=>{setFrom(monthStart());setTo(isoDate())}}>Mes</button></div><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></section>
    {message&&<p className="feedback error">{message}</p>}

    <div className="exec-kpis">
      <Kpi label="Ventas" value={money(metrics.sales)} trend={metrics.salesTrend} note={`${metrics.periodOrders.length} órdenes`}/>
      <Kpi label="Cobrado" value={money(metrics.collections)} trend={metrics.collectionTrend} note="Pagos de clientes"/>
      <Kpi label="Por cobrar" value={money(metrics.arOpen)} note={`${money(metrics.overdueAr)} vencido`}/>
      <Kpi label="Caja + bancos" value={money(metrics.cash)} note={`${data.cashAccounts.length} cuentas activas`}/>
      <Kpi label="Utilidad operativa" value={money(metrics.operatingProfit)} note={`Margen ${pct(metrics.margin)}`} tone={metrics.operatingProfit<0?'bad':'good'}/>
      <Kpi label="Órdenes activas" value={metrics.activeOrders.length} note={`${metrics.lateOrders.length} atrasadas`} tone={metrics.lateOrders.length?'bad':''}/>
    </div>

    <div className="exec-grid two">
      <Panel title="Ventas y resultado" kicker="ESTADO DEL PERÍODO"><div className="exec-statement"><Row label="Ventas" value={money(metrics.sales)}/><Row label="Material consumido" value={`- ${money(metrics.materialCost)}`}/><Row label="Costos directos" value={`- ${money(metrics.directCosts)}`}/><Row label="Gastos operativos" value={`- ${money(metrics.expenses)}`}/><Row label="Utilidad operativa" value={money(metrics.operatingProfit)} strong/><Row label="Margen" value={pct(metrics.margin)} strong/></div><div className="exec-trends"><span>Ventas vs período anterior <b className={metrics.salesTrend>=0?'up':'down'}>{metrics.salesTrend>=0?'+':''}{pct(metrics.salesTrend)}</b></span><span>Gastos vs anterior <b className={metrics.expenseTrend<=0?'up':'down'}>{metrics.expenseTrend>=0?'+':''}{pct(metrics.expenseTrend)}</b></span></div></Panel>
      <Panel title="Estado de producción" kicker="ÓRDENES DE TRABAJO"><div className="status-bars">{production.map(p=><div key={p.status}><span>{STATUS_LABELS[p.status]}</span><div><i style={{width:`${Math.min(100,p.count/Math.max(1,data.orders.length)*100)}%`}}/></div><strong>{p.count}</strong></div>)}</div><button className="link-action" onClick={()=>openMainModule('Producción')}>Abrir Producción</button></Panel>
    </div>

    <Panel title="Necesita atención" kicker="ALERTAS PRIORITARIAS" action={<span className="alert-count">{alerts.length}</span>}>
      {alerts.length?<div className="attention-list">{alerts.map((a,i)=><div key={`${a.title}-${i}`} className={`attention-row ${a.level}`}><span/><div><strong>{a.title}</strong><small>{a.detail}</small></div></div>)}</div>:<div className="exec-empty"><strong>Sin alertas críticas</strong><span>Todo está bajo control por ahora.</span></div>}
    </Panel>

    <div className="exec-grid two">
      <Panel title="Agenda de hoy" kicker="OPERACIÓN"><div className="agenda-list">{todayAgenda.length?todayAgenda.map(e=><div key={e.id}><time>{new Date(e.scheduled_start).toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}</time><div><strong>{e.title}</strong><small>{e.event_type} · {e.priority}</small></div></div>):<div className="exec-empty"><span>No hay actividades pendientes hoy.</span></div>}</div>{todayDeliveries.length>0&&<div className="delivery-note">{todayDeliveries.length} entrega(s)/instalación(es) programadas hoy</div>}<button className="link-action" onClick={()=>openMainModule('Agenda')}>Abrir Agenda</button></Panel>
      <Panel title="Cotizaciones" kicker="CONVERSIÓN COMERCIAL"><div className="mini-kpis"><Mini label="Total" value={quoteStats.total}/><Mini label="Aprobadas" value={quoteStats.approved}/><Mini label="Pendientes" value={quoteStats.pending}/><Mini label="Conversión" value={pct(quoteStats.conversion)}/></div><div className="quote-amount">Monto cotizado <strong>{money(quoteStats.amount)}</strong></div><button className="link-action" onClick={()=>openMainModule('Cotizaciones')}>Abrir Cotizaciones</button></Panel>
    </div>

    <div className="exec-grid three">
      <Panel title="Cuentas por cobrar" kicker="CLIENTES"><Big value={money(metrics.arOpen)}/><SmallLine label="Vencido" value={money(metrics.overdueAr)} danger={metrics.overdueAr>0}/><SmallLine label="Cobrado período" value={money(metrics.collections)}/></Panel>
      <Panel title="Cuentas por pagar" kicker="PROVEEDORES"><Big value={money(metrics.apOpen)}/><SmallLine label="Vencido" value={money(metrics.overdueAp)} danger={metrics.overdueAp>0}/><SmallLine label="Pagado período" value={money(sum(data.supplierPayments,'amount'))}/></Panel>
      <Panel title="Inventario interno" kicker="ALMACÉN"><Big value={money(metrics.stockValue)}/><SmallLine label="Stock bajo / agotado" value={metrics.lowStock.length} danger={metrics.lowStock.length>0}/><SmallLine label="Materiales activos" value={data.inventoryItems.length}/></Panel>
    </div>

    <div className="exec-grid two">
      <Panel title="Gastos por categoría" kicker="CONTROL OPERATIVO">{expenseGroups.length?<div className="expense-list">{expenseGroups.slice(0,8).map(([name,value])=><div key={name}><span>{name}</span><div><i style={{width:`${Math.min(100,value/Math.max(1,expenseGroups[0][1])*100)}%`}}/></div><strong>{money(value)}</strong></div>)}</div>:<div className="exec-empty"><span>Sin gastos en el período.</span></div>}</Panel>
      <Panel title="Calidad y retrabajos" kicker="COSTO DE ERRORES"><div className="mini-kpis"><Mini label="Abiertas" value={metrics.openIncidents.length}/><Mini label="Costo retrabajo" value={money(metrics.reworkCost)}/><Mini label="Críticas" value={data.qualityIncidents.filter(i=>i.severity==='CRITICAL'&&!['RESOLVED','CANCELLED'].includes(i.status)).length}/></div><p className="panel-note">Los costos de incidencias ya forman parte del costo real de cada OT.</p></Panel>
    </div>

    <Panel title="Rentabilidad por orden" kicker="TRABAJOS MÁS RENTABLES">
      {topOrders.length?<div className="exec-table-wrap"><table className="exec-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Venta</th><th>Costo real</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>{topOrders.map(o=><tr key={o.id}><td>OT-{String(o.number).padStart(5,'0')}</td><td>{o.clients?.name||'Cliente'}</td><td>{money(o.total)}</td><td>{money(o.cost)}</td><td className={o.profit<0?'negative':''}>{money(o.profit)}</td><td><span className={`margin-pill ${o.margin>=30?'good':o.margin>=0?'warn':'bad'}`}>{pct(o.margin)}</span></td></tr>)}</tbody></table></div>:<div className="exec-empty"><span>La rentabilidad aparecerá cuando existan órdenes en el período.</span></div>}
    </Panel>

    <div className="exec-grid two">
      <Panel title="Facturación electrónica DTE" kicker="MINISTERIO DE HACIENDA"><div className="mini-kpis"><Mini label="Procesados" value={dteStats.processed}/><Mini label="Pendientes" value={dteStats.pending}/><Mini label="Rechazados" value={dteStats.rejected}/></div><div className="dte-health"><span>Ambiente</span><strong>{(dteStats.latest?.environment||'test').toUpperCase()}</strong><span>Último DTE</span><strong>{dteStats.latest?.control_number||'Sin documentos'}</strong></div><button className="link-action" onClick={()=>openMainModule('Facturación')}>Abrir Facturación</button></Panel>
      <Panel title="Personal de hoy" kicker="EQUIPO"><div className="mini-kpis"><Mini label="Activos" value={data.employees.length}/><Mini label="Presentes" value={data.attendance.filter(a=>a.status==='PRESENT').length}/><Mini label="Ausentes" value={data.attendance.filter(a=>a.status==='ABSENT').length}/><Mini label="Comisiones pendientes" value={money(data.commissions.filter(c=>c.status==='PENDING').reduce((s,c)=>s+Number(c.amount||0),0))}/></div></Panel>
    </div>

    <div className="exec-grid two">
      <Panel title="Resumen inteligente" kicker="ASISTENTE IA"><div className="ai-brief"><strong>{metrics.operatingProfit>=0?'Operación positiva':'Atención al resultado del período'}</strong><p>{`En el período registrás ${money(metrics.sales)} en ventas, ${money(metrics.collections)} cobrados y ${money(metrics.arOpen)} pendientes por cobrar. Hay ${metrics.activeOrders.length} órdenes activas, ${metrics.lateOrders.length} atrasadas y ${metrics.lowStock.length} materiales en nivel crítico.`}</p></div><button className="link-action" onClick={()=>openMainModule('Asistente IA')}>Abrir Asistente IA</button></Panel>
      <Panel title="Estado del sistema" kicker="SEGURIDAD Y SERVICIOS"><div className="system-list"><SmallLine label="API" value={system.api==='ok'?'Conectada':system.api}/><SmallLine label="Base de datos" value={system.database==='ok'?'Conectada':system.database}/><SmallLine label="Supabase RLS" value="Activo"/><SmallLine label="Empresa" value={company.name}/></div></Panel>
    </div>

    <Panel title="Actividad reciente" kicker="TRAZABILIDAD">{activity.length?<div className="activity-list">{activity.map((a,i)=><div key={`${a.at}-${i}`}><time>{new Date(a.at).toLocaleString('es-SV',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time><span>{a.label}</span></div>)}</div>:<div className="exec-empty"><span>Los movimientos de la empresa aparecerán aquí.</span></div>}</Panel>

    <Panel title="Acciones rápidas" kicker="CREAR Y OPERAR"><div className="quick-actions">{['Clientes','Productos','Cotizaciones','Producción','Compras','Caja','Agenda','Facturación'].map(name=><button key={name} onClick={()=>openMainModule(name)}>{name}</button>)}</div></Panel>
  </section>
}

function Kpi({label,value,note,trend,tone=''}){return <article className={`exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{trend!==undefined?<b className={trend>=0?'up':'down'}>{trend>=0?'+':''}{pct(trend)} </b>:null}{note}</small></article>}
function Panel({title,kicker,action,children}){return <section className="panel exec-panel"><div className="exec-panel-head"><div><p className="form-kicker">{kicker}</p><h3>{title}</h3></div>{action}</div>{children}</section>}
function Row({label,value,strong}) {return <div className={strong?'strong':''}><span>{label}</span><b>{value}</b></div>}
function Mini({label,value}){return <div><span>{label}</span><strong>{value}</strong></div>}
function Big({value}){return <div className="big-number">{value}</div>}
function SmallLine({label,value,danger}){return <div className="small-line"><span>{label}</span><strong className={danger?'danger':''}>{value}</strong></div>}
