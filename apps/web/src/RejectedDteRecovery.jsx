import { useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function fiscalItems(document) {
  const rows = Array.isArray(document?.dte_payload?.cuerpoDocumento) ? document.dte_payload.cuerpoDocumento : []
  return rows.map((item) => ({
    descripcion: item.descripcion || '',
    cantidad: Number(item.cantidad || 0),
    precioUni: Number(item.precioUni || 0),
    montoDescu: Number(item.montoDescu || 0),
    tipoItem: Number(item.tipoItem || 2),
    uniMedida: Number(item.uniMedida || 59),
    codigo: item.codigo || null,
    tipoVenta: Number(item.ventaExenta || 0) > 0 ? 'exenta' : Number(item.ventaNoSuj || 0) > 0 ? 'no_sujeta' : 'gravada',
    numeroDocumento: item.numeroDocumento || null,
    codTributo: item.codTributo || null,
  }))
}

function firstPayment(resumen) {
  const payment = Array.isArray(resumen?.pagos) ? resumen.pagos[0] : null
  if (!payment) return null
  return {
    codigo: payment.codigo || '01',
    montoPago: Number(payment.montoPago || resumen.totalPagar || resumen.montoTotalOperacion || 0),
    referencia: payment.referencia || null,
    plazo: payment.plazo || null,
    periodo: payment.periodo || null,
  }
}

export default function RejectedDteRecovery({ document, company, session, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  if (!document || document.status !== 'REJECTED') return null

  const mhRaw = document.mh_response || {}
  const mh = mhRaw.body || mhRaw
  const resumen = document.dte_payload?.resumen || {}
  const items = fiscalItems(document)
  const specialAdjustments = [
    Number(resumen.ivaRete1 || resumen.totalIvaRete || 0),
    Number(resumen.ivaPerci1 || resumen.totalIvaPerci || 0),
    Number(resumen.reteRenta || 0),
    Number(resumen.saldoFavor || 0),
    Number(resumen.totalNoGravado || 0),
  ].some((value) => Math.abs(value) > 0.0001)

  const prepare = async () => {
    if (!session?.access_token || busy || created) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          companyId: company.id,
          clientId: document.client_id || null,
          dteType: document.dte_type,
          items,
          condicionOperacion: Number(resumen.condicionOperacion || 1),
          totalLetras: resumen.totalLetras || 'TOTAL SEGÚN DOCUMENTO RECHAZADO',
          observaciones: document.dte_payload?.extension?.observaciones || null,
          payment: firstPayment(resumen),
          numPagoElectronico: resumen.numPagoElectronico || null,
          ivaRete: Number(resumen.ivaRete1 || resumen.totalIvaRete || 0),
          ivaPerci: Number(resumen.ivaPerci1 || resumen.totalIvaPerci || 0),
          reteRenta: Number(resumen.reteRenta || 0),
          saldoFavor: Number(resumen.saldoFavor || 0),
          totalNoGravado: Number(resumen.totalNoGravado || 0),
          reissuedFromId: document.id,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `La API respondió HTTP ${response.status}.`)
      setCreated(payload)
      onCreated?.(payload)
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="billing-rejection-recovery">
    <div className="billing-mh-response"><strong>Documento rechazado: no se vuelve a transmitir</strong><p>{[mh.codigoMsg, mh.descripcionMsg || mh.mensaje, Array.isArray(mh.observaciones) ? mh.observaciones.join(' · ') : mh.observaciones].filter(Boolean).join(' · ') || 'Hacienda no devolvió detalle adicional.'}</p></div>
    <div className="billing-recovery-copy"><strong>Preparar reemisión segura</strong><p>Genera un DTE nuevo con otro código de generación y número de control, usando los datos fiscales actuales de Empresa y Clientes y conservando los conceptos del documento rechazado. El rechazado queda intacto y ambos documentos quedan enlazados internamente.</p></div>
    {specialAdjustments && <p className="billing-client-warning">Este documento contiene retenciones, percepciones u otros ajustes especiales. Revisá cuidadosamente el nuevo borrador antes de firmarlo.</p>}
    {error && <p className="feedback error">{error}</p>}
    {created ? <p className="feedback success">Nueva reemisión preparada: <strong>{created.control_number}</strong>. Revisala en Documentos antes de firmar.</p> : <button type="button" onClick={prepare} disabled={busy || !items.length}>{busy ? 'Preparando…' : 'Preparar nuevo DTE con datos actualizados'}</button>}
  </section>
}
