import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { recognize } from 'tesseract.js'
import { extractVatNit, parseVatCardSides } from './clientVatCardParser'

export default function ClientVatCardScannerHost() {
  const [mount, setMount] = useState(null)

  useEffect(() => {
    const locate = () => {
      const fieldsets = [...document.querySelectorAll('.clients-module fieldset')]
      const target = fieldsets.find((fieldset) => {
        const legend = fieldset.querySelector(':scope > legend')
        return /facturaci[oó]n electr[oó]nica|fiscal dte/i.test(legend?.textContent || '')
      })
      if (!target) return setMount(null)
      let node = target.querySelector(':scope > .vat-card-scanner-mount')
      if (!node) {
        node = document.createElement('div')
        node.className = 'vat-card-scanner-mount'
        target.prepend(node)
      }
      setMount(node)
    }
    locate()
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return mount ? createPortal(<VatCardScanner />, mount) : null
}

function VatCardScanner() {
  const [open, setOpen] = useState(false)
  const [front, setFront] = useState(null)
  const [back, setBack] = useState(null)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [manualNit, setManualNit] = useState('')
  const [error, setError] = useState('')

  const capture = (side, file) => {
    if (!file) return
    const next = { file, url: URL.createObjectURL(file) }
    if (side === 'front') {
      if (front?.url) URL.revokeObjectURL(front.url)
      setFront(next)
    } else {
      if (back?.url) URL.revokeObjectURL(back.url)
      setBack(next)
    }
    setResult(null)
    setManualNit('')
    setError('')
  }

  const capturedCount = (front ? 1 : 0) + (back ? 1 : 0)
  const ready = capturedCount === 2
  const resolvedResult = applyManualNit(result, manualNit)

  const scan = async () => {
    if (!ready || reading) return
    setReading(true)
    setError('')
    setResult(null)
    setManualNit('')
    try {
      setProgress('Leyendo frente…')
      const frontOcr = await recognize(front.file, 'spa')
      setProgress('Leyendo reverso…')
      const backOcr = await recognize(back.file, 'spa')
      let parsed = parseVatCardSides(frontOcr.data.text || '', backOcr.data.text || '')

      if (!parsed.nit) {
        const recoveredNit = await recoverNitFromFront(front.file, setProgress)
        if (recoveredNit) {
          const missing = parsed.missing.filter((item) => item !== 'NIT')
          parsed = { ...parsed, nit: recoveredNit, missing, ready_for_dte03: missing.length === 0 }
        }
      }

      setResult(parsed)
      if (!parsed.ready_for_dte03) {
        setError(`Lectura incompleta: falta confirmar ${parsed.missing.join(', ')}. Puede volver a capturar o completar manualmente el NIT si es el único dato pendiente.`)
      }
      setProgress('Lectura terminada')
    } catch (scanError) {
      console.error(scanError)
      setError('No se pudieron leer los datos. Intente con fotos más rectas, iluminadas y nítidas.')
      setProgress('')
    } finally {
      setReading(false)
    }
  }

  const apply = () => {
    if (!resolvedResult?.ready_for_dte03) {
      setError('No se puede llenar el formulario: NIT, NRC, razón social, giro y dirección de casa matriz deben estar confirmados.')
      return
    }
    if (!applyToFiscalForm(resolvedResult)) {
      setError('Se leyeron los datos, pero no se encontró el formulario Fiscal DTE visible.')
      return
    }
    setOpen(false)
  }

  return <>
    <div className="vat-scan-toolbar">
      <div><strong>Tarjeta IVA</strong><small>{resolvedResult?.ready_for_dte03 ? 'Datos fiscales completos y listos para aplicar' : ready ? 'Frente y reverso capturados' : 'Capture las dos caras y el ERP leerá los datos'}</small></div>
      <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>{resolvedResult?.ready_for_dte03 ? '✓ Datos IVA verificados' : '▣ Escanear datos tarjeta IVA'}</button>
    </div>

    {open && createPortal(
      <div className="vat-scan-backdrop" role="dialog" aria-modal="true" aria-label="Escanear datos de tarjeta IVA">
        <section className="vat-scan-dialog">
          <header><div><small>CLIENTES · FISCAL DTE</small><h3>Escanear datos de tarjeta IVA</h3></div><button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button></header>
          <p className="vat-scan-help">Capture frente y reverso. Si el NIT no se distingue en la primera lectura, el ERP prueba automáticamente varias lecturas ampliadas del frente. Los encabezados de Hacienda nunca se usan como datos del cliente.</p>
          <div className="vat-scan-grid">
            <SideCapture side="front" title="1. Frente" item={front} onFile={(file) => capture('front', file)} />
            <SideCapture side="back" title="2. Reverso" item={back} onFile={(file) => capture('back', file)} />
          </div>
          <div className="vat-scan-status"><strong>{capturedCount}/2 caras listas</strong><span>Las imágenes se usan temporalmente para OCR y no se guardan automáticamente.</span></div>
          {error && <p className="vat-scan-error">{error}</p>}
          {reading && <div className="vat-scan-reading"><span className="spinner" /><strong>{progress || 'Leyendo documento…'}</strong></div>}
          {result && <DetectedData data={resolvedResult} original={result} manualNit={manualNit} onManualNit={setManualNit} />}
          <footer>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cerrar</button>
            {!result
              ? <button type="button" className="vat-scan-done" disabled={!ready || reading} onClick={scan}>{reading ? 'Leyendo…' : 'Leer datos'}</button>
              : <button type="button" className="vat-scan-done brand-orange" disabled={!resolvedResult?.ready_for_dte03} onClick={apply}>{resolvedResult?.ready_for_dte03 ? 'Llenar formulario' : 'Datos incompletos'}</button>}
          </footer>
        </section>
      </div>, document.body,
    )}
  </>
}

function SideCapture({ side, title, item, onFile }) {
  return <article className={item ? 'vat-side-card ready' : 'vat-side-card'}>
    <div className="vat-side-head"><strong>{title}</strong><span>{item ? 'Capturada' : 'Pendiente'}</span></div>
    {item ? <img src={item.url} alt={`${title} de tarjeta IVA`} /> : <div className="vat-side-placeholder">Tarjeta IVA · {side === 'front' ? 'frente' : 'reverso'}</div>}
    <label className="vat-side-button">{item ? 'Volver a capturar' : 'Tomar foto / seleccionar'}<input type="file" accept="image/*" capture="environment" onChange={(event) => onFile(event.target.files?.[0])} /></label>
  </article>
}

function DetectedData({ data, original, manualNit, onManualNit }) {
  const items = [['Razón social', data.name], ['NIT', data.nit], ['NRC', data.nrc], ['Actividad / giro', data.business_activity], ['Dirección casa matriz', data.address]]
  const allowManualNit = original && !original.nit
  return <section className="vat-detected">
    <div><strong>Datos detectados</strong><small>{data.ready_for_dte03 ? 'Datos mínimos DTE-03 completos. Revise antes de aplicar.' : 'OCR incompleto: vuelva a capturar la cara donde falten datos.'}</small></div>
    <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'No reconocido'}</dd></div>)}</dl>
    {allowManualNit && <div style={{ marginTop: 12 }}>
      <label><strong>NIT manual (respaldo)</strong><br /><small>Úselo solo si puede leerlo directamente de la tarjeta. Debe contener 14 dígitos.</small></label>
      <input type="text" inputMode="numeric" placeholder="0000-000000-000-0" value={manualNit} onChange={(event) => onManualNit(event.target.value)} style={{ width: '100%', marginTop: 6 }} />
    </div>}
  </section>
}

async function recoverNitFromFront(file, setProgress) {
  for (let variant = 0; variant < 3; variant += 1) {
    setProgress(`Reintentando NIT · lectura ${variant + 1}/3…`)
    const focused = await prepareNitFocus(file, variant)
    try {
      const nitOcr = await recognize(focused, 'eng')
      const nit = extractVatNit(nitOcr.data.text || '')
      if (nit) return nit
    } finally {
      focused.width = 1
      focused.height = 1
    }
  }
  return ''
}

async function prepareNitFocus(file, variant = 0) {
  const bitmap = await createImageBitmap(file)
  const configs = [
    { x: 0.10, y: 0.10, w: 0.80, h: 0.76, threshold: 150, width: 2200 },
    { x: 0.15, y: 0.22, w: 0.70, h: 0.46, threshold: 165, width: 2400 },
    { x: 0.05, y: 0.18, w: 0.90, h: 0.58, threshold: 135, width: 2600 },
  ]
  const config = configs[variant] || configs[0]
  const sourceX = Math.round(bitmap.width * config.x)
  const sourceY = Math.round(bitmap.height * config.y)
  const sourceW = Math.round(bitmap.width * config.w)
  const sourceH = Math.round(bitmap.height * config.h)
  const canvas = document.createElement('canvas')
  canvas.width = config.width
  canvas.height = Math.max(700, Math.round(canvas.width * sourceH / sourceW))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    const boosted = gray < config.threshold ? Math.max(0, gray - 45) : Math.min(255, gray + 35)
    image.data[i] = boosted
    image.data[i + 1] = boosted
    image.data[i + 2] = boosted
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function applyManualNit(result, value) {
  if (!result) return result
  const digits = String(value || '').replace(/\D/g, '')
  if (result.nit || digits.length !== 14) return result
  const nit = `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`
  const missing = result.missing.filter((item) => item !== 'NIT')
  return { ...result, nit, missing, ready_for_dte03: missing.length === 0 }
}

function applyToFiscalForm(data) {
  const root = document.querySelector('.clients-module')
  if (!root) return false
  const values = {
    preferred_dte_type: '03', taxpayer_type: '2', document_type: '36', document_number: data.nit,
    nit: data.nit, nrc: data.nrc, name: data.name, business_activity: data.business_activity,
    activity_code: data.activity_code, address: data.address,
  }
  Object.entries(values).forEach(([name, value]) => {
    if (!value) return
    const control = root.querySelector(`[name="${name}"]`)
    if (control) setNativeValue(control, value)
  })
  return true
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}
