import PDFDocument from 'pdfkit'

const text = (value) => String(value ?? '').trim()
const money = (value) => `$${Number(value || 0).toFixed(2)}`

function responseBody(value) {
  return value?.body || value || {}
}

function receiptSeal(response) {
  const body = responseBody(response)
  return text(body.selloRecibido || body.selloRecepcion || body.sello || '')
}

function safeLine(value, fallback = '—') {
  const normalized = text(value)
  return normalized || fallback
}

function itemTotal(item) {
  return Number(item?.ventaGravada || 0) + Number(item?.ventaExenta || 0) + Number(item?.ventaNoSuj || 0)
}

function ensureSpace(doc, needed = 80) {
  if (doc.y + needed <= doc.page.height - 54) return
  doc.addPage()
}

function keyValue(doc, key, value, { width = 500 } = {}) {
  doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(key, { width })
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(safeLine(value), { width })
  doc.moveDown(0.45)
}

export function dtePdfFilename(document) {
  return `${text(document?.control_number) || 'DTE'}-representacion-grafica.pdf`
}

export async function generateDtePdf(document, mhResponse = document?.mh_response) {
  const dte = document?.dte_payload || {}
  const identificacion = dte.identificacion || {}
  const emisor = dte.emisor || {}
  const receptor = dte.receptor || {}
  const resumen = dte.resumen || {}
  const mh = responseBody(mhResponse)
  const seal = receiptSeal(mhResponse)
  const items = Array.isArray(dte.cuerpoDocumento) ? dte.cuerpoDocumento : []
  const typeLabel = document?.dte_type === '03' ? 'COMPROBANTE DE CRÉDITO FISCAL DTE-03' : 'FACTURA DTE-01'

  return await new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ size: 'A4', margin: 46, info: { Title: dtePdfFilename(document), Author: 'IDEALO SV', Subject: 'Representación gráfica DTE' } })
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.rect(46, 44, 503, 56).fill('#15181c')
    doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(20).text('IDEALO SV', 60, 58)
    doc.fillColor('#ffffff').font('Helvetica').fontSize(10).text('Facturación electrónica', 60, 81)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(typeLabel, 300, 60, { width: 235, align: 'right' })
    doc.fillColor('#111827').moveDown(2.4)

    keyValue(doc, 'Número de control', document?.control_number)
    keyValue(doc, 'Código de generación', document?.generation_code)
    keyValue(doc, 'Fecha y hora de emisión', `${safeLine(identificacion.fecEmi, '')} ${safeLine(identificacion.horEmi, '')}`.trim())
    keyValue(doc, 'Ambiente', document?.environment === 'test' ? '00 · Pruebas' : '01 · Producción')

    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#f97316').text('EMISOR')
    doc.moveTo(46, doc.y + 3).lineTo(549, doc.y + 3).strokeColor('#cbd5e1').stroke()
    doc.moveDown(0.6)
    keyValue(doc, 'Nombre', emisor.nombre || emisor.nombreComercial)
    keyValue(doc, 'NIT / NRC', [emisor.nit, emisor.nrc].filter(Boolean).join(' / '))
    keyValue(doc, 'Actividad', emisor.descActividad)
    keyValue(doc, 'Dirección', emisor.direccion?.complemento)

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#f97316').text('RECEPTOR')
    doc.moveTo(46, doc.y + 3).lineTo(549, doc.y + 3).strokeColor('#cbd5e1').stroke()
    doc.moveDown(0.6)
    keyValue(doc, 'Nombre', receptor.nombre || 'Consumidor final')
    keyValue(doc, 'Documento / NRC', [receptor.numDocumento || receptor.nit, receptor.nrc].filter(Boolean).join(' / '))
    keyValue(doc, 'Dirección', receptor.direccion?.complemento)
    keyValue(doc, 'Correo', receptor.correo)

    ensureSpace(doc, 120)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#f97316').text('DETALLE')
    doc.moveDown(0.45)
    const columns = { item: 46, description: 76, qty: 330, price: 390, total: 465 }
    doc.rect(46, doc.y, 503, 20).fill('#f1f5f9')
    const headerY = doc.y + 6
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
    doc.text('#', columns.item, headerY, { width: 24 })
    doc.text('Descripción', columns.description, headerY, { width: 240 })
    doc.text('Cant.', columns.qty, headerY, { width: 48, align: 'right' })
    doc.text('Precio', columns.price, headerY, { width: 62, align: 'right' })
    doc.text('Total', columns.total, headerY, { width: 78, align: 'right' })
    doc.y += 25

    for (const item of items) {
      ensureSpace(doc, 42)
      const rowY = doc.y
      const description = safeLine(item.descripcion, '')
      const estimatedHeight = Math.max(18, doc.heightOfString(description, { width: 240, fontSize: 8 }) + 8)
      doc.font('Helvetica').fontSize(8).fillColor('#111827')
      doc.text(safeLine(item.numItem, ''), columns.item, rowY, { width: 24 })
      doc.text(description, columns.description, rowY, { width: 240 })
      doc.text(safeLine(item.cantidad, ''), columns.qty, rowY, { width: 48, align: 'right' })
      doc.text(money(item.precioUni), columns.price, rowY, { width: 62, align: 'right' })
      doc.text(money(itemTotal(item)), columns.total, rowY, { width: 78, align: 'right' })
      doc.moveTo(46, rowY + estimatedHeight).lineTo(549, rowY + estimatedHeight).strokeColor('#e2e8f0').stroke()
      doc.y = rowY + estimatedHeight + 5
    }

    ensureSpace(doc, 150)
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#f97316').text('TOTALES', { align: 'right' })
    const taxTotal = Array.isArray(resumen.tributos) ? resumen.tributos.reduce((sum, tax) => sum + Number(tax?.valor || 0), 0) : 0
    const totals = [
      ['Ventas gravadas', money(resumen.totalGravada)],
      ['Ventas exentas', money(resumen.totalExenta)],
      ['Ventas no sujetas', money(resumen.totalNoSuj)],
      [document?.dte_type === '03' ? 'IVA 13%' : 'IVA incluido fiscal', money(document?.dte_type === '03' ? taxTotal : resumen.totalIva)],
      ['TOTAL A PAGAR', money(resumen.totalPagar ?? resumen.montoTotalOperacion)],
    ]
    for (const [label, value] of totals) {
      doc.font(label === 'TOTAL A PAGAR' ? 'Helvetica-Bold' : 'Helvetica').fontSize(label === 'TOTAL A PAGAR' ? 11 : 9).fillColor('#111827')
      doc.text(`${label}: ${value}`, 330, doc.y, { width: 219, align: 'right' })
      doc.moveDown(0.25)
    }
    if (resumen.totalLetras) {
      doc.moveDown(0.2).font('Helvetica').fontSize(8).fillColor('#475569').text(`Total en letras: ${resumen.totalLetras}`, 250, doc.y, { width: 299, align: 'right' })
    }

    ensureSpace(doc, 150)
    doc.moveDown(1)
    doc.roundedRect(46, doc.y, 503, 116, 7).fillAndStroke('#f8fafc', '#94a3b8')
    const mhY = doc.y + 10
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('MINISTERIO DE HACIENDA', 58, mhY)
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Estado: ${safeLine(mh.estado || document?.status)}`, 58, mhY + 20, { width: 475 })
    doc.text(`Código / mensaje: ${safeLine(mh.codigoMsg)} · ${safeLine(mh.descripcionMsg || mh.mensaje)}`, 58, mhY + 36, { width: 475 })
    doc.text(`Fecha procesamiento: ${safeLine(mh.fhProcesamiento)}`, 58, mhY + 52, { width: 475 })
    doc.font('Helvetica-Bold').text('Sello de recepción:', 58, mhY + 69)
    doc.font('Courier').fontSize(7).text(safeLine(seal), 58, mhY + 82, { width: 475 })
    doc.y = mhY + 120

    doc.moveDown(0.7).font('Helvetica').fontSize(7).fillColor('#64748b').text(
      'Representación gráfica generada por IDEALO SV a partir del DTE almacenado y la respuesta de Hacienda. Conserve también los archivos electrónicos adjuntos.',
      { align: 'center' },
    )

    doc.end()
  })
}
