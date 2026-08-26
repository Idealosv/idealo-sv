import PDFDocument from 'pdfkit'

const text = (value) => String(value ?? '').trim()
const money = (value) => `$${Number(value || 0).toFixed(2)}`
const safe = (value, fallback = '—') => text(value) || fallback
const responseBody = (value) => value?.body || value || {}
const receiptSeal = (response) => { const b = responseBody(response); return text(b.selloRecibido || b.selloRecepcion || b.sello || '') }
const itemTotal = (item) => Number(item?.ventaGravada || 0) + Number(item?.ventaExenta || 0) + Number(item?.ventaNoSuj || 0)

export function dtePdfFilename(document) {
  return `${text(document?.control_number) || 'DTE'}-representacion-grafica.pdf`
}

function sectionTitle(doc, label, y) {
  doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(9).text(label, 46, y)
  doc.moveTo(46, y + 14).lineTo(549, y + 14).strokeColor('#d1d5db').stroke()
  return y + 22
}

function field(doc, label, value, x, y, width) {
  doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text(label.toUpperCase(), x, y, { width })
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.5).text(safe(value), x, y + 10, { width })
}

function addPageHeader(doc, typeLabel) {
  doc.rect(46, 36, 503, 52).fill('#17191d')
  doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(19).text('IDEALO SV', 60, 49)
  doc.fillColor('#ffffff').font('Helvetica').fontSize(8.5).text('DOCUMENTO TRIBUTARIO ELECTRÓNICO', 60, 71)
  doc.font('Helvetica-Bold').fontSize(9).text(typeLabel, 300, 52, { width: 235, align: 'right' })
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
  const typeLabel = isCcf ? 'COMPROBANTE DE CRÉDITO FISCAL · DTE-03' : 'FACTURA · DTE-01'

  return await new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ size: 'A4', margin: 46, bufferPages: true, info: { Title: dtePdfFilename(document), Author: 'IDEALO SV', Subject: 'Representación gráfica DTE' } })
    doc.on('data', (c) => chunks.push(c)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)))
    addPageHeader(doc, typeLabel)

    let y = 103
    doc.roundedRect(46, y, 503, 70, 5).fillAndStroke('#f8fafc', '#d1d5db')
    field(doc, 'Número de control', document?.control_number, 58, y + 10, 235)
    field(doc, 'Código de generación', document?.generation_code, 305, y + 10, 232)
    field(doc, 'Fecha y hora de emisión', `${safe(id.fecEmi, '')} ${safe(id.horEmi, '')}`.trim(), 58, y + 40, 235)
    field(doc, 'Ambiente', document?.environment === 'test' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN', 305, y + 40, 232)

    y = sectionTitle(doc, 'EMISOR', 190)
    const emitterAddress = emisor.direccion?.complemento
    field(doc, 'Nombre', emisor.nombre || emisor.nombreComercial, 46, y, 245)
    field(doc, 'NIT / NRC', [emisor.nit, emisor.nrc].filter(Boolean).join(' / '), 304, y, 245)
    field(doc, 'Actividad económica', emisor.descActividad, 46, y + 32, 245)
    field(doc, 'Dirección', emitterAddress, 304, y + 32, 245)

    y = sectionTitle(doc, 'RECEPTOR', y + 70)
    field(doc, 'Nombre', receptor.nombre || 'Consumidor final', 46, y, 245)
    field(doc, 'Documento / NRC', [receptor.numDocumento || receptor.nit, receptor.nrc].filter(Boolean).join(' / '), 304, y, 245)
    field(doc, 'Correo', receptor.correo, 46, y + 32, 245)
    field(doc, 'Dirección', receptor.direccion?.complemento, 304, y + 32, 245)

    y = sectionTitle(doc, 'DETALLE DEL DOCUMENTO', y + 75)
    const col = { n: 46, desc: 70, qty: 348, price: 402, total: 476 }
    doc.rect(46, y, 503, 22).fill('#25282d')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
    doc.text('#', col.n + 5, y + 7, { width: 18 }); doc.text('DESCRIPCIÓN', col.desc, y + 7, { width: 265 }); doc.text('CANT.', col.qty, y + 7, { width: 42, align: 'right' }); doc.text('PRECIO', col.price, y + 7, { width: 60, align: 'right' }); doc.text('TOTAL', col.total, y + 7, { width: 68, align: 'right' })
    y += 29
    for (const item of items) {
      const desc = safe(item.descripcion, '')
      const h = Math.max(22, doc.heightOfString(desc, { width: 265 }) + 9)
      if (y + h > 690) { doc.addPage(); addPageHeader(doc, typeLabel); y = 105 }
      doc.fillColor('#111827').font('Helvetica').fontSize(8)
      doc.text(safe(item.numItem, ''), col.n + 5, y, { width: 18 }); doc.text(desc, col.desc, y, { width: 265 }); doc.text(safe(item.cantidad, ''), col.qty, y, { width: 42, align: 'right' }); doc.text(money(item.precioUni), col.price, y, { width: 60, align: 'right' }); doc.text(money(itemTotal(item)), col.total, y, { width: 68, align: 'right' })
      doc.moveTo(46, y + h).lineTo(549, y + h).strokeColor('#e5e7eb').stroke(); y += h + 5
    }

    const taxTotal = Array.isArray(resumen.tributos) ? resumen.tributos.reduce((s, t) => s + Number(t?.valor || 0), 0) : 0
    if (y > 570) { doc.addPage(); addPageHeader(doc, typeLabel); y = 110 }
    y += 8
    doc.roundedRect(330, y, 219, 100, 5).fillAndStroke('#f8fafc', '#d1d5db')
    doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(9).text('RESUMEN', 342, y + 10, { width: 195, align: 'right' })
    const totals = [['Ventas gravadas', money(resumen.totalGravada)], ['Ventas exentas', money(resumen.totalExenta)], ['Ventas no sujetas', money(resumen.totalNoSuj)], [isCcf ? 'IVA 13%' : 'IVA incluido', money(isCcf ? taxTotal : resumen.totalIva)]]
    let ty = y + 28
    for (const [label, value] of totals) { doc.fillColor('#374151').font('Helvetica').fontSize(8).text(label, 342, ty, { width: 105 }); doc.font('Helvetica-Bold').text(value, 450, ty, { width: 87, align: 'right' }); ty += 14 }
    doc.moveTo(342, ty).lineTo(537, ty).strokeColor('#9ca3af').stroke(); ty += 7
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('TOTAL A PAGAR', 342, ty, { width: 105 }); doc.fillColor('#f97316').text(money(resumen.totalPagar ?? resumen.montoTotalOperacion), 450, ty, { width: 87, align: 'right' })
    if (resumen.totalLetras) doc.fillColor('#4b5563').font('Helvetica').fontSize(7.5).text(`SON: ${resumen.totalLetras}`, 46, y + 12, { width: 265 })

    y += 116
    doc.roundedRect(46, y, 503, 82, 5).fillAndStroke('#fff7ed', '#fdba74')
    doc.fillColor('#c2410c').font('Helvetica-Bold').fontSize(9).text('VALIDACIÓN MINISTERIO DE HACIENDA', 58, y + 10)
    doc.fillColor('#374151').font('Helvetica').fontSize(7.5).text(`Estado: ${safe(mh.estado || document?.status)}   ·   Código: ${safe(mh.codigoMsg)}`, 58, y + 27, { width: 475 })
    doc.text(`Mensaje: ${safe(mh.descripcionMsg || mh.mensaje)}`, 58, y + 41, { width: 475 })
    doc.font('Helvetica-Bold').text('Sello de recepción', 58, y + 56); doc.font('Courier').fontSize(6.5).text(safe(seal), 150, y + 56, { width: 385 })

    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)
      doc.fillColor('#6b7280').font('Helvetica').fontSize(6.5).text('Representación gráfica del Documento Tributario Electrónico · IDEALO SV', 46, 808, { width: 400 })
      doc.text(`Página ${i + 1} de ${pages.count}`, 450, 808, { width: 99, align: 'right' })
    }
    doc.end()
  })
}
