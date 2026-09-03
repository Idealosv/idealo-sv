import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import './assistant-ai.css'

const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const money = (value) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const QUICK = [
  '¿Qué requiere mi atención hoy?',
  '¿Cómo está mi caja y qué riesgos ves?',
  '¿Qué clientes o cuentas debo cobrar primero?',
  '¿Qué materiales debo reponer?',
  '¿Qué órdenes están atrasadas?',
  'Analiza mis cotizaciones y oportunidades comerciales.'
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

export default function AssistantLauncher() {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [company, setCompany] = useState(null)
  const [status, setStatus] = useState({ configured: false, model: '', mode: 'read_only' })
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
    if (Number(metrics.late_orders) > 0) list.push({ title: `${metrics.late_orders} órdenes atrasadas`, target: 'planning' })
    if (Number(metrics.overdue_receivables) > 0) list.push({ title: `CxC vencida ${money(metrics.overdue_receivables_value)}`, target: 'financial' })
    if (Number(metrics.overdue_payables) > 0) list.push({ title: `CxP vencida ${money(metrics.overdue_payables_value)}`, target: 'procurement' })
    if (Number(metrics.low_stock_items) > 0) list.push({ title: `${metrics.low_stock_items} materiales en mínimo`, target: 'inventory' })
    if (Number(metrics.urgent_agenda) > 0) list.push({ title: `${metrics.urgent_agenda} actividades urgentes`, target: 'planning' })
    if (Number(metrics.cash_total) < 0) list.unshift({ title: `Caja negativa ${money(metrics.cash_total)}`, target: 'financial' })
    return list
  }, [metrics])

  const send = async (preset) => {
    const text = String(preset || question).trim()
    if (!text || sending || !company?.id || !session?.access_token) return
    const userMessage = { role: 'user', content: text }
    const history = messages.slice(-10)
    setMessages((current) => [...current, userMessage])
    setQuestion('')
    setSending(true)
    setMessage('')
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
    <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Asistente IA" onMouseDown={(event) => event.stopPropagation()}>
      <header className="erp-modal-head">
        <div><strong>IDEALO IA</strong><small>Asistente ejecutivo conectado a los datos reales de tu empresa</small></div>
        <button type="button" className="erp-modal-close" onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="erp-modal-body">
        {message && <p className="feedback error">{message}</p>}
        {loading ? <div className="empty-state"><strong>Preparando inteligencia empresarial…</strong><p>Consultando datos actuales del ERP.</p></div> : <div className="ai-shell">
          <section className="panel ai-chat">
            <div className="ai-status-line">
              <div><p className="form-kicker">ASISTENTE EJECUTIVO</p><h2>Preguntale a tu ERP</h2></div>
              <span className={status.configured ? 'status dte-ready' : 'status dte-pending'}>{status.configured ? 'IA conectada' : 'Falta configurar IA'}</span>
            </div>
            <div className="ai-quick">{QUICK.map((text) => <button type="button" key={text} disabled={sending || !status.configured} onClick={() => send(text)}>{text}</button>)}</div>
            <div className="ai-chat-stream" aria-live="polite">
              {!messages.length && <div className="ai-empty-chat"><strong>Ya puedo analizar tu empresa.</strong><p>Preguntame por caja, cobros, pagos, cotizaciones, inventario, producción, atrasos o prioridades del día.</p></div>}
              {messages.map((item, index) => <article key={`${item.role}-${index}`} className={`ai-message ${item.role}`}><small>{item.role === 'user' ? 'Vos' : 'IDEALO IA'}</small>{item.content}</article>)}
              {sending && <article className="ai-message assistant"><small>IDEALO IA</small>Analizando datos actuales del ERP…</article>}
            </div>
            <div className="ai-composer">
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="Ejemplo: ¿Qué debo cobrar primero y por qué?" disabled={sending || !status.configured} />
              <button type="button" onClick={() => send()} disabled={sending || !question.trim() || !status.configured}>{sending ? 'Analizando…' : 'Preguntar'}</button>
            </div>
          </section>

          <aside className="ai-side">
            <section className="panel">
              <p className="form-kicker">RADAR EMPRESARIAL</p><h3>Situación actual</h3>
              <div className="ai-metric-list">
                <article><small>Caja</small><strong>{money(metrics.cash_total)}</strong></article>
                <article><small>Clientes</small><strong>{metrics.clients ?? 0}</strong></article>
                <article><small>Cotizaciones</small><strong>{metrics.quotes ?? 0}</strong></article>
                <article><small>OT atrasadas</small><strong>{metrics.late_orders ?? 0}</strong></article>
                <article><small>CxC vencida</small><strong>{money(metrics.overdue_receivables_value)}</strong></article>
                <article><small>Stock crítico</small><strong>{metrics.low_stock_items ?? 0}</strong></article>
              </div>
            </section>
            <section className="panel">
              <p className="form-kicker">PRIORIDADES</p><h3>Qué requiere atención</h3>
              <div className="schedule-list">{priorities.map((item) => <article className="schedule-card" key={item.title}><div><strong>{item.title}</strong></div><button type="button" className="secondary-button" onClick={() => go(item.target)}>Abrir</button></article>)}{!priorities.length && <div className="empty-state"><strong>Sin alertas críticas</strong></div>}</div>
            </section>
            <section className="panel">
              <div className="ai-readonly"><strong>Modo seguro: solo lectura.</strong><br />La IA analiza y recomienda, pero no emite DTE, no paga, no cobra y no modifica inventario sin una acción explícita del usuario.</div>
              <p><small>Modelo: {status.model || 'pendiente'} · Contexto actualizado al abrir el asistente.</small></p>
            </section>
          </aside>
        </div>}
      </div>
    </section>
  </div>
}
