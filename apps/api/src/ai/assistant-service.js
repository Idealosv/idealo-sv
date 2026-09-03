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

async function query(supabase, builder, label) {
  const { data, error } = await builder
  if (error) throw httpError(`No se pudo leer ${label}: ${error.message}`, 500, 'ERP_CONTEXT_ERROR')
  return data || []
}

async function loadCompanyContext(supabase, companyId) {
  const [company, clients, quotes, orders, receivables, payables, inventory, agenda, cash] = await Promise.all([
    supabase.from('companies').select('id,name').eq('id', companyId).maybeSingle(),
    query(supabase, supabase.from('clients').select('id,name,phone,email,nit,nrc,giro,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(250), 'clientes'),
    query(supabase, supabase.from('quotes').select('id,code,status,title,total,subtotal,created_at,valid_until,client_id,minimum_margin,close_probability').eq('company_id', companyId).is('soft_deleted_at', null).order('created_at', { ascending: false }).limit(250), 'cotizaciones'),
    query(supabase, supabase.from('work_orders').select('id,number,title,status,due_at,total,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(250), 'órdenes de trabajo'),
    query(supabase, supabase.from('accounts_receivable').select('id,amount_total,amount_paid,status,due_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(250), 'cuentas por cobrar'),
    query(supabase, supabase.from('accounts_payable').select('id,amount_total,amount_paid,status,due_date,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(250), 'cuentas por pagar'),
    query(supabase, supabase.from('inventory_items').select('id,name,current_stock,minimum_stock,active').eq('company_id', companyId).eq('active', true).limit(500), 'inventario'),
    query(supabase, supabase.from('production_schedule_events').select('id,title,status,priority,scheduled_start').eq('company_id', companyId).gte('scheduled_start', `${today()}T00:00:00`).order('scheduled_start').limit(100), 'agenda de producción'),
    query(supabase, supabase.from('cash_account_balances').select('cash_account_id,name,current_balance,active').eq('company_id', companyId), 'saldos de caja')
  ])
  if (company.error) throw company.error

  const open = (row) => !['PAID', 'CANCELLED', 'VOID'].includes(String(row.status || '').toUpperCase())
  const overdueReceivables = receivables.filter((row) => open(row) && row.due_date && row.due_date < today())
  const overduePayables = payables.filter((row) => open(row) && row.due_date && row.due_date < today())
  const lateOrders = orders.filter((row) => row.due_at && row.due_at.slice(0, 10) < today() && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(row.status || '').toUpperCase()))
  const lowStock = inventory.filter((row) => safeNumber(row.current_stock) <= safeNumber(row.minimum_stock))
  const activeCash = cash.filter((row) => row.active !== false)
  const cashTotal = activeCash.reduce((sum, row) => sum + safeNumber(row.current_balance), 0)
  const receivableDue = overdueReceivables.reduce((sum, row) => sum + remaining(row), 0)
  const payableDue = overduePayables.reduce((sum, row) => sum + remaining(row), 0)
  const quoteTotal = quotes.reduce((sum, row) => sum + safeNumber(row.total), 0)

  return {
    generated_at: new Date().toISOString(),
    company: company.data || { id: companyId, name: 'Empresa' },
    metrics: {
      clients: clients.length,
      quotes: quotes.length,
      quote_total: quoteTotal,
      work_orders: orders.length,
      late_orders: lateOrders.length,
      overdue_receivables: overdueReceivables.length,
      overdue_receivables_value: receivableDue,
      overdue_payables: overduePayables.length,
      overdue_payables_value: payableDue,
      low_stock_items: lowStock.length,
      cash_total: cashTotal,
      urgent_agenda: agenda.filter((row) => row.priority === 'URGENT' && row.status !== 'COMPLETED').length
    },
    samples: {
      recent_clients: clients.slice(0, 20),
      recent_quotes: quotes.slice(0, 40),
      late_orders: lateOrders.slice(0, 40),
      overdue_receivables: overdueReceivables.slice(0, 40),
      overdue_payables: overduePayables.slice(0, 40),
      low_stock: lowStock.slice(0, 60),
      agenda: agenda.slice(0, 60),
      cash_accounts: activeCash.slice(0, 30)
    }
  }
}

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function lines(items) {
  return items.filter(Boolean).join('\n')
}

function internalAnswer(question, context) {
  const q = normalize(question)
  const m = context.metrics
  const s = context.samples
  const all = (...words) => words.some((word) => q.includes(word))

  if (all('cobrar', 'cobro', 'cuentas por cobrar', 'cxc', 'clientes deben')) {
    const rows = s.overdue_receivables.slice(0, 5)
    return lines([
      `Tenés ${m.overdue_receivables} cuentas por cobrar vencidas por ${money(m.overdue_receivables_value)}.`,
      rows.length ? 'Prioridad sugerida: empezar por los saldos vencidos más altos y antiguos.' : 'No hay cuentas vencidas registradas.',
      ...rows.map((row, index) => `${index + 1}. Saldo pendiente ${money(remaining(row))}${row.due_date ? ` · venció ${row.due_date}` : ''}.`),
      rows.length ? 'Siguiente paso: abrir Cuentas por Cobrar y contactar primero los casos de mayor saldo.' : ''
    ])
  }

  if (all('pagar', 'pago', 'cuentas por pagar', 'cxp', 'proveedores')) {
    const rows = s.overdue_payables.slice(0, 5)
    return lines([
      `Tenés ${m.overdue_payables} cuentas por pagar vencidas por ${money(m.overdue_payables_value)}.`,
      m.cash_total < m.overdue_payables_value ? `La caja registrada es ${money(m.cash_total)}, por debajo del total vencido. Conviene priorizar pagos críticos y cuidar liquidez.` : `La caja registrada es ${money(m.cash_total)}.`,
      ...rows.map((row, index) => `${index + 1}. Saldo pendiente ${money(remaining(row))}${row.due_date ? ` · venció ${row.due_date}` : ''}.`)
    ])
  }

  if (all('caja', 'efectivo', 'liquidez', 'dinero')) {
    const balance = m.cash_total
    const risk = balance < 0 ? 'RIESGO ALTO: la caja está negativa.' : balance < m.overdue_payables_value ? 'Atención: la caja no cubre todo lo vencido por pagar.' : 'La caja cubre actualmente el total vencido por pagar.'
    return lines([
      `Caja total registrada: ${money(balance)}.`,
      `CxC vencida: ${money(m.overdue_receivables_value)}. CxP vencida: ${money(m.overdue_payables_value)}.`,
      risk,
      m.overdue_receivables_value > 0 ? 'Recomendación: acelerar cobros vencidos antes de comprometer nuevos pagos no urgentes.' : 'No hay cobros vencidos registrados que presionen la liquidez.'
    ])
  }

  if (all('inventario', 'stock', 'material', 'reponer', 'existencia')) {
    const rows = s.low_stock.slice(0, 8)
    return lines([
      `Hay ${m.low_stock_items} artículos en nivel mínimo o crítico.`,
      ...rows.map((row, index) => `${index + 1}. ${row.name || 'Artículo'}: existencia ${safeNumber(row.current_stock)} · mínimo ${safeNumber(row.minimum_stock)}.`),
      rows.length ? 'Recomendación: revisar compras y reponer primero materiales ligados a órdenes activas o próximas entregas.' : 'Inventario sin alertas de mínimo registradas.'
    ])
  }

  if (all('orden', 'atras', 'produccion', 'trabajo', 'entrega')) {
    const rows = s.late_orders.slice(0, 8)
    return lines([
      `Hay ${m.late_orders} órdenes de trabajo atrasadas.`,
      ...rows.map((row, index) => `${index + 1}. ${row.number || row.id || 'OT'}${row.title ? ` · ${row.title}` : ''}${row.due_at ? ` · venció ${row.due_at.slice(0, 10)}` : ''}.`),
      m.urgent_agenda > 0 ? `Además hay ${m.urgent_agenda} actividades urgentes en la agenda de producción.` : '',
      rows.length ? 'Recomendación: revisar primero las órdenes vencidas y confirmar materiales, responsable y nueva fecha de entrega.' : 'No hay órdenes atrasadas registradas.'
    ])
  }

  if (all('cotizacion', 'cotizaciones', 'venta', 'ventas', 'oportunidad', 'comercial')) {
    const recent = s.recent_quotes.slice(0, 6)
    return lines([
      `Hay ${m.quotes} cotizaciones registradas por un valor acumulado de ${money(m.quote_total)}.`,
      ...recent.map((row, index) => `${index + 1}. ${row.code || 'Cotización'} · ${row.status || 'sin estado'} · ${money(row.total)}${row.valid_until ? ` · válida hasta ${row.valid_until}` : ''}.`),
      recent.length ? 'Recomendación: dar seguimiento primero a cotizaciones vigentes de mayor valor y a las que estén próximas a vencer.' : 'No hay cotizaciones recientes para analizar.'
    ])
  }

  if (all('cliente', 'clientes')) {
    return lines([
      `Tenés ${m.clients} clientes registrados.`,
      `Cotizaciones activas/registradas: ${m.quotes}.`,
      `Cuentas por cobrar vencidas: ${m.overdue_receivables} por ${money(m.overdue_receivables_value)}.`,
      'Para gestión comercial, conviene combinar seguimiento de cotizaciones con recuperación de saldos vencidos.'
    ])
  }

  const priorities = []
  if (m.cash_total < 0) priorities.push(`Caja negativa: ${money(m.cash_total)}.`)
  if (m.overdue_receivables > 0) priorities.push(`Cobrar ${m.overdue_receivables} cuentas vencidas por ${money(m.overdue_receivables_value)}.`)
  if (m.late_orders > 0) priorities.push(`Resolver ${m.late_orders} órdenes atrasadas.`)
  if (m.low_stock_items > 0) priorities.push(`Reponer ${m.low_stock_items} artículos en mínimo.`)
  if (m.overdue_payables > 0) priorities.push(`Revisar ${m.overdue_payables} cuentas por pagar vencidas por ${money(m.overdue_payables_value)}.`)
  if (m.urgent_agenda > 0) priorities.push(`Atender ${m.urgent_agenda} actividades urgentes de producción.`)

  return lines([
    `Resumen ejecutivo de ${context.company?.name || 'la empresa'}:`,
    `Caja ${money(m.cash_total)} · CxC vencida ${money(m.overdue_receivables_value)} · CxP vencida ${money(m.overdue_payables_value)}.`,
    `Clientes ${m.clients} · Cotizaciones ${m.quotes} · OT atrasadas ${m.late_orders} · Stock crítico ${m.low_stock_items}.`,
    priorities.length ? 'Prioridades recomendadas:' : 'No aparecen alertas críticas con los datos actuales.',
    ...priorities.map((item, index) => `${index + 1}. ${item}`),
    'Podés preguntarme por caja, cobros, pagos, cotizaciones, inventario, producción, clientes o prioridades.'
  ])
}

export async function getAiStatus() {
  return {
    configured: true,
    model: 'Motor inteligente IDEALO SV',
    mode: 'internal_read_only',
    provider: 'internal',
    external_account_required: false
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
    model: 'Motor inteligente IDEALO SV',
    provider: 'internal',
    mode: 'internal_read_only',
    generated_at: new Date().toISOString(),
    actor_role: actor.role,
    metrics: context.metrics
  }
}
