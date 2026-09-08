import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './assistant-ai.css'

const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const money = (value) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const QUICK = [
  '¿Qué requiere mi atención hoy?',
  'Dame un diagnóstico completo de la empresa.',
  '¿Cómo está mi caja y qué riesgos ves?',
  '¿Qué cuentas debo cobrar primero?',
  '¿Qué materiales debo reponer?',
  '¿Qué órdenes están atrasadas?',
  'Compara mis cotizaciones de los últimos 30 días con el período anterior.',
  '¿Qué cotizaciones están próximas a vencer?',
  '¿Qué puedes decirme de mis márgenes y rentabilidad?'
]

async function api(path, { token, method = 'GET', body } = {}) {
  if (!API_URL) throw new Error('VITE_API_URL no está configurada.')
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || payload?.error || 'No se pudo completar la solicitud.')
  return payload
}

function normalizeQuestion(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function pending(row) {
  return Math.max(0, Number(row?.amount_total || 0) - Number(row?.amount_paid || 0))
}

function instantAnswer(text, snapshot, priorities = []) {
  if (!snapshot) return null
  const q = normalizeQuestion(text)
  const m = snapshot.metrics || {}
  const s = snapshot.samples || {}
  const companyName = snapshot.company?.name || 'la empresa'

  if (q.includes('material') || q.includes('reponer') || q.includes('inventario') || q.includes('stock')) {
    const rows = (s.low_stock || []).slice(0, 8)
    if (!rows.length) return 'Hay 0 artículos en nivel mínimo o crítico. Inventario sin alertas de mínimo registradas.'
    return [`Hay ${m.low_stock_items || rows.length} artículos en nivel mínimo o crítico.`, ...rows.map((row, index) => `${index + 1}. ${row.name || 'Material'}: existencia ${Number(row.current_stock || 0)} / mínimo ${Number(row.minimum_stock || 0)}.`)].join('\n')
  }

  if (q.includes('diagnostico') || q.includes('situacion') || q.includes('como vamos')) {
    return [
      `Diagnóstico ejecutivo de ${companyName}: ${m.health_score ?? 100}/100.`,
      `Caja ${money(m.cash_total)} · CxC vencida ${money(m.overdue_receivables_value)} · CxP vencida ${money(m.overdue_payables_value)}.`,
      `Cotizado 30 días ${money(m.quote_total_30d)} · OT atrasadas ${m.late_orders ?? 0} · Stock crítico ${m.low_stock_items ?? 0}.`,
      priorities.length ? `Prioridad principal: ${priorities[0].title}.` : 'No aparecen alertas críticas con los datos actuales.'
    ].join('\n')
  }

  if (q.includes('caja') || q.includes('liquidez') || q.includes('efectivo')) {
    const risks = []
    if (Number(m.cash_total) < 0) risks.push('La caja está en negativo.')
    if (Number(m.overdue_payables_value) > Math.max(Number(m.cash_total || 0), 0)) risks.push('Las cuentas por pagar vencidas superan la caja disponible.')
    if (Number(m.overdue_receivables_value) > 0) risks.push(`Tenés ${money(m.overdue_receivables_value)} por recuperar en CxC vencida.`)
    return `Caja actual: ${money(m.cash_total)}. ${risks.length ? risks.join(' ') : 'No detecto un riesgo crítico de liquidez con los datos actuales.'}`
  }

  if (q.includes('cobrar') || q.includes('cxc') || q.includes('cuentas por cobrar')) {
    const rows = (s.overdue_receivables || []).slice(0, 8)
    if (!rows.length) return 'No hay cuentas por cobrar vencidas registradas.'
    return [`Tenés ${m.overdue_receivables || rows.length} cuentas por cobrar vencidas por ${money(m.overdue_receivables_value)}.`, 'Orden sugerido de cobro:', ...rows.map((row, index) => `${index + 1}. ${money(pending(row))}${row.due_date ? ` · venció ${row.due_date}` : ''}.`)].join('\n')
  }

  if (q.includes('orden') || q.includes('atrasad') || q.includes('produccion')) {
    const rows = (s.late_orders || []).slice(0, 8)
    if (!rows.length) return 'No hay órdenes de trabajo atrasadas registradas.'
    return [`Hay ${m.late_orders || rows.length} órdenes atrasadas.`, ...rows.map((row, index) => `${index + 1}. ${row.number || 'OT'}${row.title ? ` · ${row.title}` : ''}${row.due_at ? ` · venció ${String(row.due_at).slice(0, 10)}` : ''}.`)].join('\n')
  }

  if (q.includes('compar') && q.includes('cotizacion')) {
    const current = Number(m.quote_total_30d || 0)
    const prior = Number(m.quote_total_prior_30d || 0)
    const growth = m.quote_growth_pct
    if (prior <= 0) return `Cotizado en los últimos 30 días: ${money(current)}. No hay una base suficiente del período anterior para calcular una variación porcentual confiable.`
    return `Últimos 30 días: ${money(current)}. Período anterior: ${money(prior)}. Variación: ${Number(growth || 0).toFixed(1)}%.`
  }

  if (q.includes('vencer') && q.includes('cotizacion')) {
    const rows = (s.expiring_quotes || []).slice(0, 8)
    if (!rows.length) return 'No hay cotizaciones próximas a vencer en los siguientes 7 días.'
    return [`Hay ${m.expiring_quotes_7d || rows.length} cotizaciones próximas a vencer.`, ...rows.map((row, index) => `${index + 1}. ${row.code || 'Cotización'}${row.client_name ? ` · ${row.client_name}` : ''}${row.valid_until ? ` · vence ${row.valid_until}` : ''} · ${money(row.total)}.`)].join('\n')
  }

  if (q.includes('margen') || q.includes('rentabilidad') || q.includes('ganancia') || q.includes('utilidad')) {
    return 'Puedo revisar importes cotizados y señales comerciales, pero no voy a inventar rentabilidad. Para calcular margen real necesito que los costos de materiales, mano de obra e instalación estén registrados de forma consistente.'
  }

  if (q.includes('atencion') || q.includes('prioridad') || q.includes('riesgo') || q.includes('hoy')) {
    if (!priorities.length) return 'No aparecen alertas críticas con los datos actuales. La empresa puede enfocarse en seguimiento comercial y operación normal.'
    return ['Estas son las prioridades actuales:', ...priorities.slice(0, 6).map((item, index) => `${index + 1}. ${item.title}.`)].join('\n')
  }

  return null
}

export default function AssistantLauncher() {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [status, setStatus] = useState({ configured: true, model: 'Motor Inteligente IDEALO SV v2', mode: 'internal_read_only' })
  const [snapshot, setSnapshot] = useState(null)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const fn = (event) => { if ((event.detail || {}).target === 'assistant') setOpen(true) }
    window.addEventListener('idealo-open-module', fn)
    return () => window.removeEventListener('idealo-open-module', fn)
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    supabase.rpc('get_my_companies').then(({ data }) => setCompany(data?.[0] || null))
  }, [session])

  useEffect(() => {
    if (!open || !company?.id || !session?.access_token) return
    let live = true
    ;(async () => {
      setLoading(true)
      setMessage('')
      try {
        const [nextStatus, nextSnapshot] = await Promise.all([
          api('/api/ai/status'),
          api(`/api/ai/snapshot?company_id=${encodeURIComponent(company.id)}`, { token: session.access_token })
        ])
        if (!live) return
        setStatus(nextStatus)
        setSnapshot(nextSnapshot)
      } catch (error) {
        if (live) setMessage(error.message)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [open, company?.id, session?.access_token])

  const metrics = snapshot?.metrics || {}
  const priorities = useMemo(() => {
    const list = []
    if (Number(metrics.cash_total) < 0) list.push({ title: `Caja negativa ${money(metrics.cash_total)}`, target: 'financial' })
    if (Number(metrics.overdue_receivables) > 0) list.push({ title: `CxC vencida ${money(metrics.overdue_receivables_value)}`, target: 'financial' })
    if (Number(metrics.late_orders) > 0) list.push({ title: `${metrics.late_orders} órdenes atrasadas`, target: 'planning' })
    if (Number(metrics.overdue_payables) > 0) list.push({ title: `CxP vencida ${money(metrics.overdue_payables_value)}`, target: 'procurement' })
    if (Number(metrics.low_stock_items) > 0) list.push({ title: `${metrics.low_stock_items} materiales en mínimo`, target: 'inventory' })
    if (Number(metrics.urgent_agenda) > 0) list.push({ title: `${metrics.urgent_agenda} actividades urgentes`, target: 'planning' })
    if (Number(metrics.expiring_quotes_7d) > 0) list.push({ title: `${metrics.expiring_quotes_7d} cotizaciones próximas a vencer`, target: 'quotes' })
    return list
  }, [metrics])

  const send = async (preset) => {
    const text = String(preset || question).trim()
    if (!text || sending || !company?.id || !session?.access_token) return
    const userMessage = { role: 'user', content: text }
    const history = messages.slice(-10)
    const localAnswer = instantAnswer(text, snapshot, priorities)
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setMessage('')

    if (localAnswer) {
      setMessages((current) => [...current, { role: 'assistant', content: localAnswer }])
      return
    }

    setSending(true)
    try {
      const result = await api('/api/ai/ask', {
        token: session.access_token,
        method: 'POST',
        body: { company_id: company.id, question: text, history }
      })
      setMessages((current) => [...current, { role: 'assistant', content: result.answer }])
      if (result.metrics) setSnapshot((current) => current ? { ...current, metrics: result.metrics } : current)
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: `No pude completar el análisis: ${error.message}` }])
    } finally {
      setSending(false)
    }
  }

  const go = (target) => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('idealo-open-module', { detail: { target } }))
  }

  if (!open) return null
  return <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Asistente Inteligente" onMouseDown={(event) => event.stopPropagation()}>
      <header className="erp-modal-head">
        <div><strong>IDEALO INTELIGENTE V2</strong><small>Diagnóstico empresarial interno conectado a los datos reales de tu empresa</small></div>
        <button type="button" className="erp-modal-close" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="erp-modal-body">
        {message && <p className="feedback error">{message}</p>}
        {loading ? <div className="empty-state"><strong>Preparando inteligencia empresarial…</strong><p>Consultando y comparando datos actuales del ERP.</p></div> : <div className="ai-shell">
          <section className="panel ai-chat">
            <div className="ai-status-line">
              <div><p className="form-kicker">ASISTENTE EMPRESARIAL V2</p><h2>Preguntale a tu ERP</h2></div>
              <span className="status dte-ready">Motor interno activo</span>
            </div>
            <div className="ai-quick">{QUICK.map((text) => <button type="button" key={text} disabled={sending} onClick={() => send(text)}>{text}</button>)}</div>
            <div className="ai-chat-stream" aria-live="polite">
              {!messages.length && <div className="ai-empty-chat"><strong>Ahora puedo analizar más áreas de tu empresa.</strong><p>Preguntame por diagnóstico, caja, cobros, pagos, cotizaciones, tendencias, márgenes, inventario, producción, clientes o prioridades.</p></div>}
              {messages.map((item, index) => <article key={`${item.role}-${index}`} className={`ai-message ${item.role}`}><small>{item.role === 'user' ? 'Vos' : 'IDEALO'}</small>{item.content}</article>)}
              {sending && <article className="ai-message assistant"><small>IDEALO</small>Analizando y comparando datos actuales del ERP…</article>}
            </div>
            <div className="ai-composer">
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="Ejemplo: comparame las cotizaciones de este mes y decime qué debo atender" disabled={sending} />
              <button type="button" onClick={() => send()} disabled={sending || !question.trim()}>{sending ? 'Analizando…' : 'Preguntar'}</button>
            </div>
          </section>

          <aside className="ai-side">
            <section className="panel">
              <p className="form-kicker">RADAR EMPRESARIAL</p><h3>Situación actual</h3>
              <div className="ai-metric-list">
                <article><small>Salud empresarial</small><strong>{metrics.health_score ?? 100}/100</strong></article>
                <article><small>Caja</small><strong>{money(metrics.cash_total)}</strong></article>
                <article><small>Cotizado 30 días</small><strong>{money(metrics.quote_total_30d)}</strong></article>
                <article><small>Clientes nuevos 30d</small><strong>{metrics.new_clients_30d ?? 0}</strong></article>
                <article><small>OT atrasadas</small><strong>{metrics.late_orders ?? 0}</strong></article>
                <article><small>CxC vencida</small><strong>{money(metrics.overdue_receivables_value)}</strong></article>
                <article><small>Stock crítico</small><strong>{metrics.low_stock_items ?? 0}</strong></article>
                <article><small>Cotizaciones por vencer</small><strong>{metrics.expiring_quotes_7d ?? 0}</strong></article>
              </div>
            </section>
            <section className="panel">
              <p className="form-kicker">PRIORIDADES</p><h3>Qué requiere atención</h3>
              <div className="schedule-list">{priorities.map((item) => <article className="schedule-card" key={item.title}><div><strong>{item.title}</strong></div><button type="button" className="secondary-button" onClick={() => go(item.target)}>Abrir</button></article>)}{!priorities.length && <div className="empty-state"><strong>Sin alertas críticas</strong></div>}</div>
            </section>
            <section className="panel">
              <div className="ai-readonly"><strong>Motor interno y modo seguro.</strong><br />Analiza datos de IDEALO SV sin cuenta de OpenAI ni cobro por consulta. No inventa rentabilidad si faltan costos y no modifica registros automáticamente.</div>
              <p><small>{status.model || 'Motor Inteligente IDEALO SV v2'} · Contexto actualizado al abrir el asistente.</small></p>
            </section>
          </aside>
        </div>}
      </div>
    </section>
  </div>
}
