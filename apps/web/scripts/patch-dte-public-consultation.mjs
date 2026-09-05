import fs from 'node:fs'

const file = new URL('../src/ProcessedDtePanel.jsx', import.meta.url)
let source = fs.readFileSync(file, 'utf8')

if (!source.includes("import QRCode from 'qrcode'")) {
  source = source.replace("import { useEffect, useMemo, useState } from 'react'\n", "import { useEffect, useMemo, useState } from 'react'\nimport QRCode from 'qrcode'\n")
}

const start = source.indexOf('  const printRepresentation =')
const end = source.indexOf('  if (loading) return <div className="billing-documents-state">', start)
if (start === -1 || end === -1) throw new Error('No se encontró el bloque de impresión DTE para actualizar.')

const block = String.raw`  const printRepresentation = async (document) => {
    const payload = document.dte_payload || {}
    const receptor = payload.receptor || {}
    const emisor = payload.emisor || {}
    const resumen = payload.resumen || {}
    const mhRaw = document.mh_response || {}
    const mh = mhRaw.body || mhRaw
    const items = Array.isArray(payload.cuerpoDocumento) ? payload.cuerpoDocumento : []
    const ambiente = document.environment === 'production' ? '01' : '00'
    const publicConsultationUrl = `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${encodeURIComponent(document.generation_code || '')}`
    let qrDataUrl = ''
    try { qrDataUrl = await QRCode.toDataURL(publicConsultationUrl, { width: 260, margin: 1, errorCorrectionLevel: 'M' }) } catch { qrDataUrl = '' }
    const rows = items.map((item) => {
      const total = Number(item.ventaGravada || 0) + Number(item.ventaExenta || 0) + Number(item.ventaNoSuj || 0)
      return `<tr><td>${safe(item.numItem)}</td><td>${safe(item.descripcion)}</td><td class="num">${safe(item.cantidad)}</td><td class="num">${money(item.precioUni)}</td><td class="num strong">${money(total)}</td></tr>`
    }).join('')
    const popup = window.open('', '_blank', 'width=1040,height=920')
    if (!popup) return
    const dteName = document.dte_type === '03' ? 'Comprobante de Crédito Fiscal' : 'Factura Consumidor Final'
    const dteCode = document.dte_type === '03' ? 'DTE-03' : 'DTE-01'
    const seal = mh.selloRecibido || mh.selloRecepcion || mh.sello || '—'
    const taxTotal = document.dte_type === '03' ? (resumen.tributos || []).reduce((sum,t)=>sum+Number(t.valor||0),0) : Number(resumen.totalIva || 0)
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(document.control_number)}</title><style>
      @page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;color:#181a1f;font-size:12px}.sheet{width:794px;min-height:1123px;margin:22px auto;background:#fff;padding:28px 32px 26px;box-shadow:0 12px 32px rgba(0,0,0,.12)}.top{background:#17191d;color:#fff;border-radius:10px;padding:22px 24px;display:grid;grid-template-columns:1fr 116px;gap:18px;align-items:center;border-left:6px solid #f97316}.brand{font-size:27px;font-weight:900;letter-spacing:.5px;color:#f97316}.legal{font-size:11px;font-weight:700;margin-top:4px}.subtitle{font-size:10px;color:#c5cbd3;margin-top:8px;text-transform:uppercase;letter-spacing:.7px}.status{display:inline-flex;margin-top:13px;padding:6px 11px;border-radius:999px;background:#fff;color:#17191d;font-weight:800;font-size:10px}.qrbox{background:#fff;border-radius:8px;padding:7px;text-align:center}.qrbox img{display:block;width:96px;height:96px;margin:auto}.qrbox small{display:block;color:#4b5563;font-size:7px;font-weight:800;margin-top:4px}.doc-title{display:flex;justify-content:space-between;align-items:flex-end;margin:20px 0 10px}.doc-title h1{font-size:18px;margin:0}.doc-title strong{font-size:11px;color:#f97316}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f6f7f8;border:1px solid #dfe3e7;border-radius:9px;padding:13px 15px}.metric span,.party span,.mh span{display:block;color:#7b8189;font-size:8px;text-transform:uppercase;font-weight:800;letter-spacing:.45px}.metric strong,.party strong,.mh strong{display:block;margin-top:3px;font-size:10px;word-break:break-word}.parties{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.party{border:1px solid #dfe3e7;border-radius:9px;padding:14px 15px;min-height:116px;border-top:3px solid #f97316}.party h3{margin:0 0 10px;color:#ea580c;font-size:10px;text-transform:uppercase}.party p{margin:4px 0;line-height:1.35}.section-title{margin:18px 0 8px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.5px}.items{width:100%;border-collapse:collapse;border:1px solid #dde1e5;border-radius:8px;overflow:hidden}.items th{background:#22252a;color:#fff;padding:9px 8px;font-size:9px;text-transform:uppercase}.items td{padding:9px 8px;border-bottom:1px solid #e7e9ec;font-size:9px}.items tr:nth-child(even) td{background:#fafafa}.num{text-align:right}.strong{font-weight:800}.summary{display:grid;grid-template-columns:1fr 245px;gap:14px;margin-top:15px}.words{border:1px solid #dfe3e7;border-radius:9px;padding:14px}.words p{margin:7px 0 0;font-weight:700;line-height:1.4}.totals{background:#17191d;color:#fff;border-radius:9px;padding:14px}.trow{display:flex;justify-content:space-between;padding:4px 0;font-size:9px}.grand{border-top:1px solid #50545b;margin-top:6px;padding-top:9px;font-size:14px;font-weight:900}.grand strong{color:#f97316}.mh{margin-top:15px;border:1px solid #d9dde2;border-radius:9px;padding:14px;background:#fafbfc;display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}.mh-title{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center}.mh-title b{font-size:11px}.mh-title i{font-style:normal;color:#16803a;font-weight:900;font-size:9px}.seal{font-family:monospace;font-size:8px!important}.footer{margin-top:18px;padding-top:9px;border-top:1px solid #e0e3e6;color:#7b8189;font-size:8px;display:flex;justify-content:space-between;gap:20px}.actions{text-align:right;margin-top:18px}.actions button{border:0;border-radius:7px;padding:11px 16px;background:#17191d;color:#fff;font-weight:800;cursor:pointer}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;width:auto;min-height:auto;padding:0}.actions{display:none}}
    </style></head><body><main class="sheet">
      <header class="top"><div><div class="brand">IDEALO SV</div><div class="legal">${safe(emisor.nombre || company.name || 'Emisor')}</div><div class="subtitle">Documento Tributario Electrónico · El Salvador</div><span class="status">${safe(statusLabel(document.status)).toUpperCase()}</span></div>${qrDataUrl ? `<div class="qrbox"><img src="${qrDataUrl}" alt="QR consulta pública DTE"><small>VERIFICAR EN MH</small></div>` : ''}</header>
      <div class="doc-title"><h1>${safe(dteName)}</h1><strong>${safe(dteCode)}</strong></div>
      <section class="meta"><div class="metric"><span>Número de control</span><strong>${safe(document.control_number)}</strong></div><div class="metric"><span>Código de generación</span><strong>${safe(document.generation_code)}</strong></div><div class="metric"><span>Fecha / hora de emisión</span><strong>${safe(payload.identificacion?.fecEmi || '')} ${safe(payload.identificacion?.horEmi || '')}</strong></div><div class="metric"><span>Ambiente</span><strong>${ambiente === '00' ? '00 · PRUEBAS' : '01 · PRODUCCIÓN'}</strong></div></section>
      <section class="parties"><div class="party"><h3>Emisor</h3><strong>${safe(emisor.nombre || company.name)}</strong><p><span>NIT / NRC</span>${safe(emisor.nit || company.nit)}${emisor.nrc ? ` · ${safe(emisor.nrc)}` : ''}</p><p><span>Actividad</span>${safe(emisor.descActividad || company.business_activity)}</p><p><span>Dirección</span>${safe(emisor.direccion?.complemento || company.address)}</p></div><div class="party"><h3>Receptor</h3><strong>${safe(receptor.nombre || 'Consumidor final')}</strong><p><span>Documento / NRC</span>${safe(receptor.numDocumento || receptor.nit || '')}${receptor.nrc ? ` · ${safe(receptor.nrc)}` : ''}</p><p><span>Dirección</span>${safe(receptor.direccion?.complemento || '')}</p><p><span>Correo</span>${safe(receptor.correo || '')}</p></div></section>
      <div class="section-title">Detalle del documento</div><table class="items"><thead><tr><th>#</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>
      <section class="summary"><div class="words"><span>Total en letras</span><p>${safe(resumen.totalLetras || '')}</p></div><div class="totals"><div class="trow"><span>Ventas gravadas</span><strong>${money(resumen.totalGravada)}</strong></div><div class="trow"><span>Ventas exentas</span><strong>${money(resumen.totalExenta)}</strong></div><div class="trow"><span>Ventas no sujetas</span><strong>${money(resumen.totalNoSuj)}</strong></div><div class="trow"><span>${document.dte_type === '03' ? 'IVA 13%' : 'IVA incluido'}</span><strong>${money(taxTotal)}</strong></div><div class="trow grand"><span>Total a pagar</span><strong>${money(resumen.totalPagar ?? resumen.montoTotalOperacion)}</strong></div></div></section>
      <section class="mh"><div class="mh-title"><b>Ministerio de Hacienda</b><i>${document.status === 'PROCESSED' ? '✓ DOCUMENTO PROCESADO' : safe(statusLabel(document.status))}</i></div><div><span>Estado</span><strong>${safe(mh.estado || statusLabel(document.status))}</strong></div><div><span>Código / mensaje</span><strong>${safe(mh.codigoMsg || '—')} · ${safe(mh.descripcionMsg || mh.mensaje || '—')}</strong></div><div><span>Fecha de procesamiento</span><strong>${safe(mh.fhProcesamiento || '—')}</strong></div><div><span>Sello de recepción</span><strong class="seal">${safe(seal)}</strong></div></section>
      <footer class="footer"><span>Representación gráfica generada por IDEALO SV a partir del DTE almacenado y la respuesta de Hacienda.</span><span>QR para consulta pública oficial MH</span></footer>
      <div class="actions"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
    </main></body></html>`)
    popup.document.close()
  }

  const openPublicHacienda = (document) => {
    const ambiente = document.environment === 'production' ? '01' : '00'
    const url = `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${encodeURIComponent(document.generation_code || '')}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

`

source = source.slice(0, start) + block + source.slice(end)
source = source.replace('onOpenHacienda={onOpenHacienda}/>', 'onOpenHacienda={() => openPublicHacienda(selected)}/>')
source = source.replace('>Abrir Hacienda</button>', '>Consultar en Hacienda</button>')

fs.writeFileSync(file, source)
console.log('DTE: representación premium, QR y consulta pública MH aplicados.')
