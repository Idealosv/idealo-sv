import { useEffect, useMemo, useState } from 'react'

const money = (value) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const iso = (date = new Date()) => date.toISOString().slice(0, 10)
const addDays = (date, days) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); return iso(next) }
const monthStart = (date = new Date()) => `${iso(date).slice(0, 7)}-01`
const previousMonthStart = () => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - 1); return monthStart(date) }
const previousMonthEnd = () => { const date = new Date(); date.setDate(0); return iso(date) }
const balance = (row) => Math.max(0, Number(row.amount_total || row.original_amount || 0) - Number(row.amount_paid || 0))
const open = (row) => !['PAID', 'CANCELLED', 'VOID'].includes(String(row.status || '').toUpperCase())
const signedCash = (row) => ['INCOME', 'TRANSFER_IN'].includes(row.movement_type) ? Number(row.amount || 0) : -Number(row.amount || 0)

function orderCost(orderId, inventoryMoves, orderCosts) {
  const materials = inventoryMoves
    .filter((row) => row.work_order_id === orderId && row.movement_type === 'CONSUMPTION')
    .reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unit_cost || 0), 0)
  const direct = orderCosts
    .filter((row) => row.work_order_id === orderId)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)
  return materials + direct
}

function marginFor(orders, inventoryMoves, orderCosts) {
  const sales = orders.reduce((sum, row) => sum + Number(row.total || 0), 0)
  const cost = orders.reduce((sum, row) => sum + orderCost(row.id, inventoryMoves, orderCosts), 0)
  return sales > 0 ? ((sales - cost) / sales) * 100 : null
}

export default function FinancialAlertsDashboard({ company, supabase }) {
  const [data, setData] = useState({ cashAccounts: [], cashMoves: [], receivables: [], payables: [], reconciliations: [], orders: [], inventoryMoves: [], orderCosts: [] })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = async () => {
    setLoading(true)
    setMessage('')
    const currentStart = monthStart()
    const previousStart = previousMonthStart()
    const results = await Promise.all([
      supabase.from('cash_accounts').select('id,name,account_type,opening_balance,active').eq('company_id', company.id).eq('active', true),
      supabase.from('cash_movements').select('id,cash_account_id,movement_type,amount,movement_date').eq('company_id', company.id),
      supabase.from('accounts_receivable').select('id,number,amount_total,amount_paid,status,due_date,client_id,clients(name)').eq('company_id', company.id),
      supabase.from('accounts_payable').select('id,number,amount_total,amount_paid,status,due_date,supplier_id,suppliers(name)').eq('company_id', company.id),
      supabase.from('cash_reconciliations').select('id,cash_account_id,reconciliation_date,system_balance,statement_balance,difference,status,cash_accounts(name)').eq('company_id', company.id).order('reconciliation_date', { ascending: false }).limit(100),
      supabase.from('work_orders').select('id,number,title,total,status,created_at,client_id,clients(name)').eq('company_id', company.id).gte('created_at', `${previousStart}T00:00:00`).order('created_at', { ascending: false }),
      supabase.from('inventory_movements').select('id,work_order_id,movement_type,quantity,unit_cost,created_at').eq('company_id', company.id).not('work_order_id', 'is', null).gte('created_at', `${previousStart}T00:00:00`),
      supabase.from('work_order_costs').select('id,work_order_id,amount,cost_type,incurred_at').eq('company_id', company.id).gte('incurred_at', previousStart),
    ])
    const error = results.find((row) => row.error)?.error
    if (error) {
      setMessage(error.message)
    } else {
      setData({
        cashAccounts: results[0].data || [],
        cashMoves: results[1].data || [],
        receivables: results[2].data || [],
        payables: results[3].data || [],
        reconciliations: results[4].data || [],
        orders: results[5].data || [],
        inventoryMoves: results[6].data || [],
        orderCosts: results[7].data || [],
      })
      setUpdatedAt(new Date())
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const analysis = useMemo(() => {
    const today = iso()
    const sevenDays = addDays(today, 7)
    const currentStart = monthStart()
    const previousStart = previousMonthStart()
    const previousEnd = previousMonthEnd()

    const cash = data.cashAccounts.reduce((total, account) => {
      const movements = data.cashMoves.filter((row) => row.cash_account_id === account.id)
      return total + Number(account.opening_balance || 0) + movements.reduce((sum, row) => sum + signedCash(row), 0)
    }, 0)

    const overdueArRows = data.receivables.filter((row) => open(row) && row.due_date && row.due_date < today && balance(row) > 0)
    const overdueAr = overdueArRows.reduce((sum, row) => sum + balance(row), 0)
    const dueApRows = data.payables.filter((row) => open(row) && row.due_date && row.due_date >= today && row.due_date <= sevenDays && balance(row) > 0)
    const dueAp7 = dueApRows.reduce((sum, row) => sum + balance(row), 0)
    const overdueApRows = data.payables.filter((row) => open(row) && row.due_date && row.due_date < today && balance(row) > 0)
    const overdueAp = overdueApRows.reduce((sum, row) => sum + balance(row), 0)
    const dueAr7 = data.receivables.filter((row) => open(row) && row.due_date && row.due_date >= today && row.due_date <= sevenDays).reduce((sum, row) => sum + balance(row), 0)
    const projectedCash7 = cash + dueAr7 - dueAp7 - overdueAp

    const latestByAccount = new Map()
    data.reconciliations.forEach((row) => { if (!latestByAccount.has(row.cash_account_id)) latestByAccount.set(row.cash_account_id, row) })
    const reconciliationIssues = [...latestByAccount.values()].filter((row) => String(row.status || '').toUpperCase() !== 'MATCHED' || Math.abs(Number(row.difference || 0)) > 0.01)
    const reconciliationDifference = reconciliationIssues.reduce((sum, row) => sum + Math.abs(Number(row.difference || 0)), 0)

    const currentOrders = data.orders.filter((row) => row.created_at?.slice(0, 10) >= currentStart)
    const previousOrders = data.orders.filter((row) => row.created_at?.slice(0, 10) >= previousStart && row.created_at?.slice(0, 10) <= previousEnd)
    const currentMargin = marginFor(currentOrders, data.inventoryMoves, data.orderCosts)
    const previousMargin = marginFor(previousOrders, data.inventoryMoves, data.orderCosts)
    const marginDrop = currentMargin !== null && previousMargin !== null ? currentMargin - previousMargin : null

    const lossOrders = currentOrders.map((order) => {
      const cost = orderCost(order.id, data.inventoryMoves, data.orderCosts)
      const sale = Number(order.total || 0)
      const profit = sale - cost
      const margin = sale > 0 ? (profit / sale) * 100 : 0
      return { ...order, cost, profit, margin }
    }).filter((row) => Number(row.total || 0) > 0 && row.profit < -0.01).sort((a, b) => a.profit - b.profit)

    const alerts = []
    if (cash < 0) alerts.push({ level: 'critical', code: 'cash-negative', title: 'Caja y bancos en negativo', detail: `Saldo consolidado ${money(cash)}. Revisá pagos y disponibilidad inmediatamente.`, module: 'Caja' })
    else if (dueAp7 > 0 && cash < dueAp7) alerts.push({ level: 'critical', code: 'cash-low', title: 'Caja insuficiente para próximos pagos', detail: `Disponible ${money(cash)} frente a ${money(dueAp7)} por vencer en 7 días.`, module: 'Caja' })
    else if (dueAp7 > 0 && cash < dueAp7 * 1.25) alerts.push({ level: 'important', code: 'cash-tight', title: 'Liquidez ajustada', detail: `La cobertura de pagos a 7 días es ${(cash / Math.max(1, dueAp7)).toFixed(2)}x.`, module: 'Caja' })

    if (overdueAr > 0) alerts.push({ level: 'critical', code: 'ar-overdue', title: 'Cuentas por cobrar vencidas', detail: `${overdueArRows.length} documento(s) por ${money(overdueAr)} requieren gestión de cobro.`, module: 'Caja' })
    if (overdueAp > 0) alerts.push({ level: 'critical', code: 'ap-overdue', title: 'Cuentas por pagar vencidas', detail: `${overdueApRows.length} obligación(es) vencidas por ${money(overdueAp)}.`, module: 'Compras' })
    if (dueAp7 > 0) alerts.push({ level: cash < dueAp7 ? 'critical' : 'important', code: 'ap-due', title: 'CxP próximas a vencer', detail: `${dueApRows.length} pago(s) por ${money(dueAp7)} vencen dentro de 7 días.`, module: 'Compras' })
    if (projectedCash7 < 0) alerts.push({ level: 'critical', code: 'cash-forecast', title: 'Flujo de efectivo negativo a 7 días', detail: `Proyección de caja ${money(projectedCash7)} considerando cobros y pagos con vencimiento.`, module: 'Reportes' })
    if (reconciliationIssues.length) alerts.push({ level: 'critical', code: 'reconciliation', title: 'Diferencias de conciliación', detail: `${reconciliationIssues.length} cuenta(s) presentan diferencias por ${money(reconciliationDifference)}.`, module: 'Caja' })
    if (marginDrop !== null && marginDrop <= -5) alerts.push({ level: marginDrop <= -10 ? 'critical' : 'important', code: 'margin-drop', title: 'Caída de margen', detail: `Margen actual ${currentMargin.toFixed(1)}% vs ${previousMargin.toFixed(1)}% el mes anterior (${marginDrop.toFixed(1)} pp).`, module: 'Reportes' })
    if (currentMargin !== null && currentMargin < 0) alerts.push({ level: 'critical', code: 'margin-negative', title: 'Margen global negativo', detail: `Las órdenes del mes acumulan un margen de ${currentMargin.toFixed(1)}%.`, module: 'Reportes' })
    lossOrders.slice(0, 6).forEach((row) => alerts.push({ level: 'critical', code: `loss-${row.id}`, title: `OT-${String(row.number).padStart(5, '0')} con pérdida`, detail: `${row.clients?.name || 'Cliente'} · pérdida ${money(Math.abs(row.profit))} · margen ${row.margin.toFixed(1)}%.`, module: 'Producción' }))

    const severity = { critical: 0, important: 1, good: 2 }
    alerts.sort((a, b) => severity[a.level] - severity[b.level])
    const critical = alerts.filter((row) => row.level === 'critical').length
    const important = alerts.filter((row) => row.level === 'important').length
    const score = Math.max(0, Math.min(100, 100 - critical * 12 - important * 5))

    return { cash, overdueAr, dueAp7, reconciliationDifference, currentMargin, previousMargin, marginDrop, lossOrders, projectedCash7, alerts, critical, important, score }
  }, [data])

  const openModule = (name) => {
    const button = [...document.querySelectorAll('.idealo-main-menu-item')].find((item) => item.textContent.trim() === name)
    button?.click()
  }

  if (loading) return <section className="financial-alerts-shell panel"><strong>Evaluando alertas financieras…</strong></section>

  return <section className="financial-alerts-shell" aria-label="Alertas financieras automáticas">
    <div className="financial-alerts-head">
      <div><p className="form-kicker">VIGILANCIA FINANCIERA AUTOMÁTICA</p><h2>Alertas ejecutivas</h2><p>Caja, cartera, proveedores, conciliación y rentabilidad analizados con datos del ERP.</p></div>
      <div className="financial-alerts-actions"><span className={`financial-score ${analysis.score >= 80 ? 'good' : analysis.score >= 55 ? 'warn' : 'bad'}`}>Finanzas {analysis.score}/100</span><button type="button" onClick={load}>Actualizar</button></div>
    </div>

    {message && <p className="feedback error">{message}</p>}

    <div className="financial-alert-kpis">
      <article><span>Caja + bancos</span><strong>{money(analysis.cash)}</strong><small>Saldo consolidado</small></article>
      <article><span>CxC vencidas</span><strong>{money(analysis.overdueAr)}</strong><small>{analysis.overdueAr > 0 ? 'Requiere cobro' : 'Sin vencidas'}</small></article>
      <article><span>CxP próximos 7 días</span><strong>{money(analysis.dueAp7)}</strong><small>Compromisos inmediatos</small></article>
      <article><span>Diferencia conciliación</span><strong>{money(analysis.reconciliationDifference)}</strong><small>Última por cuenta</small></article>
      <article><span>Margen del mes</span><strong>{analysis.currentMargin === null ? '—' : `${analysis.currentMargin.toFixed(1)}%`}</strong><small>{analysis.marginDrop === null ? 'Sin comparación' : `${analysis.marginDrop >= 0 ? '+' : ''}${analysis.marginDrop.toFixed(1)} pp vs mes anterior`}</small></article>
      <article><span>Trabajos con pérdida</span><strong>{analysis.lossOrders.length}</strong><small>Órdenes del mes</small></article>
    </div>

    <section className="panel financial-alerts-panel">
      <div className="financial-alerts-title"><div><p className="form-kicker">ATENCIÓN PRIORITARIA</p><h3>Alertas detectadas</h3></div><div className="financial-alert-counts"><span className="critical">{analysis.critical} críticas</span><span>{analysis.important} importantes</span></div></div>
      {analysis.alerts.length ? <div className="financial-alert-list">{analysis.alerts.slice(0, 12).map((alert) => <article className={alert.level} key={alert.code}><span className="financial-alert-dot"/><div><strong>{alert.title}</strong><p>{alert.detail}</p></div><button type="button" onClick={() => openModule(alert.module)}>Ver {alert.module}</button></article>)}</div> : <div className="financial-alert-ok"><strong>Sin alertas financieras críticas</strong><span>La liquidez, cartera, conciliación y rentabilidad no presentan señales automáticas de riesgo.</span></div>}
      <footer>Última evaluación: {updatedAt ? updatedAt.toLocaleString('es-SV') : '—'} · Las alertas se recalculan al actualizar el Dashboard.</footer>
    </section>
  </section>
}
