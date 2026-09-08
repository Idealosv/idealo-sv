import { useEffect, useMemo, useState } from 'react'
import RejectedDteRecovery from './RejectedDteRecovery.jsx'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const money = (value) => `$${Number(value || 0).toFixed(2)}`
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))
const STATUS_LABELS = {
  DRAFT: 'Borrador', SIGNING: 'Firmando', SIGNED: 'Firmado', TRANSMITTING: 'Enviando',
  PROCESSED: 'Aceptado MH', REJECTED: 'Rechazado MH',
}
const statusLabel = (status) => STATUS_LABELS[String(status || '').toUpperCase()] || String(status || 'Sin estado')
const dateTime = (value) => value ? new Date(value).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : '—'

async function apiRequest(path, session, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `La API respondió HTTP ${response.status}.`)
  return payload
}

export default function ProcessedDtePanel({ supabase, company, session, onOpenHacienda }) {
  const [documents, setDocuments] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')

  const load = async ({ keepSelection = true } = {}) => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('dte_documents')
      .select('id, client_id, dte_type, control_number, generation_code, environment, status, dte_payload, mh_response, reissued_from_id, created_at, updated_at')
      .eq('company_id', company.id)
      .in('dte_type', ['01', '03'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (queryError) setError(queryError.message)
    const rows = data || []
    setDocuments(rows)
    setSelectedId((current) => keepSelection && rows.some((row) => row.id === current) ? current : (rows[0]?.id || ''))
    setLoading(false)
  }

  useEffect(() => { load({ keepSelection: false }) }, [company.id])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents.filter((document) => {
      if (filter !== 'ALL' && document.status !== filter) return false
      if (!needle) return true
      const payload = document.dte_payload || {}
      const receptor = payload.receptor || {}
      return [document.control_number, document.generation_code, receptor.nombre, receptor.numDocumento, document.status]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [documents, filter, query])

  const selected = documents.find((document) => document.id === selectedId) || null
  const stats = useMemo(() => documents.reduce((acc, document) => {
    acc.total += 1
    const status = String(document.status || '').toUpperCase()
    if (status === 'DRAFT') acc.draft += 1
    if (status === 'SIGNED') acc.signed += 1
    if (status === 'PROCESSED') acc.processed += 1
    if (status === 'REJECTED') acc.rejected += 1
    return acc
  }, { total: 0, draft: 0, signed: 0, processed: 0, rejected: 0 }), [documents])

  const runAction = async (document, action) => {
    if (!session?.access_token || busyId) return
    setBusyId(document.id)
    setError('')
    setNotice('')
    try {
      if (action === 'sign') {
        await apiRequest('/api/dte/sign-test', session, { documentId: document.id })
        setNotice(`${document.control_number} fue firmado correctamente.`)
      } else if (action === 'transmit') {
        const result = await apiRequest('/api/dte/transmit-test', session, { documentId: document.id })
        const mh = result.mh_response?.body || result.mh_response || {}
        setNotice(`${document.control_number}: ${mh.descripcionMsg || mh.estado || statusLabel(result.status)}.`)
      }
      await load()
    } catch (actionError) {
      setError(actionError.message)
      await load()
    } finally {
      setBusyId('')
    }
  }

  const printRepresentation = (document) => {
    const payload = document.dte_payload || {}
    const receptor = payload.receptor || {}
    const emisor = payload.emisor || {}
    const resumen = payload.resumen || {}
    const mhRaw = document.mh_response || {}
    const mh = mhRaw.body || mhRaw
    const items = Array.isArray(payload.cuerpoDocumento) ? payload.cuerpoDocumento : []
    const rows = items.map((item) => {
      const total = Number(item.ventaGravada || 0) + Number(item.ventaExenta || 0) + Number(item.ventaNoSuj || 0)
      return `<tr><td>${safe(item.numItem)}</td><td>${safe(item.descripcion)}</td><td class="num">${safe(item.cantidad)}</td><td class="num">${money(item.precioUni)}</td><td class="num">${money(total)}</td></tr>`
    }).join('')
    const popup = window.open('', '_blank', 'width=980,height=900')
    if (!popup) return
    const dteName = document.dte_type === '03' ? 'Comprobante de Crédito Fiscal DTE-03' : 'Factura DTE-01'
    const seal = mh.selloRecibido || mh.sello || '—'
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(document.control_number)}</title><style>
      @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:12px}.sheet{max-width:800px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:3px solid #111827;padding-bottom:12px;margin-bottom:14px}.brand{font-size:22px;font-weight:800}.pill{display:inline-block;padding:5px 9px;border:1px solid #64748b;border-radius:20px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.box{border:1px solid #cbd5e1;border-radius:8px;padding:10px}.box h3{margin:0 0 7px;font-size:12px;text-transform:uppercase}.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 16px}.label{color:#64748b}.value{font-weight:700;word-break:break-word}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}.num{text-align:right}.totals{margin-left:auto;width:310px;margin-top:14px}.row{display:flex;justify-content:space-between;padding:5px 0}.total{font-size:15px;font-weight:800;border-top:2px solid #111827;margin-top:5px;padding-top:8px}.mh{margin-top:18px;border:1px solid #94a3b8;background:#f8fafc;border-radius:9px;padding:11px}.seal{font-family:monospace;word-break:break-all}.foot{margin-top:18px;color:#64748b;font-size:10px}@media print{button{display:none}}
    </style></head><body><div class="sheet">
      <div class="head"><div><div class="brand">IDEALO SV</div><div>${safe(dteName)}</div></div><div><span class="pill">${safe(statusLabel(document.status))}</span></div></div>
      <div class="box"><div class="meta"><div><span class="label">Número de control</span><div class="value">${safe(document.control_number)}</div></div><div><span class="label">Código de generación</span><div class="value">${safe(document.generation_code)}</div></div><div><span class="label">Fecha / hora emisión</span><div class="value">${safe(payload.identificacion?.fecEmi || '')} ${safe(payload.identificacion?.horEmi || '')}</div></div><div><span class="label">Ambiente</span><div class="value">${safe(document.environment === 'test' ? '00 · Pruebas' : document.environment)}</div></div></div></div>
      <div class="grid"><div class="box"><h3>Emisor</h3><div class="value">${safe(emisor.nombre || company.name)}</div><div>NIT ${safe(emisor.nit || company.nit)}</div><div>NRC ${safe(emisor.nrc || company.nrc)}</div><div>${safe(emisor.descActividad || company.business_activity)}</div><div>${safe(emisor.direccion?.complemento || company.address)}</div></div><div class="box"><h3>Receptor</h3><div class="value">${safe(receptor.nombre || 'Consumidor final')}</div><div>${safe(receptor.numDocumento || receptor.nit || '')}</div><div>${safe(receptor.nrc || '')}</div><div>${safe(receptor.direccion?.complemento || '')}</div><div>${safe(receptor.correo || '')}</div></div></div>
      <table><thead><tr><th>#</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div class="row"><span>Ventas gravadas</span><strong>${money(resumen.totalGravada)}</strong></div><div class="row"><span>Ventas exentas</span><strong>${money(resumen.totalExenta)}</strong></div><div class="row"><span>Ventas no sujetas</span><strong>${money(resumen.totalNoSuj)}</strong></div>${document.dte_type === '03' ? `<div class="row"><span>IVA 13%</span><strong>${money((resumen.tributos || []).reduce((sum,t)=>sum+Number(t.valor||0),0))}</strong></div>` : `<div class="row"><span>IVA incluido fiscal</span><strong>${money(resumen.totalIva)}</strong></div>`}<div class="row total"><span>Total a pagar</span><strong>${money(resumen.totalPagar ?? resumen.montoTotalOperacion)}</strong></div><div class="row"><span>Total en letras</span><strong>${safe(resumen.totalLetras || '')}</strong></div></div>
      <div class="mh"><strong>Ministerio de Hacienda</strong><div class="meta" style="margin-top:8px"><div><span class="label">Estado</span><div class="value">${safe(mh.estado || statusLabel(document.status))}</div></div><div><span class="label">Código / mensaje</span><div class="value">${safe(mh.codigoMsg || '—')} · ${safe(mh.descripcionMsg || mh.mensaje || '—')}</div></div><div><span class="label">Fecha procesamiento</span><div class="value">${safe(mh.fhProcesamiento || '—')}</div></div><div><span class="label">Sello de recepción</span><div class="value seal">${safe(seal)}</div></div></div></div>
      <div class="foot">Representación generada desde IDEALO SV a partir del DTE almacenado y, cuando existe, de la respuesta de Hacienda.</div>
      <div style="margin-top:16px;text-align:right"><button onclick="window.print()" style="padding:10px 16px;font-weight:700">Imprimir / Guardar PDF</button></div>
    </div></body></html>`)
    popup.document.close()
  }

  if (loading) return <div className="billing-documents-state">Cargando facturas y estados…</div>

  return <section className="billing-documents-control">
    {error && <div className="billing-documents-alert error">{error}</div>}
    {notice && <div className="billing-documents-alert success">{notice}</div>}

    <div className="billing-documents-kpis">
      <Kpi label="Documentos" value={stats.total}/><Kpi label="Borradores" value={stats.draft}/><Kpi label="Firmados" value={stats.signed}/><Kpi label="Aceptados MH" value={stats.processed}/><Kpi label="Rechazados" value={stats.rejected}/>
    </div>

    <div className="billing-documents-toolbar">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar número, generación o receptor" aria-label="Buscar facturas"/>
      <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar estado">
        <option value="ALL">Todos los estados</option><option value="DRAFT">Borradores</option><option value="SIGNED">Firmados</option><option value="PROCESSED">Aceptados MH</option><option value="REJECTED">Rechazados MH</option>
      </select>
      <button type="button" className="secondary-button" onClick={() => load()}>Actualizar</button>
    </div>

    {!filtered.length ? <div className="billing-documents-empty"><strong>No hay documentos para este filtro.</strong><small>Las facturas nuevas aparecerán aquí desde que se guardan como borrador DTE.</small></div> : <div className="billing-documents-table-wrap"><table className="billing-documents-table">
      <thead><tr><th>Documento</th><th>Receptor</th><th>Fecha</th><th>Base / total</th><th>Estado</th><th>Acción</th></tr></thead>
      <tbody>{filtered.map((document) => {
        const payload = document.dte_payload || {}
        const resumen = payload.resumen || {}
        const receptor = payload.receptor || {}
        return <tr key={document.id} className={selectedId === document.id ? 'selected' : ''}>
          <td><strong>{document.dte_type === '03' ? 'CCF DTE-03' : 'Factura DTE-01'}</strong><small>{document.control_number}</small>{document.reissued_from_id && <small>Reemisión vinculada</small>}</td>
          <td><strong>{receptor.nombre || 'Consumidor final'}</strong><small>{receptor.numDocumento || receptor.nit || receptor.nrc || 'Sin documento'}</small></td>
          <td>{dateTime(document.created_at)}</td>
          <td><strong>{money(resumen.totalPagar ?? resumen.montoTotalOperacion)}</strong><small>Gravado {money(resumen.totalGravada)}</small></td>
          <td><span className={`billing-document-status ${String(document.status || '').toLowerCase()}`}>{statusLabel(document.status)}</span></td>
          <td><button type="button" className="billing-document-link" onClick={() => setSelectedId(document.id)}>Ver detalle</button></td>
        </tr>
      })}</tbody>
    </table></div>}

    {selected && <DocumentDetail document={selected} busy={busyId === selected.id} onSign={() => runAction(selected, 'sign')} onTransmit={() => runAction(selected, 'transmit')} onPrint={() => printRepresentation(selected)} onOpenHacienda={onOpenHacienda}/>} 
    {selected?.status === 'REJECTED' && <RejectedDteRecovery document={selected} company={company} session={session} onCreated={async (created) => { setSelectedId(created.id); await load() }}/>} 
  </section>
}

function Kpi({ label, value }) { return <div className="billing-documents-kpi"><small>{label}</small><strong>{value}</strong></div> }

function DocumentDetail({ document, busy, onSign, onTransmit, onPrint, onOpenHacienda }) {
  const payload = document.dte_payload || {}
  const resumen = payload.resumen || {}
  const receptor = payload.receptor || {}
  const mhRaw = document.mh_response || {}
  const mh = mhRaw.body || mhRaw
  const canSign = document.status === 'DRAFT'
  const canTransmit = document.status === 'SIGNED'
  return <article className="billing-document-detail">
    <div className="billing-document-detail-head"><div><span>Documento seleccionado</span><strong>{document.control_number}</strong><small>{document.generation_code}</small></div><span className={`billing-document-status ${String(document.status || '').toLowerCase()}`}>{statusLabel(document.status)}</span></div>
    <div className="billing-document-detail-grid">
      <Info label="Tipo" value={document.dte_type === '03' ? 'Comprobante de Crédito Fiscal DTE-03' : 'Factura Consumidor Final DTE-01'}/>
      <Info label="Receptor" value={receptor.nombre || 'Consumidor final'}/>
      <Info label="Fecha" value={dateTime(document.created_at)}/>
      <Info label="Total" value={money(resumen.totalPagar ?? resumen.montoTotalOperacion)}/>
      <Info label="Ambiente" value={document.environment === 'test' ? 'TEST 00' : document.environment}/>
      <Info label="Respuesta MH" value={mh.descripcionMsg || mh.mensaje || mh.estado || 'Aún sin respuesta de Hacienda'}/>
    </div>
    {(document.status === 'REJECTED' || mh.codigoMsg || mh.observaciones) && <div className="billing-mh-response"><strong>Respuesta de Hacienda</strong><p>{[mh.codigoMsg, mh.descripcionMsg || mh.mensaje, Array.isArray(mh.observaciones) ? mh.observaciones.join(' · ') : mh.observaciones].filter(Boolean).join(' · ') || 'Sin detalle adicional.'}</p></div>}
    <div className="billing-document-actions">
      <button type="button" className="secondary-button" onClick={onPrint}>Ver / imprimir</button>
      {canSign && <button type="button" onClick={onSign} disabled={busy}>{busy ? 'Firmando…' : 'Firmar DTE'}</button>}
      {canTransmit && <button type="button" onClick={onTransmit} disabled={busy}>{busy ? 'Enviando…' : 'Enviar a Hacienda TEST'}</button>}
      {onOpenHacienda && <button type="button" className="secondary-button" onClick={onOpenHacienda}>Abrir Hacienda</button>}
    </div>
    <small className="billing-document-safety">La transmisión disponible desde esta pantalla respeta el bloqueo actual del backend y solo usa Hacienda TEST 00.</small>
  </article>
}

function Info({ label, value }) { return <div className="billing-document-info"><span>{label}</span><strong>{value || '—'}</strong></div> }
