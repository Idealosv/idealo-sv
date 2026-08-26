import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

const text = (v) => String(v ?? '').trim()
const safe = (v, f = '—') => text(v) || f
const money = (v) => `$${Number(v || 0).toFixed(2)}`
const responseBody = (v) => v?.body || v || {}
const receiptSeal = (r) => { const b = responseBody(r); return text(b.selloRecibido || b.selloRecepcion || b.sello || '') }
const itemTotal = (i) => Number(i?.ventaGravada || 0) + Number(i?.ventaExenta || 0) + Number(i?.ventaNoSuj || 0)

export function dtePdfFilename(document) { return `${text(document?.control_number) || 'DTE'}-representacion-grafica.pdf` }

function qrTarget(document) {
  const ambiente = document?.environment === 'test' ? '00' : '01'
  return `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${encodeURIComponent(text(document?.generation_code))}`
}

function drawBrandHeader(doc, { businessName, legalName, typeLabel, qrBuffer, continuation = false }) {
  doc.rect(36, 28, 523, continuation ? 48 : 88).fill('#17191d')
  doc.rect(36, 28, 5, continuation ? 48 : 88).fill('#f97316')
  doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(continuation ? 15 : 20).text(businessName, 53, continuation ? 40 : 42, { width: continuation ? 255 : 300 })
  if (!continuation) {
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(legalName, 53, 68, { width: 300 })
    doc.fillColor('#d1d5db').font('Helvetica').fontSize(6.7).text('DOCUMENTO TRIBUTARIO ELECTRÓNICO · EL SALVADOR', 53, 84, { width: 300 })
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9.5).text(typeLabel, 355, 42, { width: 110, align: 'right' })
    doc.image(qrBuffer, 476, 37, { fit: [72, 72] })
    doc.fillColor('#d1d5db').font('Helvetica').fontSize(5.3).text('Validar en MH', 476, 106, { width: 72, align: 'center' })
  } else {
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(`${typeLabel} · CONTINUACIÓN`, 300, 43, { width: 245, align: 'right' })
  }
}

function sectionTitle(doc, label, y) {
  doc.fillColor('#ea580c').font('Helvetica-Bold').fontSize(7.8).text(label, 36, y)
  doc.moveTo(36, y + 11).lineTo(559, y + 11).strokeColor('#d1d5db').stroke()
  return y + 16
}

function field(doc, label, value, x, y, width, { maxHeight = 22 } = {}) {
  doc.fillColor('#6b7280').font('Helvetica').fontSize(5.9).text(label.toUpperCase(), x, y, { width })
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7.2).text(safe(value), x, y + 7, { width, height: maxHeight, ellipsis: true })
}

function detailHeader(doc, y) {
  doc.rect(36, y, 523, 18).fill('#25282d')
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.2)
  doc.text('#', 41, y + 6, { width: 17 })
  doc.text('DESCRIPCIÓN', 61, y + 6, { width: 294 })
  doc.text('CANT.', 357, y + 6, { width: 44, align: 'right' })
  doc.text('PRECIO', 408, y + 6, { width: 62, align: 'right' })
  doc.text('TOTAL', 477, y + 6, { width: 75, align: 'right' })
  return y + 24
}

function pageFooter(doc, pageNumber, pageCount, businessName) {
  const y = 817
  doc.moveTo(36, y - 6).lineTo(559, y - 6).strokeColor('#e5e7eb').stroke()
  doc.fillColor('#6b7280').font('Helvetica').fontSize(5.8).text(`${businessName} · Representación gráfica DTE`, 36, y, { width: 360, lineBreak: false })
  doc.text(`Página ${pageNumber} de ${pageCount}`, 455, y, { width: 104, align: 'right', lineBreak: false })
}

export async function generateDtePdf(document, mhResponse = document?.mh_response) {
  const dte = document?.dte_payload || {}
  const id = dte.identificacion || {}
  const emisor = dte.emisor || {}
  const receptor = dte.receptor || {}
  const resumen = dte.resumen || {}
  const mh = responseBody(mhResponse)
  const seal = receiptSeal(mhResponse)
  const items = Array.isArray(dte.cuerpoDocumento) ? dte.cuerpoDocumento : []
  const isCcf = document?.dte_type === '03'
  const typeLabel = isCcf ? 'CRÉDITO FISCAL · DTE-03' : 'FACTURA · DTE-01'
  const businessName = safe(emisor.nombreComercial || 'IDEALO SV')
  const legalName = safe(emisor.nombre || emisor.nombreComercial || 'IDEALO SV')
  const queryUrl = qrTarget(document)
  const qrBuffer = await QRCode.toBuffer(queryUrl, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'M' })

  return await new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 28, bottom: 12, left: 36, right: 36 },
      bufferPages: true,
      info: { Title: dtePdfFilename(document), Author: businessName, Subject: 'Representación gráfica DTE' },
    })
    doc.on('data', (c) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawBrandHeader(doc, { businessName, legalName, typeLabel, qrBuffer })
    let y = 128

    doc.roundedRect(36, y, 523, 54, 4).fillAndStroke('#f8fafc', '#d1d5db')
    field(doc, 'Número de control', document?.control_number, 48, y + 8, 244)
    field(doc, 'Código de generación', document?.generation_code, 307, y + 8, 240)
    field(doc, 'Fecha y hora de emisión', `${safe(id.fecEmi, '')} ${safe(id.horEmi, '')}`.trim(), 48, y + 31, 244)
    field(doc, 'Ambiente', document?.environment === 'test' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN', 307, y + 31, 240)

    y = sectionTitle(doc, 'EMISOR', 193)
    field(doc, 'Nombre / razón social', legalName, 36, y, 252)
    field(doc, 'NIT / NRC', [emisor.nit, emisor.nrc].filter(Boolean).join(' / '), 307, y, 252)
    field(doc, 'Actividad económica', emisor.descActividad, 36, y + 25, 252)
    field(doc, 'Dirección', emisor.direccion?.complemento, 307, y + 25, 252, { maxHeight: 20 })
    field(doc, 'Correo', emisor.correo, 36, y + 50, 252)
    field(doc, 'Teléfono', emisor.telefono, 307, y + 50, 252)

    y = sectionTitle(doc, 'RECEPTOR', y + 76)
    field(doc, 'Nombre / razón social', receptor.nombre || 'Consumidor final', 36, y, 252)
    field(doc, 'Documento / NRC', [receptor.numDocumento || receptor.nit, receptor.nrc].filter(Boolean).join(' / '), 307, y, 252)
    field(doc, 'Correo', receptor.correo, 36, y + 25, 252)
    field(doc, 'Dirección', receptor.direccion?.complemento, 307, y + 25, 252, { maxHeight: 30 })

    y = sectionTitle(doc, 'DETALLE DEL DOCUMENTO', y + 58)
    y = detailHeader(doc, y)

    for (const item of items) {
      const description = safe(item.descripcion, '')
      const rowHeight = Math.max(17, Math.min(30, doc.heightOfString(description, { width: 290 }) + 5))
      if (y + rowHeight > 585) {
        doc.addPage({ margins: { top: 28, bottom: 12, left: 36, right: 36 } })
        drawBrandHeader(doc, { businessName, legalName, typeLabel, qrBuffer, continuation: true })
        y = detailHeader(doc, 92)
      }
      doc.fillColor('#111827').font('Helvetica').fontSize(7)
      doc.text(safe(item.numItem, ''), 41, y, { width: 17 })
      doc.text(description, 61, y, { width: 290, height: rowHeight - 2, ellipsis: true })
      doc.text(safe(item.cantidad, ''), 357, y, { width: 44, align: 'right' })
      doc.text(money(item.precioUni), 408, y, { width: 62, align: 'right' })
      doc.text(money(itemTotal(item)), 477, y, { width: 75, align: 'right' })
      doc.moveTo(36, y + rowHeight).lineTo(559, y + rowHeight).strokeColor('#e5e7eb').stroke()
      y += rowHeight + 3
    }

    const taxTotal = Array.isArray(resumen.tributos) ? resumen.tributos.reduce((sum, tax) => sum + Number(tax?.valor || 0), 0) : 0
    if (y > 605) {
      doc.addPage({ margins: { top: 28, bottom: 12, left: 36, right: 36 } })
      drawBrandHeader(doc, { businessName, legalName, typeLabel, qrBuffer, continuation: true })
      y = 94
    }

    y += 6
    if (resumen.totalLetras) {
      doc.fillColor('#4b5563').font('Helvetica').fontSize(6.5).text(`SON: ${resumen.totalLetras}`, 36, y + 8, { width: 292, height: 34, ellipsis: true })
    }
    doc.roundedRect(342, y, 217, 80, 4).fillAndStroke('#f8fafc', '#d1d5db')
    doc.fillColor('#ea580c').font('Helvetica-Bold').fontSize(7.8).text('RESUMEN', 353, y + 8, { width: 194, align: 'right' })
    const totals = [
      ['Ventas gravadas', money(resumen.totalGravada)],
      ['Ventas exentas', money(resumen.totalExenta)],
      ['Ventas no sujetas', money(resumen.totalNoSuj)],
      [isCcf ? 'IVA 13%' : 'IVA incluido', money(isCcf ? taxTotal : resumen.totalIva)],
    ]
    let totalY = y + 22
    for (const [label, value] of totals) {
      doc.fillColor('#374151').font('Helvetica').fontSize(6.6).text(label, 353, totalY, { width: 105 })
      doc.font('Helvetica-Bold').text(value, 462, totalY, { width: 85, align: 'right' })
      totalY += 10
    }
    doc.moveTo(353, totalY).lineTo(547, totalY).strokeColor('#9ca3af').stroke()
    totalY += 5
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.8).text('TOTAL A PAGAR', 353, totalY, { width: 112 })
    doc.fillColor('#ea580c').text(money(resumen.totalPagar ?? resumen.montoTotalOperacion), 462, totalY, { width: 85, align: 'right' })

    y += 90
    doc.roundedRect(36, y, 523, 66, 4).fillAndStroke('#fff7ed', '#fdba74')
    doc.fillColor('#c2410c').font('Helvetica-Bold').fontSize(7.3).text('VALIDACIÓN MINISTERIO DE HACIENDA', 48, y + 8)
    doc.fillColor('#374151').font('Helvetica').fontSize(6.2).text(`Estado: ${safe(mh.estado || document?.status)}   ·   Código: ${safe(mh.codigoMsg)}   ·   Mensaje: ${safe(mh.descripcionMsg || mh.mensaje)}`, 48, y + 22, { width: 497, height: 16, ellipsis: true })
    doc.font('Helvetica-Bold').text('Sello de recepción:', 48, y + 43)
    doc.font('Courier').fontSize(5.4).text(safe(seal), 118, y + 43, { width: 427, height: 12, ellipsis: true })
    doc.fillColor('#6b7280').font('Helvetica').fontSize(5.5).text('QR superior: consulta oficial del DTE en el Ministerio de Hacienda.', 48, y + 56, { width: 497 })

    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i)
      pageFooter(doc, i + 1, range.count, businessName)
    }
    doc.end()
  })
}
