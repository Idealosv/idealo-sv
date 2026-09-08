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

function pill(doc, label, x, y, width) {
  doc.roundedRect(x, y, width, 22, 11).fill('#2b2e33')
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.2).text(label, x + 8, y + 8, { width: width - 16, align: 'center', lineBreak: false })
}

function drawPremiumHeader(doc, { businessName, legalName, typeLabel, qrBuffer, continuation = false }) {
  if (continuation) {
    doc.rect(34, 26, 527, 54).fill('#15171a')
    doc.rect(34, 26, 5, 54).fill('#f97316')
    doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(16).text(businessName, 50, 40, { width: 285, lineBreak: false })
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(`${typeLabel} · CONTINUACIÓN`, 335, 43, { width: 210, align: 'right', lineBreak: false })
    return
  }

  doc.rect(34, 26, 527, 104).fill('#15171a')
  doc.rect(34, 26, 5, 104).fill('#f97316')
  doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(22).text(businessName, 52, 43, { width: 285, lineBreak: false })
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.2).text(legalName, 52, 72, { width: 285, lineBreak: false })
  doc.fillColor('#aeb4bd').font('Helvetica').fontSize(6.2).text('DOCUMENTO TRIBUTARIO ELECTRÓNICO · EL SALVADOR', 52, 88, { width: 285, lineBreak: false })
  doc.fillColor('#727982').fontSize(5.5).text('Representación gráfica para consulta y entrega al cliente', 52, 101, { width: 285, lineBreak: false })

  pill(doc, typeLabel, 334, 43, 128)
  doc.roundedRect(474, 36, 76, 76, 5).fill('#ffffff')
  doc.image(qrBuffer, 480, 42, { fit: [64, 64] })
  doc.fillColor('#d1d5db').font('Helvetica').fontSize(5.2).text('VERIFICAR EN MH', 474, 116, { width: 76, align: 'center', lineBreak: false })
}

function miniMetric(doc, label, value, x, y, width) {
  doc.fillColor('#7a8089').font('Helvetica-Bold').fontSize(5.5).text(label.toUpperCase(), x, y, { width, lineBreak: false })
  doc.fillColor('#17191d').font('Helvetica-Bold').fontSize(7.1).text(safe(value), x, y + 10, { width, height: 16, ellipsis: true })
}

function partyCard(doc, title, data, x, y, width) {
  const h = 94
  doc.roundedRect(x, y, width, h, 5).fillAndStroke('#fafbfc', '#d9dde3')
  doc.rect(x, y, 4, h).fill('#f97316')
  doc.fillColor('#ea580c').font('Helvetica-Bold').fontSize(7).text(title, x + 13, y + 10, { width: width - 24, lineBreak: false })
  doc.fillColor('#1c1f23').font('Helvetica-Bold').fontSize(8).text(safe(data.name), x + 13, y + 27, { width: width - 24, height: 20, ellipsis: true })
  doc.fillColor('#747b84').font('Helvetica').fontSize(5.5).text(data.idLabel, x + 13, y + 51, { width: 76, lineBreak: false })
  doc.fillColor('#22262b').font('Helvetica-Bold').fontSize(6.6).text(safe(data.id), x + 90, y + 51, { width: width - 103, height: 12, ellipsis: true })
  doc.fillColor('#747b84').font('Helvetica').fontSize(5.5).text('CORREO', x + 13, y + 66, { width: 76, lineBreak: false })
  doc.fillColor('#22262b').font('Helvetica-Bold').fontSize(6.2).text(safe(data.email), x + 90, y + 66, { width: width - 103, height: 12, ellipsis: true })
  doc.fillColor('#747b84').font('Helvetica').fontSize(5.5).text('DIRECCIÓN', x + 13, y + 81, { width: 76, lineBreak: false })
  doc.fillColor('#22262b').font('Helvetica-Bold').fontSize(5.8).text(safe(data.address), x + 90, y + 81, { width: width - 103, height: 10, ellipsis: true })
  return h
}

function detailHeader(doc, y) {
  doc.roundedRect(34, y, 527, 20, 3).fill('#22252a')
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.2)
  doc.text('#', 42, y + 7, { width: 18, lineBreak: false })
  doc.text('DESCRIPCIÓN', 64, y + 7, { width: 285, lineBreak: false })
  doc.text('CANT.', 357, y + 7, { width: 45, align: 'right', lineBreak: false })
  doc.text('PRECIO', 410, y + 7, { width: 62, align: 'right', lineBreak: false })
  doc.text('TOTAL', 480, y + 7, { width: 72, align: 'right', lineBreak: false })
  return y + 27
}

function pageFooter(doc, pageNumber, pageCount, businessName) {
  const y = 813
  doc.moveTo(34, y - 7).lineTo(561, y - 7).strokeColor('#e3e6ea').stroke()
  doc.fillColor('#8a9098').font('Helvetica').fontSize(5.5).text(`${businessName} · Documento Tributario Electrónico`, 34, y, { width: 350, lineBreak: false })
  doc.text(`Página ${pageNumber} de ${pageCount}`, 457, y, { width: 104, align: 'right', lineBreak: false })
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
  const qrBuffer = await QRCode.toBuffer(qrTarget(document), { type: 'png', width: 280, margin: 1, errorCorrectionLevel: 'M' })

  return await new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 26, bottom: 12, left: 34, right: 34 },
      bufferPages: true,
      info: { Title: dtePdfFilename(document), Author: businessName, Subject: 'Representación gráfica DTE' },
    })
    doc.on('data', (c) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    drawPremiumHeader(doc, { businessName, legalName, typeLabel, qrBuffer })
    let y = 143

    doc.roundedRect(34, y, 527, 52, 5).fillAndStroke('#f4f6f8', '#d9dde3')
    miniMetric(doc, 'Número de control', document?.control_number, 47, y + 9, 230)
    miniMetric(doc, 'Código de generación', document?.generation_code, 291, y + 9, 257)
    miniMetric(doc, 'Fecha / hora de emisión', `${safe(id.fecEmi, '')} ${safe(id.horEmi, '')}`.trim(), 47, y + 31, 230)
    miniMetric(doc, 'Ambiente', document?.environment === 'test' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN', 291, y + 31, 257)

    y = 208
    const cardGap = 11
    const cardWidth = (527 - cardGap) / 2
    partyCard(doc, 'EMISOR', {
      name: legalName,
      idLabel: 'NIT / NRC',
      id: [emisor.nit, emisor.nrc].filter(Boolean).join(' / '),
      email: emisor.correo,
      address: emisor.direccion?.complemento,
    }, 34, y, cardWidth)
    partyCard(doc, 'RECEPTOR', {
      name: receptor.nombre || 'Consumidor final',
      idLabel: 'DOC. / NRC',
      id: [receptor.numDocumento || receptor.nit, receptor.nrc].filter(Boolean).join(' / '),
      email: receptor.correo,
      address: receptor.direccion?.complemento,
    }, 34 + cardWidth + cardGap, y, cardWidth)

    y = 316
    doc.fillColor('#17191d').font('Helvetica-Bold').fontSize(8.2).text('DETALLE DEL DOCUMENTO', 34, y, { width: 300, lineBreak: false })
    doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(6).text(`${items.length} ${items.length === 1 ? 'ÍTEM' : 'ÍTEMS'}`, 470, y + 1, { width: 91, align: 'right', lineBreak: false })
    y = detailHeader(doc, y + 17)

    let rowIndex = 0
    for (const item of items) {
      const description = safe(item.descripcion, '')
      const rowHeight = Math.max(18, Math.min(31, doc.heightOfString(description, { width: 281 }) + 6))
      if (y + rowHeight > 575) {
        doc.addPage({ margins: { top: 26, bottom: 12, left: 34, right: 34 } })
        drawPremiumHeader(doc, { businessName, legalName, typeLabel, qrBuffer, continuation: true })
        y = detailHeader(doc, 96)
        rowIndex = 0
      }
      if (rowIndex % 2 === 1) doc.rect(34, y - 3, 527, rowHeight + 3).fill('#fafbfc')
      doc.fillColor('#202328').font('Helvetica').fontSize(7)
      doc.text(safe(item.numItem, ''), 42, y, { width: 18, lineBreak: false })
      doc.text(description, 64, y, { width: 281, height: rowHeight - 2, ellipsis: true })
      doc.text(safe(item.cantidad, ''), 357, y, { width: 45, align: 'right', lineBreak: false })
      doc.text(money(item.precioUni), 410, y, { width: 62, align: 'right', lineBreak: false })
      doc.font('Helvetica-Bold').text(money(itemTotal(item)), 480, y, { width: 72, align: 'right', lineBreak: false })
      doc.moveTo(34, y + rowHeight).lineTo(561, y + rowHeight).strokeColor('#e6e9ed').stroke()
      y += rowHeight + 3
      rowIndex += 1
    }

    const taxTotal = Array.isArray(resumen.tributos) ? resumen.tributos.reduce((sum, tax) => sum + Number(tax?.valor || 0), 0) : 0
    if (y > 598) {
      doc.addPage({ margins: { top: 26, bottom: 12, left: 34, right: 34 } })
      drawPremiumHeader(doc, { businessName, legalName, typeLabel, qrBuffer, continuation: true })
      y = 96
    }

    y += 7
    doc.roundedRect(34, y, 310, 82, 5).fillAndStroke('#fafbfc', '#e0e3e7')
    doc.fillColor('#8a9098').font('Helvetica-Bold').fontSize(5.7).text('TOTAL EN LETRAS', 47, y + 12, { width: 280, lineBreak: false })
    doc.fillColor('#282c31').font('Helvetica-Bold').fontSize(7.1).text(safe(resumen.totalLetras), 47, y + 27, { width: 280, height: 34, ellipsis: true })
    doc.fillColor('#8a9098').font('Helvetica').fontSize(5.5).text('Documento generado electrónicamente por IDEALO SV', 47, y + 65, { width: 280, lineBreak: false })

    doc.roundedRect(355, y, 206, 82, 5).fill('#17191d')
    doc.fillColor('#aeb4bd').font('Helvetica-Bold').fontSize(5.7).text('RESUMEN DE OPERACIÓN', 369, y + 11, { width: 178, align: 'right', lineBreak: false })
    const totals = [
      ['Ventas gravadas', money(resumen.totalGravada)],
      ['Ventas exentas', money(resumen.totalExenta)],
      ['Ventas no sujetas', money(resumen.totalNoSuj)],
      [isCcf ? 'IVA 13%' : 'IVA incluido', money(isCcf ? taxTotal : resumen.totalIva)],
    ]
    let totalY = y + 26
    for (const [label, value] of totals) {
      doc.fillColor('#c7cbd1').font('Helvetica').fontSize(5.9).text(label, 369, totalY, { width: 100, lineBreak: false })
      doc.fillColor('#ffffff').font('Helvetica-Bold').text(value, 472, totalY, { width: 75, align: 'right', lineBreak: false })
      totalY += 9
    }
    doc.moveTo(369, totalY + 1).lineTo(547, totalY + 1).strokeColor('#4b5057').stroke()
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text('TOTAL', 369, totalY + 8, { width: 90, lineBreak: false })
    doc.fillColor('#f97316').fontSize(11).text(money(resumen.totalPagar ?? resumen.montoTotalOperacion), 462, totalY + 6, { width: 85, align: 'right', lineBreak: false })

    y += 94
    doc.roundedRect(34, y, 527, 67, 5).fillAndStroke('#fffaf5', '#fdba74')
    doc.fillColor('#c2410c').font('Helvetica-Bold').fontSize(7).text('VALIDACIÓN MINISTERIO DE HACIENDA', 47, y + 10, { width: 270, lineBreak: false })
    doc.fillColor('#6f5a4d').font('Helvetica-Bold').fontSize(5.6).text('ESTADO', 47, y + 27, { width: 45, lineBreak: false })
    doc.fillColor('#25282d').font('Helvetica-Bold').fontSize(6.2).text(safe(mh.estado || document?.status), 94, y + 27, { width: 90, lineBreak: false })
    doc.fillColor('#6f5a4d').font('Helvetica-Bold').fontSize(5.6).text('CÓDIGO', 190, y + 27, { width: 45, lineBreak: false })
    doc.fillColor('#25282d').font('Helvetica-Bold').fontSize(6.2).text(safe(mh.codigoMsg), 237, y + 27, { width: 58, lineBreak: false })
    doc.fillColor('#6f5a4d').font('Helvetica-Bold').fontSize(5.6).text('MENSAJE', 302, y + 27, { width: 52, lineBreak: false })
    doc.fillColor('#25282d').font('Helvetica-Bold').fontSize(6.2).text(safe(mh.descripcionMsg || mh.mensaje), 356, y + 27, { width: 191, height: 12, ellipsis: true })
    doc.fillColor('#6f5a4d').font('Helvetica-Bold').fontSize(5.6).text('SELLO DE RECEPCIÓN', 47, y + 45, { width: 74, lineBreak: false })
    doc.fillColor('#555b63').font('Courier').fontSize(5.2).text(safe(seal), 125, y + 45, { width: 422, height: 10, ellipsis: true })
    doc.fillColor('#8b6f5f').font('Helvetica').fontSize(5.2).text('Escanee el QR del encabezado para consultar este DTE en el portal oficial del Ministerio de Hacienda.', 47, y + 58, { width: 500, lineBreak: false })

    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i)
      pageFooter(doc, i + 1, range.count, businessName)
    }
    doc.end()
  })
}
