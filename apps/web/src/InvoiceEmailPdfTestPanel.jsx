import { useEffect, useMemo, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const dateTime = (value) => value ? new Date(value).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const DELIVERY_LABELS = { pending: 'Correo pendiente', sent: 'Correo enviado', failed: 'Error de correo', skipped: 'Correo omitido' }
const STAGE_LABELS = { session: 'sesión', document: 'lectura del DTE', permissions: 'permisos', 'gmail-config': 'configuración de Gmail', pdf: 'generación del PDF', smtp: 'envío por Gmail' }
const apiErrorMessage = (payload, status) => {
  const base = payload?.message || `La API respondió HTTP ${status}.`
  const stage = payload?.stage ? `Etapa: ${STAGE_LABELS[payload.stage] || payload.stage}. ` : ''
  const code = payload?.code && payload.code !== 'PDF_EMAIL_TEST_FAILED' ? ` Código: ${payload.code}.` : ''
  return `${stage}${base}${code}`
}

export default function InvoiceEmailPdfTestPanel({ supabase, company, session }) {
  const [documents, setDocuments] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  const [testError, setTestError] = useState('')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [deliveryError, setDeliveryError] = useState('')
  const [delivery, setDelivery] = useState(null)
  const [deliveryLoading, setDeliveryLoading] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error: queryError } = await supabase
        .from('dte_documents')
        .select('id, control_number, dte_type, status, environment, dte_payload, mh_response, created_at')
        .eq('company_id', company.id)
        .eq('status', 'PROCESSED')
        .in('dte_type', ['01', '03'])
        .order('created_at', { ascending: false })
        .limit(100)
      if (!active) return
      if (queryError) setTestError(queryError.message)
      const rows = (data || []).filter((row) => {
        const mh = row.mh_response?.body || row.mh_response || {}
        return Boolean(mh.selloRecibido || mh.selloRecepcion || mh.sello)
      })
      setDocuments(rows)
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : (rows[0]?.id || ''))
    }
    load()
    return () => { active = false }
  }, [company.id, supabase])

  useEffect(() => {
    const selectFromDetail = (event) => {
      const controlNumber = String(event.detail?.controlNumber || '').trim()
      const match = documents.find((row) => row.control_number === controlNumber)
      if (match) setSelectedId(match.id)
    }
    window.addEventListener('idealo-dte-detail-selected', selectFromDetail)
    return () => window.removeEventListener('idealo-dte-detail-selected', selectFromDetail)
  }, [documents])

  const selected = useMemo(() => documents.find((row) => row.id === selectedId) || null, [documents, selectedId])
  const receptor = selected?.dte_payload?.receptor || {}

  const loadDelivery = async () => {
    if (!selectedId || !session?.access_token) { setDelivery(null); return }
    setDeliveryLoading(true)
    setDeliveryError('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/invoice-email-status?documentId=${encodeURIComponent(selectedId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `Estado de correo respondió HTTP ${response.status}.`)
      setDelivery(payload)
      if (payload.trackingAvailable === false) setDeliveryError(payload.trackingError || 'El historial de entrega no está disponible temporalmente.')
    } catch (cause) {
      setDelivery(null)
      setDeliveryError(cause?.message || 'No se pudo consultar el estado del correo.')
    } finally {
      setDeliveryLoading(false)
    }
  }

  useEffect(() => { loadDelivery() }, [selectedId, session?.access_token])

  const sendTest = async () => {
    if (!selected || busy || !session?.access_token) return
    setBusy(true)
    setTestError('')
    setTestMessage('Generando PDF y enviando la prueba a tu Gmail…')
    try {
      const response = await fetch(`${apiUrl}/api/dte/invoice-email-self-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: selected.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(apiErrorMessage(payload, response.status))
      setTestMessage(`✓ Prueba enviada a ${payload.recipient} con PDF adjunto. No se generó, firmó ni transmitió ningún DTE nuevo a Hacienda.`)
    } catch (cause) {
      setTestMessage('')
      setTestError(cause?.message === 'Failed to fetch' ? `No fue posible conectar con la API ${apiUrl}.` : (cause?.message || 'No se pudo enviar la prueba.'))
    } finally {
      setBusy(false)
    }
  }

  const resendClient = async () => {
    if (!selected || resendBusy || !delivery?.eligible || !session?.access_token) return
    const confirmed = window.confirm(`REENVIAR DTE POR CORREO\n\nDestinatario: ${delivery.recipient || receptor.correo || 'sin correo'}\nDocumento: ${selected.control_number}\n\nEsta acción NO genera, firma ni retransmite el DTE a Hacienda. ¿Continuar?`)
    if (!confirmed) return
    setResendBusy(true)
    setDeliveryError('')
    setDeliveryMessage('Reenviando el DTE al correo del cliente…')
    try {
      const response = await fetch(`${apiUrl}/api/dte/invoice-email-resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: selected.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `El reenvío respondió HTTP ${response.status}.`)
      setDeliveryMessage(`✓ Correo reenviado a ${payload.recipient}. PDF y archivos electrónicos adjuntos. No hubo transmisión a Hacienda.`)
      await loadDelivery()
    } catch (cause) {
      setDeliveryMessage('')
      setDeliveryError(cause?.message || 'No se pudo reenviar el correo al cliente.')
      await loadDelivery()
    } finally {
      setResendBusy(false)
    }
  }

  if (!documents.length) return null
  const latest = delivery?.latest || null
  const latestLabel = latest ? (DELIVERY_LABELS[latest.status] || latest.status) : 'Sin envío registrado'

  return <>
    <section className="billing-document-detail" aria-label="Control de entrega por correo">
      <div className="billing-document-detail-head">
        <div><span>Entrega al cliente</span><strong>Estado del correo del DTE</strong><small>Seguimiento de envío automático y reenvíos manuales. Reenviar nunca retransmite a Hacienda.</small></div>
        <span className={`billing-document-status ${latest?.status === 'sent' ? 'processed' : latest?.status === 'failed' ? 'rejected' : ''}`}>{deliveryLoading ? 'Consultando…' : latestLabel}</span>
      </div>
      <div className="billing-document-detail-grid">
        <div className="billing-document-info"><span>Destinatario</span><strong>{delivery?.recipient || receptor.correo || 'Sin correo'}</strong></div>
        <div className="billing-document-info"><span>Último evento</span><strong>{latest ? dateTime(latest.sent_at || latest.updated_at || latest.created_at) : '—'}</strong></div>
        <div className="billing-document-info"><span>Tipo de envío</span><strong>{latest ? (latest.delivery_kind === 'automatic' ? 'Automático' : 'Reenvío manual') : '—'}</strong></div>
        <div className="billing-document-info"><span>Ambiente fiscal</span><strong>{selected?.environment === 'production' ? 'PRODUCCIÓN' : 'TEST / PRUEBAS'}</strong></div>
      </div>
      {deliveryMessage && <div className="billing-documents-alert success">{deliveryMessage}</div>}
      {deliveryError && <div className="billing-documents-alert error">{deliveryError}</div>}
      {latest?.error_message && !deliveryError && <div className="billing-documents-alert error">Último error: {latest.error_message}</div>}
      <div className="billing-document-actions">
        <button type="button" onClick={resendClient} disabled={resendBusy || deliveryLoading || !delivery?.eligible}>{resendBusy ? 'Reenviando…' : 'Reenviar correo al cliente'}</button>
        <button type="button" className="secondary-button" onClick={loadDelivery} disabled={deliveryLoading}>{deliveryLoading ? 'Actualizando…' : 'Actualizar estado'}</button>
      </div>
      {!delivery?.eligible && <small className="billing-document-safety">El reenvío real se habilita únicamente para DTE de PRODUCCIÓN ya aceptados por Hacienda y con sello de recepción. Los DTE de TEST no se envían al cliente desde este botón.</small>}
      {delivery?.eligible && <small className="billing-document-safety">Seguro fiscal: este botón solo reutiliza el DTE almacenado y sus adjuntos; no llama a firma ni a transmisión de Hacienda.</small>}
    </section>

    <section className="billing-document-detail" aria-label="Prueba segura de correo con PDF">
      <div className="billing-document-detail-head">
        <div><span>Prueba segura de correo</span><strong>Enviar representación gráfica PDF</strong><small>Usa un DTE ya aceptado. El destinatario de esta prueba es tu Gmail configurado, no el cliente.</small></div>
        <span className="billing-document-status processed">Sin transmisión MH</span>
      </div>
      <div className="billing-document-detail-grid">
        <label className="billing-document-info"><span>DTE aceptado</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{documents.map((row) => <option key={row.id} value={row.id}>{row.control_number}</option>)}</select></label>
        <div className="billing-document-info"><span>Receptor original</span><strong>{receptor.nombre || 'Consumidor final'}</strong></div>
        <div className="billing-document-info"><span>Correo original</span><strong>{receptor.correo || 'Sin correo'}</strong></div>
        <div className="billing-document-info"><span>Ambiente del DTE</span><strong>{selected?.environment === 'test' ? 'TEST 00' : String(selected?.environment || '—').toUpperCase()}</strong></div>
      </div>
      {testMessage && <div className="billing-documents-alert success">{testMessage}</div>}
      {testError && <div className="billing-documents-alert error">{testError}</div>}
      <div className="billing-document-actions"><button type="button" onClick={sendTest} disabled={busy}>{busy ? 'Enviando PDF…' : 'Enviar PDF de prueba a mi Gmail'}</button></div>
      <small className="billing-document-safety">Esta acción no llama a los endpoints de firma ni transmisión de Hacienda; únicamente genera el PDF desde el DTE almacenado y lo envía a la cuenta Gmail configurada.</small>
    </section>
  </>
}
