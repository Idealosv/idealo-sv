import PDFDocument from 'pdfkit'

const text = (v) => String(v ?? '').trim()
const safe = (v, f = '—') => text(v) || f
const money = (v) => `$${Number(v || 0).toFixed(2)}`
const responseBody = (v) => v?.body || v || {}
const receiptSeal = (r) => { const b = responseBody(r); return text(b.selloRecibido || b.selloRecepcion || b.sello || '') }
const itemTotal = (i) => Number(i?.ventaGravada || 0) + Number(i?.ventaExenta || 0) + Number(i?.ventaNoSuj || 0)

export function dtePdfFilename(document) { return `${text(document?.control_number) || 'DTE'}-representacion-grafica.pdf` }

function header(doc, type) {
  doc.rect(38, 30, 519, 44).fill('#17191d')
  doc.fillColor('#f97316').font('Helvetica-Bold').fontSize(18).text('IDEALO SV', 51, 41)
  doc.fillColor('#d1d5db').font('Helvetica').fontSize(7).text('DOCUMENTO TRIBUTARIO ELECTRÓNICO', 51, 61)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(type, 290, 45, { width: 252, align: 'right' })
}
function title(doc, label, y) {
  doc.fillColor('#ea580c').font('Helvetica-Bold').fontSize(8).text(label, 38, y)
  doc.moveTo(38, y + 11).lineTo(557, y + 11).strokeColor('#d1d5db').stroke()
  return y + 16
}
function field(doc, label, value, x, y, w) {
  doc.fillColor('#6b7280').font('Helvetica').fontSize(6.2).text(label.toUpperCase(), x, y, { width: w })
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7.6).text(safe(value), x, y + 8, { width: w, height: 20, ellipsis: true })
}
function detailHeader(doc, y) {
  doc.rect(38, y, 519, 19).fill('#25282d')
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6.5)
  doc.text('#', 43, y + 6, { width: 16 }); doc.text('DESCRIPCIÓN', 62, y + 6, { width: 292 })
  doc.text('CANT.', 356, y + 6, { width: 44, align: 'right' }); doc.text('PRECIO', 405, y + 6, { width: 64, align: 'right' }); doc.text('TOTAL', 475, y + 6, { width: 75, align: 'right' })
  return y + 25
}

export async function generateDtePdf(document, mhResponse = document?.mh_response) {
  const dte = document?.dte_payload || {}, id = dte.identificacion || {}, emisor = dte.emisor || {}, receptor = dte.receptor || {}, resumen = dte.resumen || {}
  const mh = responseBody(mhResponse), seal = receiptSeal(mhResponse), items = Array.isArray(dte.cuerpoDocumento) ? dte.cuerpoDocumento : []
  const isCcf = document?.dte_type === '03', type = isCcf ? 'COMPROBANTE DE CRÉDITO FISCAL · DTE-03' : 'FACTURA · DTE-01'
  return await new Promise((resolve, reject) => {
    const chunks = [], doc = new PDFDocument({ size: 'A4', margin: 38, bufferPages: true, info: { Title: dtePdfFilename(document), Author: 'IDEALO SV', Subject: 'Representación gráfica DTE' } })
    doc.on('data', c => chunks.push(c)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)))
    header(doc, type)
    let y = 86
    doc.roundedRect(38, y, 519, 54, 4).fillAndStroke('#f8fafc', '#d1d5db')
    field(doc, 'Número de control', document?.control_number, 49, y + 8, 240); field(doc, 'Código de generación', document?.generation_code, 303, y + 8, 242)
    field(doc, 'Fecha / hora', `${safe(id.fecEmi, '')} ${safe(id.horEmi, '')}`.trim(), 49, y + 31, 240); field(doc, 'Ambiente', document?.environment === 'test' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN', 303, y + 31, 242)

    y = title(doc, 'EMISOR', 151)
    field(doc, 'Nombre', emisor.nombre || emisor.nombreComercial, 38, y, 250); field(doc, 'NIT / NRC', [emisor.nit, emisor.nrc].filter(Boolean).join(' / '), 306, y, 251)
    field(doc, 'Actividad económica', emisor.descActividad, 38, y + 27, 250); field(doc, 'Dirección', emisor.direccion?.complemento, 306, y + 27, 251)
    y = title(doc, 'RECEPTOR', y + 55)
    field(doc, 'Nombre', receptor.nombre || 'Consumidor final', 38, y, 250); field(doc, 'Documento / NRC', [receptor.numDocumento || receptor.nit, receptor.nrc].filter(Boolean).join(' / '), 306, y, 251)
    field(doc, 'Correo', receptor.correo, 38, y + 27, 250); field(doc, 'Dirección', receptor.direccion?.complemento, 306, y + 27, 251)

    y = title(doc, 'DETALLE', y + 58); y = detailHeader(doc, y)
    for (const item of items) {
      const desc = safe(item.descripcion, ''), h = Math.max(18, Math.min(34, doc.heightOfString(desc, { width: 286 }) + 6))
      if (y + h > 585) { doc.addPage(); header(doc, type); y = detailHeader(doc, 92) }
      doc.fillColor('#111827').font('Helvetica').fontSize(7.2)
      doc.text(safe(item.numItem, ''), 43, y, { width: 16 }); doc.text(desc, 62, y, { width: 286, height: h - 2, ellipsis: true })
      doc.text(safe(item.cantidad, ''), 356, y, { width: 44, align: 'right' }); doc.text(money(item.precioUni), 405, y, { width: 64, align: 'right' }); doc.text(money(itemTotal(item)), 475, y, { width: 75, align: 'right' })
      doc.moveTo(38, y + h).lineTo(557, y + h).strokeColor('#e5e7eb').stroke(); y += h + 3
    }
    const taxTotal = Array.isArray(resumen.tributos) ? resumen.tributos.reduce((s, t) => s + Number(t?.valor || 0), 0) : 0
    if (y > 610) { doc.addPage(); header(doc, type); y = 94 }
    y += 5
    if (resumen.totalLetras) doc.fillColor('#4b5563').font('Helvetica').fontSize(6.7).text(`SON: ${resumen.totalLetras}`, 38, y + 7, { width: 285 })
    doc.roundedRect(340, y, 217, 82, 4).fillAndStroke('#f8fafc', '#d1d5db')
    doc.fillColor('#ea580c').font('Helvetica-Bold').fontSize(8).text('RESUMEN', 351, y + 8, { width: 194, align: 'right' })
    const totals = [['Ventas gravadas', money(resumen.totalGravada)], ['Ventas exentas', money(resumen.totalExenta)], ['Ventas no sujetas', money(resumen.totalNoSuj)], [isCcf ? 'IVA 13%' : 'IVA incluido', money(isCcf ? taxTotal : resumen.totalIva)]]
    let ty = y + 23
    for (const [l, v] of totals) { doc.fillColor('#374151').font('Helvetica').fontSize(6.8).text(l, 351, ty, { width: 105 }); doc.font('Helvetica-Bold').text(v, 460, ty, { width: 85, align: 'right' }); ty += 10 }
    doc.moveTo(351, ty).lineTo(545, ty).strokeColor('#9ca3af').stroke(); ty += 5
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text('TOTAL A PAGAR', 351, ty, { width: 110 }); doc.fillColor('#ea580c').text(money(resumen.totalPagar ?? resumen.montoTotalOperacion), 460, ty, { width: 85, align: 'right' })

    y += 92
    doc.roundedRect(38, y, 519, 62, 4).fillAndStroke('#fff7ed', '#fdba74')
    doc.fillColor('#c2410c').font('Helvetica-Bold').fontSize(7.5).text('VALIDACIÓN MINISTERIO DE HACIENDA', 49, y + 8)
    doc.fillColor('#374151').font('Helvetica').fontSize(6.4).text(`Estado: ${safe(mh.estado || document?.status)}   ·   Código: ${safe(mh.codigoMsg)}   ·   Mensaje: ${safe(mh.descripcionMsg || mh.mensaje)}`, 49, y + 22, { width: 496, height: 17, ellipsis: true })
    doc.font('Helvetica-Bold').text('Sello:', 49, y + 43); doc.font('Courier').fontSize(5.6).text(safe(seal), 78, y + 43, { width: 465, height: 11, ellipsis: true })

    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.fillColor('#6b7280').font('Helvetica').fontSize(6).text('Representación gráfica DTE · IDEALO SV', 38, 810, { width: 350 }); doc.text(`Página ${i + 1} de ${pages.count}`, 455, 810, { width: 102, align: 'right' }) }
    doc.end()
  })
}
