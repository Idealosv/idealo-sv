import { useEffect, useState } from 'react'

const money = (value) => `$${Number(value || 0).toFixed(2)}`
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))

export default function ProcessedDtePanel({ supabase, company }) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('dte_documents')
      .select('id, control_number, generation_code, status, dte_payload, mh_response, mh_receipt_seal, mh_processed_at, mh_message_code, mh_message, created_at')
      .eq('company_id', company.id)
      .eq('dte_type', '01')
      .eq('status', 'PROCESSED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (queryError) setError(queryError.message)
    setDocument(data || null)
    setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  if (loading) return <section style={styles.card}><strong>Recepción MH</strong><p style={styles.muted}>Buscando el último DTE procesado…</p></section>
  if (error) return <section style={{ ...styles.card, ...styles.error }}><strong>No se pudo consultar la recepción MH</strong><p>{error}</p></section>
  if (!document) return null

  const mh = document.mh_response || {}
  const payload = document.dte_payload || {}
  const resumen = payload.resumen || {}
  const sello = document.mh_receipt_seal || mh.selloRecibido || '—'
  const processedAt = document.mh_processed_at || mh.fhProcesamiento || '—'
  const messageCode = document.mh_message_code || mh.codigoMsg || '—'
  const message = document.mh_message || mh.descripcionMsg || 'RECIBIDO'

  const printRepresentation = () => {
    const receptor = payload.receptor || {}
    const emisor = payload.emisor || {}
    const items = Array.isArray(payload.cuerpoDocumento) ? payload.cuerpoDocumento : []
    const rows = items.map((item) => `<tr><td>${safe(item.numItem)}</td><td>${safe(item.descripcion)}</td><td class="num">${safe(item.cantidad)}</td><td class="num">${money(item.precioUni)}</td><td class="num">${money((item.ventaGravada || 0) + (item.ventaExenta || 0) + (item.ventaNoSuj || 0))}</td></tr>`).join('')
    const popup = window.open('', '_blank', 'width=980,height=900')
    if (!popup) return
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(document.control_number)}</title><style>
      @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:12px}.sheet{max-width:800px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:3px solid #111827;padding-bottom:12px;margin-bottom:14px}.brand{font-size:22px;font-weight:800}.pill{display:inline-block;padding:5px 9px;border:1px solid #15803d;border-radius:20px;color:#166534;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.box{border:1px solid #cbd5e1;border-radius:8px;padding:10px}.box h3{margin:0 0 7px;font-size:12px;text-transform:uppercase}.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 16px}.label{color:#64748b}.value{font-weight:700;word-break:break-word}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}.num{text-align:right}.totals{margin-left:auto;width:310px;margin-top:14px}.row{display:flex;justify-content:space-between;padding:5px 0}.total{font-size:15px;font-weight:800;border-top:2px solid #111827;margin-top:5px;padding-top:8px}.mh{margin-top:18px;border:2px solid #16a34a;background:#f0fdf4;border-radius:9px;padding:11px}.seal{font-family:monospace;word-break:break-all}.foot{margin-top:18px;color:#64748b;font-size:10px}@media print{button{display:none}}
    </style></head><body><div class="sheet">
      <div class="head"><div><div class="brand">IDEALO SV</div><div>Representación gráfica DTE-01</div></div><div><span class="pill">MH ${safe(mh.estado || 'PROCESADO')}</span></div></div>
      <div class="box"><div class="meta"><div><span class="label">Número de control</span><div class="value">${safe(document.control_number)}</div></div><div><span class="label">Código de generación</span><div class="value">${safe(document.generation_code)}</div></div><div><span class="label">Fecha / hora emisión</span><div class="value">${safe(payload.identificacion?.fecEmi || '')} ${safe(payload.identificacion?.horEmi || '')}</div></div><div><span class="label">Ambiente</span><div class="value">00 · Pruebas</div></div></div></div>
      <div class="grid"><div class="box"><h3>Emisor</h3><div class="value">${safe(emisor.nombre || company.name)}</div><div>NIT ${safe(emisor.nit || company.nit)}</div><div>NRC ${safe(emisor.nrc || company.nrc)}</div><div>${safe(emisor.descActividad || company.business_activity)}</div><div>${safe(emisor.direccion?.complemento || company.address)}</div></div><div class="box"><h3>Receptor</h3><div class="value">${safe(receptor.nombre || 'Consumidor final')}</div><div>${safe(receptor.numDocumento || receptor.nit || '')}</div><div>${safe(receptor.nrc || '')}</div><div>${safe(receptor.direccion?.complemento || '')}</div><div>${safe(receptor.correo || '')}</div></div></div>
      <table><thead><tr><th>#</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div class="row"><span>Ventas gravadas</span><strong>${money(resumen.totalGravada)}</strong></div><div class="row"><span>Ventas exentas</span><strong>${money(resumen.totalExenta)}</strong></div><div class="row"><span>Ventas no sujetas</span><strong>${money(resumen.totalNoSuj)}</strong></div><div class="row"><span>IVA incluido</span><strong>${money(resumen.totalIva)}</strong></div><div class="row total"><span>Total a pagar</span><strong>${money(resumen.totalPagar ?? resumen.montoTotalOperacion)}</strong></div><div class="row"><span>Total en letras</span><strong>${safe(resumen.totalLetras || '')}</strong></div></div>
      <div class="mh"><strong>Recepción Ministerio de Hacienda</strong><div class="meta" style="margin-top:8px"><div><span class="label">Estado</span><div class="value">${safe(mh.estado || 'PROCESADO')}</div></div><div><span class="label">Código / mensaje</span><div class="value">${safe(messageCode)} · ${safe(message)}</div></div><div><span class="label">Fecha procesamiento</span><div class="value">${safe(processedAt)}</div></div><div><span class="label">Sello de recepción</span><div class="value seal">${safe(sello)}</div></div></div></div>
      <div class="foot">Documento generado desde IDEALO SV. Ambiente TEST 00. Esta representación se basa en el DTE y la respuesta de recepción almacenados en el ERP.</div>
      <div style="margin-top:16px;text-align:right"><button onclick="window.print()" style="padding:10px 16px;font-weight:700">Imprimir / Guardar PDF</button></div>
    </div></body></html>`)
    popup.document.close()
  }

  return (
    <section style={styles.card}>
      <div style={styles.head}>
        <div><strong>Último DTE recibido por Hacienda</strong><p style={styles.muted}>{document.control_number}</p></div>
        <span style={styles.badge}>PROCESSED</span>
      </div>
      <div style={styles.grid}>
        <Info label="Código MH" value={`${messageCode} · ${message}`} />
        <Info label="Procesado" value={processedAt} />
        <Info label="Código de generación" value={document.generation_code} />
        <Info label="Sello de recepción" value={sello} mono />
      </div>
      <div style={styles.actions}><button type="button" onClick={printRepresentation} style={styles.primary}>Ver / imprimir representación</button><button type="button" onClick={load} style={styles.secondary}>Actualizar recepción</button></div>
    </section>
  )
}

function Info({ label, value, mono = false }) {
  return <div style={styles.info}><small style={styles.muted}>{label}</small><strong style={mono ? styles.mono : undefined}>{value || '—'}</strong></div>
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #86efac', borderRadius: 14, background: '#f0fdf4', color: '#1f2937' },
  error: { borderColor: '#fca5a5', background: '#fff7f7' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  muted: { margin: '3px 0 0', color: '#64748b' },
  badge: { padding: '6px 10px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontWeight: 900, fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginTop: 14 },
  info: { display: 'grid', gap: 4, padding: 10, background: '#fff', border: '1px solid #d1fae5', borderRadius: 10, minWidth: 0 },
  mono: { fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 12 },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 },
  primary: { border: 0, borderRadius: 10, padding: '10px 14px', background: '#111827', color: '#fff', fontWeight: 800, cursor: 'pointer' },
  secondary: { border: '1px solid #94a3b8', borderRadius: 10, padding: '10px 14px', background: '#fff', color: '#1f2937', fontWeight: 700, cursor: 'pointer' },
}
