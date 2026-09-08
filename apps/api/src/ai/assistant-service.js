function httpError(message, statusCode = 400, code = 'AI_REQUEST_ERROR') {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function bearer(request) {
  const value = String(request.headers?.authorization || '')
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

async function getActor({ request, supabase, companyId }) {
  const token = bearer(request)
  if (!token) throw httpError('Sesión requerida.', 401, 'AUTH_REQUIRED')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw httpError('Sesión inválida o vencida.', 401, 'AUTH_INVALID')
  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) throw httpError('No tenés acceso a esta empresa.', 403, 'COMPANY_ACCESS_DENIED')
  return { user, role: String(membership.role || 'viewer') }
}

const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const today = () => new Date().toISOString().slice(0, 10)
const remaining = (row) => Math.max(0, safeNumber(row.amount_total) - safeNumber(row.amount_paid))
const money = (value) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(safeNumber(value))
const percent = (value) => `${safeNumber(value).toFixed(1)}%`

function isoDateOffset(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dateValue(value) {
  const ts = Date.parse(value || '')
  return Number.isFinite(ts) ? ts : 0
}

async function query(supabase, builder, label) {
  const { data, error } = await builder
  if (error) throw httpError(`No se pudo leer ${label}: ${error.message}`, 500, 'ERP_CONTEXT_ERROR')
  return data || []
}

async function loadCompanyContext(supabase, companyId) {
  const [company, clients, quotes, orders, receivables, payables, inventory, agenda, cash] = await Promise.all([
    supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle(),
    query(supabase, supabase.from('clients').select('id,name,phone,email,nit,nrc,giro,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500), 'clientes'),
    query(supabase, supabase.from('quotes').select('id,code,status,title,total,subtotal,created_at,valid_until,client_id,minimum_margin,close_probability').eq('company_id', companyId).is('soft_deleted_at', null).order('created_at', { ascending: false }).limit(500), 'cotizaciones'),
    query(supabase, supabase.from('work_orders').select('id,number,title,status,due_at,total,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500), 'órdenes de trabajo'),
    query(supabase, supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500), 'cuentas por cobrar'),
    query(supabase, supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500), 'cuentas por pagar'),
    query(supabase, supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,active').eq('company_id', companyId).eq('active', true).limit(1000), 'inventario'),
    query(supabase, supabase.from('production_schedule_events').select('id,title,status,priority,scheduled_start').eq('company_id', companyId).gte('scheduled_start', `${today()}T00:00:00`).order('scheduled_start').limit(250), 'agenda de producción'),
    query(supabase, supabase.from('cash_account_balances').select('cash_account_id,name,current_balance,active').eq('company_id', companyId), 'saldos de caja')
  ])
  if (company.error) throw company.error

  const clientMap = new Map(clients.map((row) => [String(row.id), row.name || 'Cliente']))
  const enrichedQuotes = quotes.map((row) => ({ ...row, client_name: clientMap.get(String(row.client_id)) || null }))
  const open = (row) => !['PAID', 'CANCELLED', 'VOID'].includes(String(row.status || '').toUpperCase())
  const quoteOpen = (row) => !['APPROVED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'VOID', 'CLOSED'].includes(String(row.status || '').toUpperCase())
  const overdueReceivables = receivables.filter((row) => open(row) && row.due_date && row.due_date < today()).sort((a, b) => remaining(b) - remaining(a))
  const overduePayables = payables.filter((row) => open(row) && row.due_date && row.due_date < today()).sort((a, b) => remaining(b) - remaining(a))
  const lateOrders = orders.filter((row) => row.due_at && row.due_at.slice(0, 10) < today() && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(row.status || '').toUpperCase())).sort((a, b) => dateValue(a.due_at) - dateValue(b.due_at))
  const lowStock = inventory.filter((row) => safeNumber(row.current_stock) <= safeNumber(row.minimum_stock)).sort((a, b) => (safeNumber(a.current_stock) - safeNumber(a.minimum_stock)) - (safeNumber(b.current_stock) - safeNumber(b.minimum_stock)))
  const activeCash = cash.filter((row) => row.active !== false)
  const cashTotal = activeCash.reduce((sum, row) => sum + safeNumber(row.current_balance), 0)
  const receivableDue = overdueReceivables.reduce((sum, row) => sum + remaining(row), 0)
  const payableDue = overduePayables.reduce((sum, row) => sum + remaining(row), 0)
  const quoteTotal = enrichedQuotes.reduce((sum, row) => sum + safeNumber(row.total), 0)

  const from30 = isoDateOffset(-30)
  const from60 = isoDateOffset(-60)
  const next7 = isoDateOffset(7)
  const quotes30 = enrichedQuotes.filter((row) => String(row.created_at || '').slice(0, 10) >= from30)
  const quotesPrior30 = enrichedQuotes.filter((row) => {
    const created = String(row.created_at || '').slice(0, 10)
    return created >= from60 && created < from30
  })
  const quoteTotal30 = quotes30.reduce((sum, row) => sum + safeNumber(row.total), 0)
  const quoteTotalPrior30 = quotesPrior30.reduce((sum, row) => sum + safeNumber(row.total), 0)
  const quoteGrowth = quoteTotalPrior30 > 0 ? ((quoteTotal30 - quoteTotalPrior30) / quoteTotalPrior30) * 100 : null
  const newClients30 = clients.filter((row) => String(row.created_at || '').slice(0, 10) >= from30)
  const expiringQuotes = enrichedQuotes.filter((row) => quoteOpen(row) && row.valid_until && row.valid_until >= today() && row.valid_until <= next7).sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until)))
  const weightedPipeline = enrichedQuotes.filter(quoteOpen).reduce((sum, row) => {
    const probability = Math.min(100, Math.max(0, safeNumber(row.close_probability)))
    return sum + safeNumber(row.total) * (probability / 100)
  }, 0)
  const urgentAgenda = agenda.filter((row) => String(row.priority || '').toUpperCase() === 'URGENT' && String(row.status || '').toUpperCase() !== 'COMPLETED')

  let healthScore = 100
  if (cashTotal < 0) healthScore -= 25
  if (receivableDue > 0) healthScore -= Math.min(20, overdueReceivables.length * 3)
  if (payableDue > Math.max(cashTotal, 0)) healthScore -= 15
  if (lateOrders.length) healthScore -= Math.min(20, lateOrders.length * 3)
  if (lowStock.length) healthScore -= Math.min(10, lowStock.length)
  if (urgentAgenda.length) healthScore -= Math.min(10, urgentAgenda.length * 2)
  healthScore = Math.max(0, Math.round(healthScore))

  return {
    generated_at: new Date().toISOString(),
    company: company.data || { id: companyId, name: 'Empresa' },
    metrics: {
      clients: clients.length,
      new_clients_30d: newClients30.length,
      quotes: enrichedQuotes.length,
      quote_total: quoteTotal,
      quotes_30d: quotes30.length,
      quote_total_30d: quoteTotal30,
      quote_total_prior_30d: quoteTotalPrior30,
      quote_growth_pct: quoteGrowth,
      weighted_pipeline: weightedPipeline,
      expiring_quotes_7d: expiringQuotes.length,
      work_orders: orders.length,
      late_orders: lateOrders.length,
      overdue_receivables: overdueReceivables.length,
      overdue_receivables_value: receivableDue,
      overdue_payables: overduePayables.length,
      overdue_payables_value: payableDue,
      low_stock_items: lowStock.length,
      cash_total: cashTotal,
      urgent_agenda: urgentAgenda.length,
      health_score: healthScore
    },
    samples: {
      recent_clients: clients.slice(0, 30),
      recent_quotes: enrichedQuotes.slice(0, 60),
      expiring_quotes: expiringQuotes.slice(0, 30),
      late_orders: lateOrders.slice(0, 50),
      overdue_receivables: overdueReceivables.slice(0, 50),
      overdue_payables: overduePayables.slice(0, 50),
      low_stock: lowStock.slice(0, 80),
      agenda: agenda.slice(0, 80),
      cash_accounts: activeCash.slice(0, 30)
    }
  }
}

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9$%\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function lines(items) {
  return items.filter(Boolean).join('\n')
}

const INTENTS = {
  receivables: ['cobrar', 'cobro', 'cobros', 'cuentas por cobrar', 'cxc', 'me deben', 'deben clientes', 'moroso', 'morosos', 'vencida cobrar'],
  payables: ['pagar', 'pago', 'pagos', 'cuentas por pagar', 'cxp', 'proveedor', 'proveedores', 'debo', 'deudas'],
  cash: ['caja', 'efectivo', 'liquidez', 'dinero disponible', 'saldo', 'fondos'],
  inventory: ['inventario', 'stock', 'material', 'materiales', 'reponer', 'reposicion', 'existencia', 'existencias', 'agotado', 'bodega'],
  production: ['orden', 'ordenes', 'ot ', 'atras', 'atrasada', 'atrasadas', 'produccion', 'trabajo', 'entrega', 'agenda'],
  quotes: ['cotizacion', 'cotizaciones', 'venta', 'ventas', 'oportunidad', 'oportunidades', 'comercial', 'propuesta', 'propuestas'],
  clients: ['cliente', 'clientes', 'cartera', 'contactos'],
  trends: ['comparar', 'comparacion', 'tendencia', 'crecimiento', 'ultimo mes', 'ultimos 30', '30 dias', 'mes anterior', 'evolucion'],
  profitability: ['rentabilidad', 'rentable', 'margen', 'margenes', 'ganancia', 'ganancias', 'utilidad', 'utilidades'],
  priorities: ['prioridad', 'prioridades', 'atencion', 'atender', 'hoy', 'riesgo', 'riesgos', 'diagnostico', 'resumen', 'empresa', 'como vamos', 'situacion']
}

function detectIntents(question) {
  const q = normalize(question)
  const scored = Object.entries(INTENTS).map(([intent, words]) => ({
    intent,
    score: words.reduce((sum, word) => sum + (q.includes(word) ? (word.includes(' ') ? 3 : 1) : 0), 0)
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
  return { normalized: q, intents: scored.map((item) => item.intent) }
}

function quoteLabel(row) {
  return `${row.code || 'Cotización'}${row.client_name ? ` · ${row.client_name}` : ''}${row.title ? ` · ${row.title}` : ''}`
}

function buildPriorities(context) {
  const m = context.metrics
  const items = []
  if (m.cash_total < 0) items.push({ severity: 5, text: `Caja negativa por ${money(Math.abs(m.cash_total))}.` })
  if (m.overdue_receivables > 0) items.push({ severity: 5, text: `Recuperar ${money(m.overdue_receivables_value)} de ${m.overdue_receivables} cuentas por cobrar vencidas.` })
  if (m.late_orders > 0) items.push({ severity: 4, text: `Resolver ${m.late_orders} órdenes de trabajo atrasadas.` })
  if (m.overdue_payables > 0 && m.overdue_payables_value > Math.max(m.cash_total, 0)) items.push({ severity: 4, text: `CxP vencida (${money(m.overdue_payables_value)}) supera la caja disponible.` })
  else if (m.overdue_payables > 0) items.push({ severity: 3, text: `Revisar ${m.overdue_payables} cuentas por pagar vencidas por ${money(m.overdue_payables_value)}.` })
  if (m.low_stock_items > 0) items.push({ severity: 3, text: `Reponer ${m.low_stock_items} artículos en nivel mínimo o crítico.` })
  if (m.urgent_agenda > 0) items.push({ severity: 4, text: `Atender ${m.urgent_agenda} actividades urgentes de producción.` })
  if (m.expiring_quotes_7d > 0) items.push({ severity: 2, text: `Dar seguimiento a ${m.expiring_quotes_7d} cotizaciones que vencen en los próximos 7 días.` })
  return items.sort((a, b) => b.severity - a.severity)
}

function answerReceivables(context) {
  const m = context.metrics
  const rows = context.samples.overdue_receivables.slice(0, 8)
  return lines([
    `Tenés ${m.overdue_receivables} cuentas por cobrar vencidas por ${money(m.overdue_receivables_value)}.`,
    rows.length ? 'Orden sugerido de cobro, priorizando mayor saldo pendiente:' : 'No hay cuentas vencidas registradas.',
    ...rows.map((row, index) => `${index + 1}. ${money(remaining(row))}${row.due_date ? ` · venció ${row.due_date}` : ''}.`),
    rows.length ? 'Siguiente paso: gestionar primero los saldos más altos y documentar cada compromiso de pago.' : ''
  ])
}

function answerPayables(context) {
  const m = context.metrics
  const rows = context.samples.overdue_payables.slice(0, 8)
  const coverage = m.overdue_payables_value > 0 ? (m.cash_total / m.overdue_payables_value) * 100 : 100
  return lines([
    `Tenés ${m.overdue_payables} cuentas por pagar vencidas por ${money(m.overdue_payables_value)}.`,
    `Caja registrada: ${money(m.cash_total)}${m.overdue_payables_value > 0 ? ` · cobertura aproximada ${percent(coverage)}` : ''}.`,
    ...rows.map((row, index) => `${index + 1}. ${money(remaining(row))}${row.due_date ? ` · venció ${row.due_date}` : ''}.`),
    m.cash_total < m.overdue_payables_value ? 'Recomendación: priorizar obligaciones críticas y evitar comprometer caja sin antes acelerar cobros.' : 'La caja registrada cubre el total vencido por pagar.'
  ])
}

function answerCash(context) {
  const m = context.metrics
  const netAfterOverdue = m.cash_total + m.overdue_receivables_value - m.overdue_payables_value
  const cashRows = context.samples.cash_accounts.slice(0, 8)
  return lines([
    `Caja total registrada: ${money(m.cash_total)}.`,
    `CxC vencida: ${money(m.overdue_receivables_value)} · CxP vencida: ${money(m.overdue_payables_value)}.`,
    `Posición teórica si se cobrara y pagara todo lo vencido: ${money(netAfterOverdue)}.`,
    ...cashRows.map((row) => `${row.name || 'Cuenta'}: ${money(row.current_balance)}.`),
    m.cash_total < 0 ? 'RIESGO ALTO: la caja está negativa.' : m.cash_total < m.overdue_payables_value ? 'Atención: la caja actual no cubre todo lo vencido por pagar.' : 'La liquidez registrada cubre actualmente lo vencido por pagar.'
  ])
}

function answerInventory(context) {
  const m = context.metrics
  const rows = context.samples.low_stock.slice(0, 10)
  return lines([
    `Hay ${m.low_stock_items} artículos en nivel mínimo o crítico.`,
    ...rows.map((row, index) => `${index + 1}. ${row.name || 'Artículo'}: existencia ${safeNumber(row.current_stock)} · mínimo ${safeNumber(row.minimum_stock)}.`),
    rows.length ? 'Recomendación: reponer primero materiales asociados a producción activa, entregas próximas o artículos en cero.' : 'Inventario sin alertas de mínimo registradas.'
  ])
}

function answerProduction(context) {
  const m = context.metrics
  const rows = context.samples.late_orders.slice(0, 10)
  return lines([
    `Hay ${m.late_orders} órdenes de trabajo atrasadas.`,
    ...rows.map((row, index) => `${index + 1}. ${row.number || row.id || 'OT'}${row.title ? ` · ${row.title}` : ''}${row.due_at ? ` · venció ${row.due_at.slice(0, 10)}` : ''}.`),
    m.urgent_agenda > 0 ? `Además hay ${m.urgent_agenda} actividades urgentes en la agenda de producción.` : '',
    rows.length ? 'Recomendación: confirmar responsable, materiales faltantes y una nueva fecha realista para cada OT vencida.' : 'No hay órdenes atrasadas registradas.'
  ])
}

function answerQuotes(context) {
  const m = context.metrics
  const recent = context.samples.recent_quotes.slice(0, 8)
  const expiring = context.samples.expiring_quotes.slice(0, 6)
  const detailRows = expiring.length ? expiring.map((row, index) => `${index + 1}. ${quoteLabel(row)} · ${money(row.total)} · vence ${row.valid_until}.`) : recent.slice(0, 4).map((row, index) => `${index + 1}. ${quoteLabel(row)} · ${row.status || 'sin estado'} · ${money(row.total)}.`)
  return lines([
    `Hay ${m.quotes} cotizaciones registradas por ${money(m.quote_total)}.`,
    `Últimos 30 días: ${m.quotes_30d} cotizaciones por ${money(m.quote_total_30d)}.`,
    m.quote_growth_pct === null ? 'No hay base suficiente del período anterior para calcular crecimiento.' : `Variación frente a los 30 días anteriores: ${m.quote_growth_pct >= 0 ? '+' : ''}${percent(m.quote_growth_pct)}.`,
    m.weighted_pipeline > 0 ? `Pipeline ponderado según probabilidad de cierre registrada: ${money(m.weighted_pipeline)}.` : '',
    expiring.length ? `Atención: ${m.expiring_quotes_7d} cotizaciones vencen en los próximos 7 días.` : recent.length ? 'Cotizaciones recientes:' : '',
    ...detailRows,
    recent.length ? 'Recomendación: dar seguimiento primero a las de mayor valor, mayor probabilidad de cierre y vencimiento más cercano.' : 'No hay cotizaciones recientes para analizar.'
  ])
}

function answerClients(context) {
  const m = context.metrics
  const rows = context.samples.recent_clients.slice(0, 10)
  return lines([
    `Tenés ${m.clients} clientes registrados; ${m.new_clients_30d} se agregaron en los últimos 30 días.`,
    ...rows.map((row, index) => `${index + 1}. ${row.name || 'Cliente'}${row.giro ? ` · ${row.giro}` : ''}.`),
    `CxC vencida total: ${money(m.overdue_receivables_value)}.`,
    'Recomendación comercial: combinar seguimiento a clientes recientes con recuperación de cuentas vencidas y seguimiento de cotizaciones abiertas.'
  ])
}

function answerTrends(context) {
  const m = context.metrics
  const delta = m.quote_total_30d - m.quote_total_prior_30d
  return lines([
    'Comparación de cotizaciones:',
    `Últimos 30 días: ${m.quotes_30d} por ${money(m.quote_total_30d)}.`,
    `30 días anteriores: ${money(m.quote_total_prior_30d)}.`,
    m.quote_growth_pct === null ? 'No existe suficiente base anterior para calcular una variación porcentual confiable.' : `Cambio: ${delta >= 0 ? '+' : ''}${money(delta)} (${m.quote_growth_pct >= 0 ? '+' : ''}${percent(m.quote_growth_pct)}).`,
    `Clientes nuevos en últimos 30 días: ${m.new_clients_30d}.`,
    m.quote_growth_pct !== null && m.quote_growth_pct < 0 ? 'Se observa una reducción en valor cotizado; conviene revisar seguimiento comercial y generación de oportunidades.' : 'El valor cotizado no muestra una caída frente al período anterior.'
  ])
}

function answerProfitability(context) {
  const quotes = context.samples.recent_quotes.filter((row) => row.minimum_margin !== null && row.minimum_margin !== undefined).slice(0, 10)
  return lines([
    'Puedo revisar señales de margen, pero no voy a inventar rentabilidad.',
    quotes.length ? 'Estas cotizaciones tienen un margen mínimo registrado:' : 'Con los datos cargados actualmente no tengo costo real por trabajo/producto suficiente para calcular utilidad neta confiable.',
    ...quotes.map((row, index) => `${index + 1}. ${quoteLabel(row)} · total ${money(row.total)} · margen mínimo registrado ${percent(row.minimum_margin)}.`),
    'Para rentabilidad real necesito comparar ingresos contra costos directos, materiales, mano de obra y otros costos asociados. Cuando esos datos estén vinculados, el motor podrá calcular utilidad y margen real por cliente, cotización y orden.'
  ])
}

function answerPriorities(context) {
  const m = context.metrics
  const priorities = buildPriorities(context)
  const health = m.health_score >= 80 ? 'estable' : m.health_score >= 60 ? 'con atención requerida' : 'con riesgos importantes'
  return lines([
    `Diagnóstico ejecutivo de ${context.company?.name || 'la empresa'}: ${m.health_score}/100 (${health}).`,
    `Caja ${money(m.cash_total)} · CxC vencida ${money(m.overdue_receivables_value)} · CxP vencida ${money(m.overdue_payables_value)}.`,
    `Cotizado 30 días ${money(m.quote_total_30d)} · OT atrasadas ${m.late_orders} · Stock crítico ${m.low_stock_items}.`,
    priorities.length ? 'Prioridades recomendadas:' : 'No aparecen alertas críticas con los datos actuales.',
    ...priorities.slice(0, 7).map((item, index) => `${index + 1}. ${item.text}`),
    priorities.length ? 'Estas prioridades se calculan con reglas internas y datos actuales del ERP; no modifican ningún registro.' : ''
  ])
}

function internalAnswer(question, context) {
  const { intents } = detectIntents(question)
  const primary = intents[0] || 'priorities'
  const answers = {
    receivables: answerReceivables,
    payables: answerPayables,
    cash: answerCash,
    inventory: answerInventory,
    production: answerProduction,
    quotes: answerQuotes,
    clients: answerClients,
    trends: answerTrends,
    profitability: answerProfitability,
    priorities: answerPriorities
  }

  if (intents.length > 1 && intents.includes('cash') && intents.includes('receivables')) {
    return `${answerCash(context)}\n\n${answerReceivables(context)}`
  }
  if (intents.length > 1 && intents.includes('quotes') && intents.includes('trends')) {
    return `${answerQuotes(context)}\n\n${answerTrends(context)}`
  }
  return (answers[primary] || answerPriorities)(context)
}

export async function getAiStatus() {
  return {
    configured: true,
    model: 'Motor Inteligente IDEALO SV v2',
    mode: 'internal_read_only',
    provider: 'internal',
    external_account_required: false,
    capabilities: ['diagnostico', 'caja', 'cobros', 'pagos', 'inventario', 'produccion', 'cotizaciones', 'clientes', 'tendencias', 'margenes']
  }
}

export async function getAiSnapshot({ request, supabase }) {
  const companyId = String(request.query?.company_id || '').trim()
  if (!companyId) throw httpError('company_id es obligatorio.')
  const actor = await getActor({ request, supabase, companyId })
  const context = await loadCompanyContext(supabase, companyId)
  return { ...context, actor_role: actor.role }
}

export async function askAiAssistant({ request, supabase }) {
  const companyId = String(request.body?.company_id || '').trim()
  const question = String(request.body?.question || '').trim()
  if (!companyId) throw httpError('company_id es obligatorio.')
  if (!question) throw httpError('Escribí una pregunta para el asistente.')
  if (question.length > 4000) throw httpError('La pregunta es demasiado larga.', 413, 'QUESTION_TOO_LONG')
  const actor = await getActor({ request, supabase, companyId })
  const context = await loadCompanyContext(supabase, companyId)
  const answer = internalAnswer(question, context)
  return {
    answer,
    model: 'Motor Inteligente IDEALO SV v2',
    provider: 'internal',
    mode: 'internal_read_only',
    generated_at: new Date().toISOString(),
    actor_role: actor.role,
    metrics: context.metrics
  }
}
