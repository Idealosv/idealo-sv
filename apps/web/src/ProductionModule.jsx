import { useEffect, useMemo, useState } from 'react'

const STAGES = [
  ['PENDING', 'Pendiente'],
  ['DESIGN', 'Diseño'],
  ['APPROVAL', 'Aprobación'],
  ['PRODUCTION', 'Producción'],
  ['READY', 'Listo'],
  ['DELIVERED', 'Entregado'],
]

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

const stageLabel = (value) => STAGES.find(([code]) => code === value)?.[1] || value
const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))

export default function ProductionModule({ company, supabase }) {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('OPEN')

  const load = async () => {
    const { data, error } = await supabase
      .from('work_orders')
      .select('*, clients(name, phone), work_order_items(*)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    if (error) setMessage(error.message)
    else {
      setRows(data || [])
      if (selected) setSelected((data || []).find((row) => row.id === selected.id) || null)
    }
  }

  useEffect(() => { load() }, [company.id])

  const visible = useMemo(() => rows.filter((row) => {
    if (filter === 'ALL') return true
    if (filter === 'DELIVERED') return row.status === 'DELIVERED'
    return row.status !== 'DELIVERED' && row.status !== 'CANCELLED'
  }), [rows, filter])

  const counts = useMemo(() => Object.fromEntries(STAGES.map(([code]) => [code, rows.filter((row) => row.status === code).length])), [rows])

  const saveOrder = async (patch) => {
    if (!selected) return
    setBusy(true); setMessage('')
    const payload = { ...patch, updated_at: new Date().toISOString() }
    if (patch.status === 'PRODUCTION' && !selected.production_started_at) payload.production_started_at = new Date().toISOString()
    if (patch.status === 'READY' && !selected.ready_at) payload.ready_at = new Date().toISOString()
    if (patch.status === 'DELIVERED' && !selected.delivered_at) payload.delivered_at = new Date().toISOString()
    if (patch.status === 'PRODUCTION' && selected.status === 'APPROVAL' && !selected.client_approval_at) payload.client_approval_at = new Date().toISOString()
    const { error } = await supabase.from('work_orders').update(payload).eq('id', selected.id)
    if (error) setMessage(error.message)
    else { setMessage('Orden actualizada.'); await load() }
    setBusy(false)
  }

  const nextStage = (status) => ({ PENDING: 'DESIGN', DESIGN: 'APPROVAL', APPROVAL: 'PRODUCTION', PRODUCTION: 'READY', READY: 'DELIVERED' }[status])

  return (
    <section className="production-suite">
      <div className="module-hero compact">
        <div>
          <p className="form-kicker">OPERACIONES</p>
          <h2>Producción</h2>
          <p>Controlá cada trabajo desde diseño hasta entrega sin exponer insumos internos al cliente.</p>
        </div>
        <div className="production-summary">
          <div><small>Abiertas</small><strong>{rows.filter((r) => !['DELIVERED','CANCELLED'].includes(r.status)).length}</strong></div>
          <div><small>En producción</small><strong>{counts.PRODUCTION || 0}</strong></div>
          <div><small>Listas</small><strong>{counts.READY || 0}</strong></div>
        </div>
      </div>

      {message && <p className="feedback success">{message}</p>}

      <div className="production-toolbar">
        <div className="segmented-control">
          {['OPEN','DELIVERED','ALL'].map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'OPEN' ? 'Abiertas' : value === 'DELIVERED' ? 'Entregadas' : 'Todas'}</button>)}
        </div>
        <span className="muted-note">{visible.length} órdenes</span>
      </div>

      <div className="production-board">
        {STAGES.filter(([code]) => filter !== 'DELIVERED' ? code !== 'DELIVERED' : true).map(([code, label]) => {
          const stageRows = visible.filter((row) => row.status === code)
          return <section className="production-column" key={code}>
            <header><span>{label}</span><strong>{stageRows.length}</strong></header>
            <div className="production-stack">
              {stageRows.map((row) => <button type="button" className={`production-card priority-${String(row.priority || 'NORMAL').toLowerCase()}`} key={row.id} onClick={() => setSelected(row)}>
                <div className="production-card-top"><small>OT-{String(row.number).padStart(5,'0')}</small><span>{row.priority || 'NORMAL'}</span></div>
                <strong>{row.title}</strong>
                <p>{row.clients?.name || 'Cliente sin nombre'}</p>
                <div className="production-card-meta"><span>{row.due_at ? new Date(row.due_at).toLocaleDateString('es-SV') : 'Sin fecha'}</span><span>{money(row.total)}</span></div>
              </button>)}
              {!stageRows.length && <div className="production-empty">Sin trabajos</div>}
            </div>
          </section>
        })}
      </div>

      {selected && <div className="production-detail-backdrop" onMouseDown={() => setSelected(null)}>
        <aside className="production-detail" onMouseDown={(event) => event.stopPropagation()}>
          <header className="production-detail-head">
            <div><small>OT-{String(selected.number).padStart(5,'0')}</small><h3>{selected.title}</h3><p>{selected.clients?.name || 'Cliente'}</p></div>
            <button className="detail-close" onClick={() => setSelected(null)}>×</button>
          </header>
          <div className="production-detail-body">
            <div className="detail-grid">
              <label><span>Etapa</span><select value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value })}>{STAGES.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label>
              <label><span>Prioridad</span><select value={selected.priority || 'NORMAL'} onChange={(e) => setSelected({ ...selected, priority: e.target.value })}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label><span>Entrega prevista</span><input type="datetime-local" value={selected.due_at ? new Date(selected.due_at).toISOString().slice(0,16) : ''} onChange={(e) => setSelected({ ...selected, due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}/></label>
              <label><span>Estado de diseño</span><select value={selected.design_status || 'PENDING'} onChange={(e) => setSelected({ ...selected, design_status: e.target.value })}><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En proceso</option><option value="READY">Listo para cliente</option><option value="APPROVED">Aprobado</option><option value="CHANGES_REQUESTED">Cambios solicitados</option></select></label>
            </div>

            <section className="detail-section"><h4>Partidas del trabajo</h4>{selected.work_order_items?.length ? selected.work_order_items.map((item) => <div className="detail-line" key={item.id}><span>{item.quantity} {item.unit}</span><strong>{item.description}</strong><small>{money(item.line_total)}</small></div>) : <p className="muted-note">Sin partidas registradas.</p>}</section>

            <label className="detail-field"><span>Especificaciones de producción</span><textarea rows="4" value={selected.specifications || ''} onChange={(e) => setSelected({ ...selected, specifications: e.target.value })} placeholder="Medidas, colores, acabado, ubicación de impresión, observaciones del cliente..."/></label>
            <label className="detail-field"><span>Notas internas</span><textarea rows="3" value={selected.internal_notes || ''} onChange={(e) => setSelected({ ...selected, internal_notes: e.target.value })}/></label>
            <label className="detail-field"><span>Notas de entrega</span><textarea rows="3" value={selected.delivery_notes || ''} onChange={(e) => setSelected({ ...selected, delivery_notes: e.target.value })}/></label>

            <div className="detail-timeline">
              <div><small>Aprobación cliente</small><strong>{selected.client_approval_at ? new Date(selected.client_approval_at).toLocaleString('es-SV') : 'Pendiente'}</strong></div>
              <div><small>Inicio producción</small><strong>{selected.production_started_at ? new Date(selected.production_started_at).toLocaleString('es-SV') : 'Pendiente'}</strong></div>
              <div><small>Trabajo listo</small><strong>{selected.ready_at ? new Date(selected.ready_at).toLocaleString('es-SV') : 'Pendiente'}</strong></div>
              <div><small>Entregado</small><strong>{selected.delivered_at ? new Date(selected.delivered_at).toLocaleString('es-SV') : 'Pendiente'}</strong></div>
            </div>
          </div>
          <footer className="production-detail-actions">
            <button className="secondary" disabled={busy} onClick={() => saveOrder({ status: selected.status, priority: selected.priority, due_at: selected.due_at, design_status: selected.design_status, specifications: selected.specifications, internal_notes: selected.internal_notes, delivery_notes: selected.delivery_notes })}>Guardar cambios</button>
            {nextStage(selected.status) && <button disabled={busy} onClick={() => saveOrder({ status: nextStage(selected.status), priority: selected.priority, due_at: selected.due_at, design_status: selected.design_status, specifications: selected.specifications, internal_notes: selected.internal_notes, delivery_notes: selected.delivery_notes })}>Avanzar a {stageLabel(nextStage(selected.status))}</button>}
          </footer>
        </aside>
      </div>}
    </section>
  )
}
