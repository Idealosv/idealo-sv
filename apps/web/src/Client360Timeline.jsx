import { useMemo, useState } from 'react'

const money = value => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const when = value => value ? new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha'

const typeLabels = {
  quote: 'Cotización', work: 'Producción', delivery: 'Entrega', dte: 'DTE', receivable: 'CxC', payment: 'Cobro', interaction: 'Seguimiento', audit: 'Auditoría'
}

export default function Client360Timeline({ data }) {
  const [filter, setFilter] = useState('all')

  const events = useMemo(() => {
    const rows = []
    ;(data.quotes || []).forEach(x => rows.push({ id: `q-${x.id}`, type: 'quote', date: x.created_at, title: `Cotización ${x.number || ''}`.trim(), detail: `${x.status || 'Sin estado'} · ${money(x.total)}` }))
    ;(data.work_orders || []).forEach(x => rows.push({ id: `wo-${x.id}`, type: 'work', date: x.created_at, title: `OT ${x.number || ''}${x.title ? ` · ${x.title}` : ''}`.trim(), detail: `${x.status || 'Sin estado'} · ${money(x.total)}${x.due_at ? ` · Entrega ${new Date(x.due_at).toLocaleDateString('es-SV')}` : ''}` }))
    ;(data.deliveries || []).forEach(x => rows.push({ id: `del-${x.id}`, type: 'delivery', date: x.received_at || x.scheduled_at, title: 'Entrega', detail: `${x.status || 'Sin estado'}${x.received_at ? ' · Recibida' : x.scheduled_at ? ' · Programada' : ''}` }))
    ;(data.dte_documents || []).forEach(x => rows.push({ id: `dte-${x.id}`, type: 'dte', date: x.created_at, title: `DTE ${x.dte_type || ''}`.trim(), detail: `${x.status || 'Sin estado'}${x.generation_code ? ` · ${x.generation_code}` : ''}${x.mh_receipt_seal ? ' · Recibido por MH' : ''}` }))
    ;(data.accounts_receivable || []).forEach(x => rows.push({ id: `ar-${x.id}`, type: 'receivable', date: x.due_date, title: 'Cuenta por cobrar', detail: `${x.status || 'Sin estado'} · Total ${money(x.amount_total)} · Pagado ${money(x.amount_paid)} · Saldo ${money(Number(x.amount_total || 0) - Number(x.amount_paid || 0))}` }))
    ;(data.customer_payments || []).forEach(x => rows.push({ id: `pay-${x.id}`, type: 'payment', date: x.paid_at, title: `Cobro ${money(x.amount)}`, detail: x.payment_method || 'Método no indicado' }))
    ;(data.client_interactions || []).forEach(x => rows.push({ id: `int-${x.id}`, type: 'interaction', date: x.occurred_at || x.created_at, title: x.subject || x.interaction_type || 'Seguimiento comercial', detail: `${x.channel || 'Sin canal'}${x.outcome ? ` · ${x.outcome}` : ''}${x.details ? ` · ${x.details}` : ''}` }))
    ;(data.client_audit_log || []).forEach(x => rows.push({ id: `aud-${x.id}`, type: 'audit', date: x.created_at, title: `Auditoría · ${x.action || 'Cambio'}`, detail: x.field_name ? `Campo: ${x.field_name}` : 'Cambio registrado en el expediente' }))
    return rows.filter(x => x.date).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [data])

  const visible = filter === 'all' ? events : events.filter(x => x.type === filter)
  const filters = ['all', 'quote', 'work', 'delivery', 'dte', 'receivable', 'payment', 'interaction', 'audit']

  return <section className="c360timeline">
    <div className="c360timeline-head">
      <div><small>HISTORIAL ÚNICO</small><h3>Línea de tiempo del cliente</h3><p>Cotizaciones, producción, facturación, cobros y seguimiento en un solo lugar.</p></div>
      <span>{events.length} evento(s)</span>
    </div>
    <div className="c360timeline-filters">
      {filters.map(item => <button key={item} type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'Todo' : typeLabels[item]}</button>)}
    </div>
    <div className="c360timeline-list">
      {visible.length === 0 ? <p className="c360timeline-empty">Todavía no hay eventos para mostrar.</p> : visible.map(event => <article key={event.id} className={`c360timeline-item ${event.type}`}>
        <div className="c360timeline-dot" />
        <div className="c360timeline-date">{when(event.date)}</div>
        <div className="c360timeline-body"><span>{typeLabels[event.type]}</span><strong>{event.title}</strong><p>{event.detail}</p></div>
      </article>)}
    </div>
  </section>
}
