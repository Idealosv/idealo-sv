import { useEffect, useMemo, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const emptyItem = () => ({ descripcion: '', cantidad: '1', precioUni: '0.00', montoDescu: '0' })

export default function FacturacionDte({ session, supabase, company }) {
  const [clients, setClients] = useState([])
  const [documents, setDocuments] = useState([])
  const [clientId, setClientId] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [condicionOperacion, setCondicionOperacion] = useState('1')
  const [totalLetras, setTotalLetras] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    const [{ data: clientRows, error: clientError }, { data: dteRows, error: dteError }] = await Promise.all([
      supabase.from('clients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('dte_documents').select('id, client_id, control_number, generation_code, status, environment, created_at, dte_payload, mh_response').eq('company_id', company.id).eq('dte_type', '01').order('created_at', { ascending: false }).limit(30),
    ])
    if (clientError || dteError) setMessage(clientError?.message || dteError?.message)
    setClients(clientRows || [])
    setDocuments(dteRows || [])
  }

  useEffect(() => { load() }, [company.id])

  const selectedClient = clients.find((client) => client.id === clientId) || null
  const total = useMemo(() => items.reduce((sum, item) => {
    const quantity = Number(item.cantidad || 0)
    const price = Number(item.precioUni || 0)
    const discount = Number(item.montoDescu || 0)
    return sum + Math.max(0, quantity * price - discount)
  }, 0), [items])

  const updateItem = (index, key, value) => setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const addItem = () => setItems((current) => [...current, emptyItem()])
  const removeItem = (index) => setItems((current) => current.length === 1 ? current : current.filter((_, i) => i !== index))

  const createInvoice = async (event) => {
    event.preventDefault()
    setBusy('create')
    setMessage('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          companyId: company.id,
          clientId: clientId || null,
          items,
          condicionOperacion: Number(condicionOperacion),
          totalLetras,
          observaciones: observaciones || null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'No se pudo crear la factura.')
      setMessage(`Factura ${payload.control_number} creada como DRAFT. Revisala antes de firmar.`)
      await load()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  const sign = async (document) => {
    setBusy(document.id)
    setMessage('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/sign-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: document.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'No se pudo firmar el DTE.')
      setMessage(`DTE ${payload.control_number} firmado. Todavía no fue enviado a Hacienda.`)
      await load()
    } catch (error) {
      setMessage(error.message)
    } finally { setBusy('') }
  }

  const transmit = async (document) => {
    if (!window.confirm('Se enviará este documento únicamente a Hacienda TEST. ¿Continuar?')) return
    setBusy(document.id)
    setMessage('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/transmit-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ documentId: document.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Hacienda TEST rechazó la operación.')
      setMessage(`Resultado MH TEST: ${payload.status}. ${payload.control_number || ''}`)
      await load()
    } catch (error) {
      setMessage(error.message)
    } finally { setBusy('') }
  }

  return (
    <section className="clients-module">
      <div className="clients-titlebar">
        <div>
          <p className="form-kicker">DTE-01 · FACTURA ELECTRÓNICA</p>
          <h2>Facturación</h2>
          <p>Emisor automático, receptor opcional, partidas, condición de operación, firma y pruebas contra MH.</p>
        </div>
        <span className="status dte-ready">Ambiente TEST 00</span>
      </div>

      {message && <p className="feedback success">{message}</p>}

      <form className="panel client-form-full" onSubmit={createInvoice}>
        <fieldset className="form-section dte-section">
          <legend>1. Emisor</legend>
          <div className="dte-note">
            <strong>{company.name}</strong> · Los datos fiscales se toman automáticamente del módulo Empresa. No se reescriben en cada factura.
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>2. Receptor</legend>
          <div className="form-grid three">
            <label className="field form-span-2">
              <span>Cliente registrado</span>
              <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">Consumidor final sin identificación</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <div className="dte-note">
              {selectedClient ? `Documento: ${selectedClient.document_type || '—'} ${selectedClient.document_number || selectedClient.tax_id || '—'} · NRC: ${selectedClient.nrc || '—'}` : 'Para DTE-01 el receptor puede quedar sin identificar cuando legalmente corresponda.'}
            </div>
          </div>
          {selectedClient && (
            <div className="dte-note">
              <strong>Datos que irán al receptor:</strong> {selectedClient.name} · {selectedClient.business_activity || 'sin actividad'} · {selectedClient.address || 'sin dirección'} · {selectedClient.phone || 'sin teléfono'} · {selectedClient.email || 'sin correo'}.
            </div>
          )}
        </fieldset>

        <fieldset className="form-section">
          <legend>3. Detalle de la factura</legend>
          {items.map((item, index) => (
            <div className="form-grid three" key={index} style={{ marginBottom: 12 }}>
              <label className="field form-span-2"><span>Descripción *</span><input value={item.descripcion} onChange={(event) => updateItem(index, 'descripcion', event.target.value)} required /></label>
              <label className="field"><span>Cantidad *</span><input type="number" min="0.01" step="0.01" value={item.cantidad} onChange={(event) => updateItem(index, 'cantidad', event.target.value)} required /></label>
              <label className="field"><span>Precio unitario *</span><input type="number" min="0" step="0.01" value={item.precioUni} onChange={(event) => updateItem(index, 'precioUni', event.target.value)} required /></label>
              <label className="field"><span>Descuento</span><input type="number" min="0" step="0.01" value={item.montoDescu} onChange={(event) => updateItem(index, 'montoDescu', event.target.value)} /></label>
              <div className="form-actions"><button type="button" onClick={() => removeItem(index)} disabled={items.length === 1}>Quitar</button></div>
            </div>
          ))}
          <div className="form-actions"><button type="button" onClick={addItem}>+ Agregar partida</button></div>
        </fieldset>

        <fieldset className="form-section">
          <legend>4. Resumen y pago</legend>
          <div className="form-grid three">
            <label className="field"><span>Condición de operación *</span><select value={condicionOperacion} onChange={(event) => setCondicionOperacion(event.target.value)}><option value="1">Contado</option><option value="2">Crédito</option><option value="3">Otro</option></select></label>
            <label className="field form-span-2"><span>Total en letras *</span><input value={totalLetras} onChange={(event) => setTotalLetras(event.target.value)} placeholder="CIEN 00/100 DÓLARES" required /></label>
            <label className="field form-span-3"><span>Observaciones</span><textarea rows="2" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} /></label>
          </div>
          <div className="dte-note"><strong>Total calculado:</strong> ${total.toFixed(2)} · El IVA incluido se calcula dentro del DTE.</div>
        </fieldset>

        <div className="form-actions end"><button type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Creando…' : 'Guardar borrador DTE-01'}</button></div>
      </form>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="form-kicker">DOCUMENTOS</p><h3>Facturas recientes</h3></div><button type="button" onClick={load}>Actualizar</button></div>
        <div className="check-list">
          {documents.length === 0 ? <p>Todavía no hay facturas.</p> : documents.map((document) => (
            <div key={document.id} className="check-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong>{document.control_number}</strong>
                <small style={{ display: 'block' }}>{new Date(document.created_at).toLocaleString('es-SV')} · {document.status}</small>
                <small style={{ display: 'block' }}>Código de generación: {document.generation_code}</small>
              </div>
              <div className="form-actions">
                {document.status === 'DRAFT' && <button type="button" onClick={() => sign(document)} disabled={busy === document.id}>Firmar TEST</button>}
                {document.status === 'SIGNED' && <button type="button" onClick={() => transmit(document)} disabled={busy === document.id}>Enviar MH TEST</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}
