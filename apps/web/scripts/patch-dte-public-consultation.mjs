import fs from 'node:fs'

const file = new URL('../src/ProcessedDtePanel.jsx', import.meta.url)
let source = fs.readFileSync(file, 'utf8')

if (!source.includes("import QRCode from 'qrcode'")) {
  source = source.replace("import { useEffect, useMemo, useState } from 'react'\n", "import { useEffect, useMemo, useState } from 'react'\nimport QRCode from 'qrcode'\n")
}

const start = source.indexOf('  const printRepresentation =')
const end = source.indexOf('  if (loading) return <div className="billing-documents-state">', start)
if (start === -1 || end === -1) throw new Error('No se encontró el bloque de impresión DTE para actualizar.')

async function professionalPrint(document) {
  const payload = document.dte_payload || {}
  const receptor = payload.receptor || {}
  const emisor = payload.emisor || {}
  const resumen = payload.resumen || {}
  const mhRaw = document.mh_response || {}
  const mh = mhRaw.body || mhRaw
  const items = Array.isArray(payload.cuerpoDocumento) ? payload.cuerpoDocumento : []
  const ambiente = document.environment === 'production' ? '01' : '00'
  const publicConsultationUrl = 'https://admin.factura.gob.sv/consultaPublica?ambiente=' + ambiente + '&codGen=' + encodeURIComponent(document.generation_code || '')
  let qrDataUrl = ''
  try { qrDataUrl = await QRCode.toDataURL(publicConsultationUrl, { width: 300, margin: 1, errorCorrectionLevel: 'M' }) } catch { qrDataUrl = '' }

  const rows = items.map((item) => {
    const total = Number(item.ventaGravada || 0) + Number(item.ventaExenta || 0) + Number(item.ventaNoSuj || 0)
    return '<tr><td class="center">' + safe(item.numItem) + '</td><td><b>' + safe(item.descripcion) + '</b></td><td class="right">' + safe(item.cantidad) + '</td><td class="right">' + money(item.precioUni) + '</td><td class="right total-line">' + money(total) + '</td></tr>'
  }).join('')

  const popup = window.open('', '_blank', 'width=1060,height=940')
  if (!popup) return
  const dteName = document.dte_type === '03' ? 'COMPROBANTE DE CRÉDITO FISCAL' : 'FACTURA CONSUMIDOR FINAL'
  const dteCode = document.dte_type === '03' ? 'DTE-03' : 'DTE-01'
  const seal = mh.selloRecibido || mh.selloRecepcion || mh.sello || '—'
  const taxTotal = document.dte_type === '03' ? (resumen.tributos || []).reduce((sum, t) => sum + Number(t.valor || 0), 0) : Number(resumen.totalIva || 0)
  const business = emisor.nombreComercial || 'IDEALO SV'
  const legal = emisor.nombre || company.name || business
  const status = statusLabel(document.status).toUpperCase()
  const qr = qrDataUrl ? '<div class="qr"><img src="' + qrDataUrl + '" alt="QR consulta pública"><span>CONSULTA PÚBLICA MH</span></div>' : ''
  const testMark = ambiente === '00' ? '<div class="test">AMBIENTE DE PRUEBAS · DOCUMENTO SIN VALIDEZ TRIBUTARIA</div>' : ''

  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + safe(document.control_number) + '</title><style>' +
    '@page{size:A4;margin:9mm}*{box-sizing:border-box}body{margin:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;color:#17191c;font-size:11px}.page{width:794px;min-height:1123px;margin:22px auto;background:#fff;padding:30px 36px 28px;box-shadow:0 12px 35px rgba(0,0,0,.12);position:relative}.orange-line{height:6px;background:#f36c21;position:absolute;left:0;right:0;top:0}.header{display:grid;grid-template-columns:1fr 290px;gap:24px;align-items:start;padding:10px 0 18px;border-bottom:1px solid #d8dadd}.brand{font-size:31px;font-weight:900;letter-spacing:-1px;line-height:1}.brand em{font-style:normal;color:#f36c21}.legal{margin-top:7px;font-size:10px;font-weight:700}.issuer-id{margin-top:7px;color:#5e6268;font-size:9px;line-height:1.5}.doc{text-align:right}.doc h1{margin:0;font-size:15px;letter-spacing:.35px}.doc-code{color:#f36c21;font-size:22px;font-weight:900;margin-top:4px}.status{display:inline-block;margin-top:8px;border:1px solid #cfd2d6;border-radius:4px;padding:5px 8px;font-size:8px;font-weight:900;letter-spacing:.5px}.test{margin:13px 0 0;border:1px solid #f3c7aa;background:#fff8f3;color:#9a430f;text-align:center;padding:7px;font-size:8px;font-weight:900;letter-spacing:.55px}.identity{margin-top:15px;display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d9dcdf;border-radius:6px;overflow:hidden}.identity>div{padding:11px 13px}.identity>div:nth-child(odd){border-right:1px solid #d9dcdf}.identity>div:nth-child(-n+2){border-bottom:1px solid #d9dcdf}.label{display:block;color:#747980;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}.identity strong{font-size:9.5px;word-break:break-word}.parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.party{border:1px solid #d9dcdf;border-radius:6px;padding:13px 14px;min-height:122px}.party-title{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.6px}.party-title:before{content:"";width:4px;height:16px;background:#f36c21;border-radius:2px}.party-name{font-size:11px;font-weight:900;margin-bottom:8px}.party p{margin:5px 0;line-height:1.35}.party p span{color:#747980;font-size:8px;font-weight:700;display:block}.section{margin-top:18px}.section-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.7px;margin-bottom:7px}.items{width:100%;border-collapse:collapse;border:1px solid #d9dcdf}.items th{background:#f3f4f5;border-bottom:1px solid #cfd2d6;padding:9px 8px;font-size:7.5px;text-transform:uppercase;letter-spacing:.35px}.items td{padding:10px 8px;border-bottom:1px solid #e4e6e8;font-size:9px;vertical-align:top}.items tbody tr:last-child td{border-bottom:0}.right{text-align:right}.center{text-align:center}.total-line{font-weight:900}.bottom{display:grid;grid-template-columns:1fr 250px;gap:16px;margin-top:15px}.words{border:1px solid #d9dcdf;border-radius:6px;padding:13px}.words p{margin:7px 0 0;font-size:9px;font-weight:700;line-height:1.45}.totals{border:1px solid #d9dcdf;border-radius:6px;overflow:hidden}.trow{display:flex;justify-content:space-between;padding:6px 10px;font-size:8.5px;border-bottom:1px solid #eceeef}.trow:last-child{border-bottom:0}.grand{background:#17191c;color:#fff;padding:10px;font-size:13px;font-weight:900}.grand strong{color:#ff7b2e}.mh{margin-top:15px;border:1px solid #d9dcdf;border-radius:6px;padding:13px 14px}.mh-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:9px;border-bottom:1px solid #e4e6e8}.mh-head b{font-size:10px}.accepted{color:#19763a;font-size:8px;font-weight:900}.mh-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:10px}.mh-grid strong{font-size:8.7px;display:block;word-break:break-word}.seal{font-family:monospace;font-size:7.8px!important}.verification{display:grid;grid-template-columns:112px 1fr;gap:15px;align-items:center;margin-top:15px;padding:12px;border:1px solid #d9dcdf;border-radius:6px}.qr{text-align:center}.qr img{width:92px;height:92px;display:block;margin:auto}.qr span{display:block;font-size:6.5px;font-weight:900;margin-top:4px}.verify-copy b{font-size:10px}.verify-copy p{margin:5px 0;color:#646970;font-size:8.5px;line-height:1.45}.footer{margin-top:18px;padding-top:9px;border-top:1px solid #dfe1e3;display:flex;justify-content:space-between;color:#777c82;font-size:7px}.actions{text-align:right;margin-top:16px}.actions button{background:#17191c;color:#fff;border:0;border-radius:5px;padding:11px 17px;font-weight:900;cursor:pointer}@media print{body{background:#fff}.page{box-shadow:none;margin:0;width:auto;min-height:auto;padding:0}.orange-line{top:-9mm}.actions{display:none}}' +
    '</style></head><body><main class="page"><div class="orange-line"></div>' +
    '<header class="header"><div><div class="brand">IDEALO <em>SV</em></div><div class="legal">' + safe(legal) + '</div><div class="issuer-id">NIT: ' + safe(emisor.nit || company.nit || '—') + ' &nbsp; · &nbsp; NRC: ' + safe(emisor.nrc || company.nrc || '—') + '<br>' + safe(emisor.descActividad || company.business_activity || '') + '</div></div><div class="doc"><h1>' + safe(dteName) + '</h1><div class="doc-code">' + safe(dteCode) + '</div><span class="status">' + safe(status) + '</span></div></header>' + testMark +
    '<section class="identity"><div><span class="label">Número de control</span><strong>' + safe(document.control_number) + '</strong></div><div><span class="label">Código de generación</span><strong>' + safe(document.generation_code) + '</strong></div><div><span class="label">Fecha y hora de emisión</span><strong>' + safe(payload.identificacion?.fecEmi || '—') + ' &nbsp; ' + safe(payload.identificacion?.horEmi || '') + '</strong></div><div><span class="label">Ambiente</span><strong>' + (ambiente === '00' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN') + '</strong></div></section>' +
    '<section class="parties"><div class="party"><div class="party-title">Emisor</div><div class="party-name">' + safe(emisor.nombre || company.name || business) + '</div><p><span>NIT / NRC</span>' + safe(emisor.nit || company.nit || '—') + ' · ' + safe(emisor.nrc || company.nrc || '—') + '</p><p><span>Actividad económica</span>' + safe(emisor.descActividad || company.business_activity || '—') + '</p><p><span>Dirección</span>' + safe(emisor.direccion?.complemento || company.address || '—') + '</p></div><div class="party"><div class="party-title">Receptor</div><div class="party-name">' + safe(receptor.nombre || 'Consumidor final') + '</div><p><span>Documento / NRC</span>' + safe(receptor.numDocumento || receptor.nit || '—') + ' · ' + safe(receptor.nrc || '—') + '</p><p><span>Dirección</span>' + safe(receptor.direccion?.complemento || '—') + '</p><p><span>Correo</span>' + safe(receptor.correo || '—') + '</p></div></section>' +
    '<section class="section"><div class="section-title">Detalle de la operación</div><table class="items"><thead><tr><th>#</th><th>Descripción</th><th class="right">Cantidad</th><th class="right">Precio unitario</th><th class="right">Total</th></tr></thead><tbody>' + rows + '</tbody></table></section>' +
    '<section class="bottom"><div class="words"><span class="label">Total en letras</span><p>' + safe(resumen.totalLetras || '—') + '</p></div><div class="totals"><div class="trow"><span>Ventas gravadas</span><strong>' + money(resumen.totalGravada) + '</strong></div><div class="trow"><span>Ventas exentas</span><strong>' + money(resumen.totalExenta) + '</strong></div><div class="trow"><span>Ventas no sujetas</span><strong>' + money(resumen.totalNoSuj) + '</strong></div><div class="trow"><span>' + (document.dte_type === '03' ? 'IVA 13%' : 'IVA incluido') + '</span><strong>' + money(taxTotal) + '</strong></div><div class="trow grand"><span>TOTAL A PAGAR</span><strong>' + money(resumen.totalPagar ?? resumen.montoTotalOperacion) + '</strong></div></div></section>' +
    '<section class="mh"><div class="mh-head"><b>RESPUESTA DEL MINISTERIO DE HACIENDA</b><span class="accepted">' + (document.status === 'PROCESSED' ? '✓ ACEPTADO' : safe(status)) + '</span></div><div class="mh-grid"><div><span class="label">Estado</span><strong>' + safe(mh.estado || statusLabel(document.status)) + '</strong></div><div><span class="label">Código / mensaje</span><strong>' + safe(mh.codigoMsg || '—') + ' · ' + safe(mh.descripcionMsg || mh.mensaje || '—') + '</strong></div><div><span class="label">Fecha de procesamiento</span><strong>' + safe(mh.fhProcesamiento || '—') + '</strong></div><div><span class="label">Sello de recepción</span><strong class="seal">' + safe(seal) + '</strong></div></div></section>' +
    '<section class="verification">' + qr + '<div class="verify-copy"><b>Verificación electrónica</b><p>Escanee el código QR para consultar este documento directamente en el portal público del Ministerio de Hacienda.</p><p><strong>Código de generación:</strong> ' + safe(document.generation_code) + '</p></div></section>' +
    '<footer class="footer"><span>Representación gráfica del Documento Tributario Electrónico.</span><span>Generado por IDEALO SV</span></footer><div class="actions"><button onclick="window.print()">Imprimir / Guardar PDF</button></div></main></body></html>'
  popup.document.write(html)
  popup.document.close()
}

function openPublicHacienda(document) {
  const ambiente = document.environment === 'production' ? '01' : '00'
  const url = 'https://admin.factura.gob.sv/consultaPublica?ambiente=' + ambiente + '&codGen=' + encodeURIComponent(document.generation_code || '')
  window.open(url, '_blank', 'noopener,noreferrer')
}

const printSource = professionalPrint.toString().replace(/^async function professionalPrint/, 'async function')
const haciendaSource = openPublicHacienda.toString().replace(/^function openPublicHacienda/, 'function')
const block = '  const printRepresentation = ' + printSource + '\n\n  const openPublicHacienda = ' + haciendaSource + '\n\n'
source = source.slice(0, start) + block + source.slice(end)
source = source.replace('onOpenHacienda={onOpenHacienda}/>', 'onOpenHacienda={() => openPublicHacienda(selected)}/>')
source = source.replace('>Abrir Hacienda</button>', '>Consultar en Hacienda</button>')

fs.writeFileSync(file, source)
console.log('DTE: representación fiscal corporativa, QR y consulta pública MH aplicados.')
