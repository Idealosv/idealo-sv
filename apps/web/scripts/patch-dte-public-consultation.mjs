import fs from 'node:fs'

const file = new URL('../src/ProcessedDtePanel.jsx', import.meta.url)
let source = fs.readFileSync(file, 'utf8')

if (!source.includes("import QRCode from 'qrcode'")) {
  source = source.replace("import { useEffect, useMemo, useState } from 'react'\n", "import { useEffect, useMemo, useState } from 'react'\nimport QRCode from 'qrcode'\n")
}

source = source.replace('  const printRepresentation = (document) => {', '  const printRepresentation = async (document) => {')

const marker = "    const seal = mh.selloRecibido || mh.sello || '—'\n"
if (!source.includes('const publicConsultationUrl =')) {
  source = source.replace(marker, marker + "    const ambiente = document.environment === 'production' ? '01' : '00'\n    const publicConsultationUrl = `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${encodeURIComponent(document.generation_code || '')}`\n    let qrDataUrl = ''\n    try { qrDataUrl = await QRCode.toDataURL(publicConsultationUrl, { width: 220, margin: 1, errorCorrectionLevel: 'M' }) } catch { qrDataUrl = '' }\n")
}

source = source.replace('.seal{font-family:monospace;word-break:break-all}.foot{', '.seal{font-family:monospace;word-break:break-all}.mh-wrap{display:grid;grid-template-columns:1fr 150px;gap:14px;align-items:center}.qr{text-align:center}.qr img{width:132px;height:132px}.qr small{display:block;margin-top:4px;color:#475569}.foot{')

const oldMh = '      <div class="mh"><strong>Ministerio de Hacienda</strong><div class="meta" style="margin-top:8px"><div><span class="label">Estado</span><div class="value">${safe(mh.estado || statusLabel(document.status))}</div></div><div><span class="label">Código / mensaje</span><div class="value">${safe(mh.codigoMsg || \'—\')} · ${safe(mh.descripcionMsg || mh.mensaje || \'—\')}</div></div><div><span class="label">Fecha procesamiento</span><div class="value">${safe(mh.fhProcesamiento || \'—\')}</div></div><div><span class="label">Sello de recepción</span><div class="value seal">${safe(seal)}</div></div></div></div>'
const newMh = '      <div class="mh"><div class="mh-wrap"><div><strong>Ministerio de Hacienda</strong><div class="meta" style="margin-top:8px"><div><span class="label">Estado</span><div class="value">${safe(mh.estado || statusLabel(document.status))}</div></div><div><span class="label">Código / mensaje</span><div class="value">${safe(mh.codigoMsg || \'—\')} · ${safe(mh.descripcionMsg || mh.mensaje || \'—\')}</div></div><div><span class="label">Fecha procesamiento</span><div class="value">${safe(mh.fhProcesamiento || \'—\')}</div></div><div><span class="label">Sello de recepción</span><div class="value seal">${safe(seal)}</div></div></div></div>${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="QR consulta pública DTE"><small>Escanear para consultar el DTE en Hacienda</small></div>` : \'\'}</div></div>'
source = source.replace(oldMh, newMh)

if (!source.includes('const openPublicHacienda = (document) =>')) {
  source = source.replace('  if (loading) return <div className="billing-documents-state">Cargando facturas y estados…</div>', "  const openPublicHacienda = (document) => {\n    const ambiente = document.environment === 'production' ? '01' : '00'\n    const url = `https://admin.factura.gob.sv/consultaPublica?ambiente=${ambiente}&codGen=${encodeURIComponent(document.generation_code || '')}`\n    window.open(url, '_blank', 'noopener,noreferrer')\n  }\n\n  if (loading) return <div className=\"billing-documents-state\">Cargando facturas y estados…</div>")
}

source = source.replace('onOpenHacienda={onOpenHacienda}/>', 'onOpenHacienda={() => openPublicHacienda(selected)}/>')
source = source.replace('>Abrir Hacienda</button>', '>Consultar en Hacienda</button>')

fs.writeFileSync(file, source)
console.log('DTE: QR y consulta pública oficial de Hacienda aplicados.')
