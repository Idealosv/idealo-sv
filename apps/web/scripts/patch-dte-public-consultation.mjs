import fs from 'node:fs'

const file = new URL('../src/ProcessedDtePanel.jsx', import.meta.url)
let source = fs.readFileSync(file, 'utf8')

if (!source.includes("import QRCode from 'qrcode'")) {
  source = source.replace("import { useEffect, useMemo, useState } from 'react'\n", "import { useEffect, useMemo, useState } from 'react'\nimport QRCode from 'qrcode'\n")
}

const start = source.indexOf('  const printRepresentation =')
const end = source.indexOf('  if (loading) return <div className="billing-documents-state">', start)
if (start === -1 || end === -1) throw new Error('No se encontró el bloque de impresión DTE para actualizar.')

async function premiumPrint(document) {
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
  try { qrDataUrl = await QRCode.toDataURL(publicConsultationUrl, { width: 280, margin: 1, errorCorrectionLevel: 'M' }) } catch { qrDataUrl = '' }
  const rows = items.map((item) => {
    const total = Number(item.ventaGravada || 0) + Number(item.ventaExenta || 0) + Number(item.ventaNoSuj || 0)
    return '<tr><td>' + safe(item.numItem) + '</td><td>' + safe(item.descripcion) + '</td><td class="num">' + safe(item.cantidad) + '</td><td class="num">' + money(item.precioUni) + '</td><td class="num strong">' + money(total) + '</td></tr>'
  }).join('')
  const popup = window.open('', '_blank', 'width=1060,height=940')
  if (!popup) return
  const dteName = document.dte_type === '03' ? 'Comprobante de Crédito Fiscal' : 'Factura Consumidor Final'
  const dteCode = document.dte_type === '03' ? 'DTE-03' : 'DTE-01'
  const seal = mh.selloRecibido || mh.selloRecepcion || mh.sello || '—'
  const taxTotal = document.dte_type === '03' ? (resumen.tributos || []).reduce((sum, t) => sum + Number(t.valor || 0), 0) : Number(resumen.totalIva || 0)
  const business = emisor.nombreComercial || 'IDEALO SV'
  const legal = emisor.nombre || company.name || business
  const testRibbon = ambiente === '00' ? '<div class="test-ribbon">AMBIENTE DE PRUEBAS · SIN VALIDEZ TRIBUTARIA</div>' : ''
  const qr = qrDataUrl ? '<div class="qrbox"><img src="' + qrDataUrl + '" alt="QR consulta pública DTE"><small>VERIFICAR DTE EN HACIENDA</small></div>' : ''
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + safe(document.control_number) + '</title><style>' +
    '@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#e9ecef;font-family:Inter,Arial,Helvetica,sans-serif;color:#181a1f;font-size:12px}.sheet{width:794px;min-height:1123px;margin:24px auto;background:#fff;padding:30px 34px 28px;box-shadow:0 18px 45px rgba(0,0,0,.14);position:relative}.test-ribbon{position:absolute;top:0;left:0;right:0;background:#fff3e8;color:#9a4b00;text-align:center;font-weight:900;font-size:9px;letter-spacing:.7px;padding:5px}.top{margin-top:12px;background:#15171a;color:#fff;border-radius:12px;padding:24px 24px 22px;display:grid;grid-template-columns:1fr 122px;gap:22px;align-items:center;border-left:7px solid #f97316}.brand{font-size:29px;font-weight:900;letter-spacing:.3px;color:#f97316}.legal{font-size:11px;font-weight:700;margin-top:5px}.subtitle{font-size:9px;color:#b8bec7;margin-top:10px;text-transform:uppercase;letter-spacing:1px}.status{display:inline-flex;margin-top:14px;padding:7px 12px;border-radius:999px;background:#fff;color:#15171a;font-weight:900;font-size:9px}.qrbox{background:#fff;border-radius:10px;padding:8px;text-align:center}.qrbox img{display:block;width:104px;height:104px;margin:auto}.qrbox small{display:block;color:#3e4650;font-size:6.8px;font-weight:900;margin-top:5px}.doc-title{display:flex;justify-content:space-between;align-items:flex-end;margin:22px 0 11px}.doc-title h1{font-size:19px;margin:0}.doc-title strong{font-size:11px;color:#f97316;letter-spacing:.8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f7f8fa;border:1px solid #dfe3e7;border-radius:10px;padding:15px 16px}.metric span,.party span,.mh span,.words span{display:block;color:#777f89;font-size:7.5px;text-transform:uppercase;font-weight:900;letter-spacing:.55px}.metric strong,.party strong,.mh strong{display:block;margin-top:4px;font-size:9.7px;word-break:break-word}.parties{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:13px}.party{border:1px solid #dfe3e7;border-radius:10px;padding:15px 16px;min-height:118px;border-top:4px solid #f97316;background:#fff}.party h3{margin:0 0 10px;color:#ea580c;font-size:10px;text-transform:uppercase;letter-spacing:.6px}.party p{margin:6px 0;line-height:1.35}.section-title{margin:20px 0 9px;font-size:10.5px;font-weight:900;text-transform:uppercase;letter-spacing:.7px}.items{width:100%;border-collapse:collapse;border:1px solid #dde1e5}.items th{background:#202328;color:#fff;padding:10px 9px;font-size:8.5px;text-transform:uppercase}.items td{padding:10px 9px;border-bottom:1px solid #e6e9ec;font-size:9px}.items tr:nth-child(even) td{background:#fafbfc}.num{text-align:right}.strong{font-weight:900}.summary{display:grid;grid-template-columns:1fr 252px;gap:15px;margin-top:16px}.words{border:1px solid #dfe3e7;border-radius:10px;padding:15px}.words p{margin:8px 0 0;font-weight:700;line-height:1.45}.totals{background:#17191d;color:#fff;border-radius:10px;padding:15px 16px}.trow{display:flex;justify-content:space-between;padding:4px 0;font-size:8.8px}.grand{border-top:1px solid #4c5158;margin-top:7px;padding-top:10px;font-size:14px;font-weight:900}.grand strong{color:#f97316}.mh{margin-top:16px;border:1px solid #d9dde2;border-radius:10px;padding:15px;background:#fafbfc;display:grid;grid-template-columns:1fr 1fr;gap:11px 19px}.mh-title{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center}.mh-title b{font-size:11px}.mh-title i{font-style:normal;color:#16803a;font-weight:900;font-size:8.5px}.seal{font-family:monospace;font-size:8px!important}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #e0e3e6;color:#7b8189;font-size:7.6px;display:flex;justify-content:space-between;gap:20px}.actions{text-align:right;margin-top:18px}.actions button{border:0;border-radius:8px;padding:12px 18px;background:#17191d;color:#fff;font-weight:900;cursor:pointer}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;width:auto;min-height:auto;padding:0}.actions{display:none}}' +
    '</style></head><body><main class="sheet">' + testRibbon +
    '<header class="top"><div><div class="brand">' + safe(business) + '</div><div class="legal">' + safe(legal) + '</div><div class="subtitle">Documento Tributario Electrónico · El Salvador</div><span class="status">' + safe(statusLabel(document.status)).toUpperCase() + '</span></div>' + qr + '</header>' +
    '<div class="doc-title"><h1>' + safe(dteName) + '</h1><strong>' + safe(dteCode) + '</strong></div>' +
    '<section class="meta"><div class="metric"><span>Número de control</span><strong>' + safe(document.control_number) + '</strong></div><div class="metric"><span>Código de generación</span><strong>' + safe(document.generation_code) + '</strong></div><div class="metric"><span>Fecha / hora de emisión</span><strong>' + safe(payload.identificacion?.fecEmi || '') + ' ' + safe(payload.identificacion?.horEmi || '') + '</strong></div><div class="metric"><span>Ambiente</span><strong>' + (ambiente === '00' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN') + '</strong></div></section>' +
    '<section class="parties"><div class="party"><h3>Emisor</h3><strong>' + safe(emisor.nombre || company.name) + '</strong><p><span>NIT / NRC</span>' + safe(emisor.nit || company.nit) + (emisor.nrc ? ' · ' + safe(emisor.nrc) : '') + '</p><p><span>Actividad</span>' + safe(emisor.descActividad || company.business_activity) + '</p><p><span>Dirección</span>' + safe(emisor.direccion?.complemento || company.address) + '</p></div><div class="party"><h3>Receptor</h3><strong>' + safe(receptor.nombre || 'Consumidor final') + '</strong><p><span>Documento / NRC</span>' + safe(receptor.numDocumento || receptor.nit || '') + (receptor.nrc ? ' · ' + safe(receptor.nrc) : '') + '</p><p><span>Dirección</span>' + safe(receptor.direccion?.complemento || '') + '</p><p><span>Correo</span>' + safe(receptor.correo || '') + '</p></div></section>' +
    '<div class="section-title">Detalle del documento</div><table class="items"><thead><tr><th>#</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<section class="summary"><div class="words"><span>Total en letras</span><p>' + safe(resumen.totalLetras || '') + '</p></div><div class="totals"><div class="trow"><span>Ventas gravadas</span><strong>' + money(resumen.totalGravada) + '</strong></div><div class="trow"><span>Ventas exentas</span><strong>' + money(resumen.totalExenta) + '</strong></div><div class="trow"><span>Ventas no sujetas</span><strong>' + money(resumen.totalNoSuj) + '</strong></div><div class="trow"><span>' + (document.dte_type === '03' ? 'IVA 13%' : 'IVA incluido') + '</span><strong>' + money(taxTotal) + '</strong></div><div class="trow grand"><span>Total a pagar</span><strong>' + money(resumen.totalPagar ?? resumen.montoTotalOperacion) + '</strong></div></div></section>' +
    '<section class="mh"><div class="mh-title"><b>Ministerio de Hacienda</b><i>' + (document.status === 'PROCESSED' ? '✓ DOCUMENTO PROCESADO' : safe(statusLabel(document.status))) + '</i></div><div><span>Estado</span><strong>' + safe(mh.estado || statusLabel(document.status)) + '</strong></div><div><span>Código / mensaje</span><strong>' + safe(mh.codigoMsg || '—') + ' · ' + safe(mh.descripcionMsg || mh.mensaje || '—') + '</strong></div><div><span>Fecha de procesamiento</span><strong>' + safe(mh.fhProcesamiento || '—') + '</strong></div><div><span>Sello de recepción</span><strong class="seal">' + safe(seal) + '</strong></div></section>' +
    '<footer class="footer"><span>Representación gráfica generada por IDEALO SV a partir del DTE almacenado y la respuesta de Hacienda.</span><span>QR para consulta pública oficial MH</span></footer><div class="actions"><button onclick="window.print()">Imprimir / Guardar PDF</button></div></main></body></html>'
  popup.document.write(html)
  popup.document.close()
}

function openPublicHacienda(document) {
  const ambiente = document.environment === 'production' ? '01' : '00'
  const url = 'https://admin.factura.gob.sv/consultaPublica?ambiente=' + ambiente + '&codGen=' + encodeURIComponent(document.generation_code || '')
  window.open(url, '_blank', 'noopener,noreferrer')
}

const printSource = premiumPrint.toString().replace(/^async function premiumPrint/, 'async function')
const haciendaSource = openPublicHacienda.toString().replace(/^function openPublicHacienda/, 'function')
const block = '  const printRepresentation = ' + printSource + '\n\n  const openPublicHacienda = ' + haciendaSource + '\n\n'
source = source.slice(0, start) + block + source.slice(end)
source = source.replace('onOpenHacienda={onOpenHacienda}/>', 'onOpenHacienda={() => openPublicHacienda(selected)}/>')
source = source.replace('>Abrir Hacienda</button>', '>Consultar en Hacienda</button>')

fs.writeFileSync(file, source)
console.log('DTE: representación premium, QR y consulta pública MH aplicados.')
