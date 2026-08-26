import { useEffect, useMemo, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function InvoiceEmailPdfTestPanel({ supabase, company, session }) {
  const [documents, setDocuments] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
      if (queryError) setError(queryError.message)
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

  const sendTest = async () => {
    if (!selected || busy || !session?.access_token) return
    setBusy(true)
    setError('')
    setMessage('Generando PDF y enviando la prueba a tu Gmail…')
    try {
      const response = await fetch(`${apiUrl}/api/dte/invoice-email-self-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: selected.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `La API respondió HTTP ${response.status}.`)
      setMessage(`✓ Prueba enviada a ${payload.recipient} con PDF adjunto. No se generó, firmó ni transmitió ningún DTE nuevo a Hacienda.`)
    } catch (cause) {
      setMessage('')
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (!documents.length) return null

  return <section className="billing-document-detail" aria-label="Prueba segura de correo con PDF">
    <div className="billing-document-detail-head">
      <div><span>Prueba segura de correo</span><strong>Enviar representación gráfica PDF</strong><small>Usa un DTE ya aceptado. El destinatario de esta prueba es tu Gmail configurado, no el cliente.</small></div>
      <span className="billing-document-status processed">Sin transmisión MH</span>
    </div>
    <div className="billing-document-detail-grid">
      <label className="billing-document-info"><span>DTE aceptado</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{documents.map((row) => <option key={row.id} value={row.id}>{row.control_number}</option>)}</select></label>
      <div className="billing-document-info"><span>Receptor original</span><strong>{receptor.nombre || 'Consumidor final'}</strong></div>
      <div className="billing-document-info"><span>Correo original</span><strong>{receptor.correo || 'Sin correo'}</strong></div>
      <div className="billing-document-info"><span>Ambiente del DTE</span><strong>{selected?.environment === 'test' ? 'TEST 00' : String(selected?.environment || '—')}</strong></div>
    </div>
    {message && <div className="billing-documents-alert success">{message}</div>}
    {error && <div className="billing-documents-alert error">{error}</div>}
    <div className="billing-document-actions">
      <button type="button" onClick={sendTest} disabled={busy}>{busy ? 'Enviando PDF…' : 'Enviar PDF de prueba a mi Gmail'}</button>
    </div>
    <small className="billing-document-safety">Esta acción no llama a los endpoints de firma ni transmisión de Hacienda; únicamente genera el PDF desde el DTE almacenado y lo envía a la cuenta Gmail configurada.</small>
  </section>
}
