const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses'

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

function responseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  const parts = []
  for (const item of payload?.output || []) {
    if (item?.type !== 'message') continue
    for (const content of item.content || []) if (content?.type === 'output_text' && content.text) parts.push(content.text)
  }
  return parts.join('\n').trim()
}

async function askOpenAI({ question, history, context }) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw httpError('La IA todavía no tiene configurada OPENAI_API_KEY en el servidor.', 503, 'AI_NOT_CONFIGURED')
  const model = String(process.env.OPENAI_MODEL || 'gpt-5.6-sol').trim()
  const compactHistory = (Array.isArray(history) ? history : []).slice(-10).map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').slice(0, 4000)
  }))
  const instructions = [
    'Sos el Asistente Ejecutivo de IDEALO SV, un ERP empresarial de El Salvador.',
    'Respondé en español claro y profesional, usando únicamente el contexto ERP suministrado.',
    'No inventés datos. Si falta información, decilo expresamente.',
    'Priorizá caja, cobros, pagos, ventas, cotizaciones, inventario, producción y vencimientos.',
    'Podés recomendar acciones, pero este canal es de solo lectura: nunca afirmés que modificaste datos, emitiste DTE, hiciste pagos o cambiaste inventario.',
    'Cuando haya riesgo o prioridad, explicá el motivo y proponé el siguiente paso concreto.',
    'Usá montos en USD y fechas de forma comprensible para El Salvador.',
    'Sé conciso salvo que el usuario pida detalle.'
  ].join(' ')
  const input = [
    ...compactHistory,
    { role: 'user', content: `CONTEXTO ERP ACTUAL:\n${JSON.stringify(context)}\n\nPREGUNTA DEL USUARIO:\n${question}` }
  ]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OPENAI_TIMEOUT_MS || 30000))
  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions, input, max_output_tokens: 1200, store: false }),
      signal: controller.signal
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw httpError(payload?.error?.message || 'El proveedor de IA rechazó la solicitud.', 502, 'AI_PROVIDER_ERROR')
    const answer = responseText(payload)
    if (!answer) throw httpError('El proveedor de IA respondió sin texto.', 502, 'AI_EMPTY_RESPONSE')
    return { answer, model, response_id: payload.id || null }
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError('La consulta de IA excedió el tiempo permitido.', 504, 'AI_TIMEOUT')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function getAiStatus() {
  return {
    configured: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    model: String(process.env.OPENAI_MODEL || 'gpt-5.6-sol'),
    mode: 'read_only'
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
  const result = await askOpenAI({ question, history: request.body?.history, context })
  return { ...result, mode: 'read_only', generated_at: new Date().toISOString(), actor_role: actor.role, metrics: context.metrics }
}
