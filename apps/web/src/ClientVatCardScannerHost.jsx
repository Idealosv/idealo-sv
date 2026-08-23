import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { recognize } from 'tesseract.js'
import { DTE_ACTIVITIES } from './dteCatalogs'

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
    setError('')
  }

  const capturedCount = (front ? 1 : 0) + (back ? 1 : 0)
  const ready = capturedCount === 2

  const scan = async () => {
    if (!ready || reading) return
    setReading(true)
    setError('')
    setResult(null)
    try {
      setProgress('Leyendo frente…')
      const frontOcr = await recognize(front.file, 'spa')
      setProgress('Leyendo reverso…')
      const backOcr = await recognize(back.file, 'spa')
      const raw = `${frontOcr.data.text || ''}\n${backOcr.data.text || ''}`
      const parsed = parseVatCard(raw)
      setResult(parsed)
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
    if (!result) return
    const applied = applyToFiscalForm(result)
    if (!applied) {
      setError('Se leyeron los datos, pero no se encontró el formulario Fiscal DTE visible.')
      return
    }
    setOpen(false)
  }

  return (
    <>
      <div className="vat-scan-toolbar">
        <div>
          <strong>Tarjeta IVA</strong>
          <small>{result ? 'Datos leídos y listos para aplicar' : ready ? 'Frente y reverso capturados' : 'Capture las dos caras y el ERP leerá los datos'}</small>
        </div>
        <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>
          {result ? '✓ Datos IVA leídos' : '▣ Escanear datos tarjeta IVA'}
        </button>
      </div>

      {open && createPortal(
        <div className="vat-scan-backdrop" role="dialog" aria-modal="true" aria-label="Escanear datos de tarjeta IVA">
          <section className="vat-scan-dialog">
            <header>
              <div><small>CLIENTES · FISCAL DTE</small><h3>Escanear datos de tarjeta IVA</h3></div>
              <button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button>
            </header>
            <p className="vat-scan-help">Capture frente y reverso. El ERP leerá el texto y propondrá NIT, NRC, razón social, giro y dirección. Revise siempre los datos antes de guardar.</p>
            <div className="vat-scan-grid">
              <SideCapture side="front" title="1. Frente" item={front} onFile={(file) => capture('front', file)} />
              <SideCapture side="back" title="2. Reverso" item={back} onFile={(file) => capture('back', file)} />
            </div>
            <div className="vat-scan-status"><strong>{capturedCount}/2 caras listas</strong><span>Las imágenes se usan temporalmente para OCR y no se guardan automáticamente.</span></div>

            {error && <p className="vat-scan-error">{error}</p>}
            {reading && <div className="vat-scan-reading"><span className="spinner" /><strong>{progress || 'Leyendo documento…'}</strong></div>}

            {result && <DetectedData data={result} />}

            <footer>
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cerrar</button>
              {!result ? (
                <button type="button" className="vat-scan-done" disabled={!ready || reading} onClick={scan}>{reading ? 'Leyendo…' : 'Leer datos'}</button>
              ) : (
                <button type="button" className="vat-scan-done brand-orange" onClick={apply}>Llenar formulario</button>
              )}
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

function SideCapture({ side, title, item, onFile }) {
  return (
    <article className={item ? 'vat-side-card ready' : 'vat-side-card'}>
      <div className="vat-side-head"><strong>{title}</strong><span>{item ? 'Capturada' : 'Pendiente'}</span></div>
      {item ? <img src={item.url} alt={`${title} de tarjeta IVA`} /> : <div className="vat-side-placeholder">Tarjeta IVA · {side === 'front' ? 'frente' : 'reverso'}</div>}
      <label className="vat-side-button">
        {item ? 'Volver a capturar' : 'Tomar foto / seleccionar'}
        <input type="file" accept="image/*" capture="environment" onChange={(event) => onFile(event.target.files?.[0])} />
      </label>
    </article>
  )
}

function DetectedData({ data }) {
  const items = [
    ['Razón social', data.name],
    ['NIT', data.nit],
    ['NRC', data.nrc],
    ['Actividad / giro', data.business_activity],
    ['Dirección', data.address],
  ].filter(([, value]) => value)
  return (
    <section className="vat-detected">
      <div><strong>Datos detectados</strong><small>Revise antes de llenar el formulario.</small></div>
      {items.length ? <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p>No se reconocieron campos fiscales con suficiente claridad.</p>}
    </section>
  )
}

function parseVatCard(text = '') {
  const normalizedText = text.replace(/\r/g, '\n').replace(/[|]/g, 'I')
  const lines = normalizedText.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const compact = lines.join('\n')

  const nitMatch = compact.match(/\b\d{4}[\s-]?\d{6}[\s-]?\d{3}[\s-]?\d\b/)
  const nit = nitMatch ? formatNit(nitMatch[0]) : ''

  let nrc = valueAfterLabel(lines, /\b(?:NRC|REGISTRO\s+(?:DE\s+)?IVA|NUMERO\s+DE\s+REGISTRO)\b/i)
  const nrcMatch = (nrc || compact).match(/\b\d{2,7}[\s-]?\d\b/)
  nrc = nrcMatch ? nrcMatch[0].replace(/\s+/g, '-') : ''

  const name = cleanField(valueAfterLabel(lines, /(?:NOMBRE\s+DEL\s+CONTRIBUYENTE|RAZ[ÓO]N\s+SOCIAL|DENOMINACI[ÓO]N|NOMBRE\s+O\s+RAZ[ÓO]N\s+SOCIAL)/i))
  const businessActivityRaw = cleanField(valueAfterLabel(lines, /(?:GIRO|ACTIVIDAD\s+ECON[ÓO]MICA|ACTIVIDAD)/i))
  const address = cleanField(valueAfterLabel(lines, /(?:DIRECCI[ÓO]N|DOMICILIO)/i, 2))
  const activity = matchActivity(businessActivityRaw)

  return {
    name,
    nit,
    nrc,
    business_activity: activity?.name || businessActivityRaw,
    activity_code: activity?.code || '',
    address,
  }
}

function valueAfterLabel(lines, labelRegex, joinNext = 1) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!labelRegex.test(line)) continue
    const inline = line.replace(labelRegex, '').replace(/^\s*[:.\-–]+\s*/, '').trim()
    if (inline && inline.length > 2) return inline
    const next = lines.slice(index + 1, index + 1 + joinNext).join(' ').trim()
    if (next) return next
  }
  return ''
}

function cleanField(value = '') {
  return value.replace(/^[^A-ZÁÉÍÓÚÑ0-9]+/i, '').replace(/\s{2,}/g, ' ').trim()
}

function formatNit(value = '') {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14) return value.trim()
  return `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`
}

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchActivity(raw = '') {
  const target = normalize(raw)
  if (!target || target.length < 4) return null
  const targetWords = new Set(target.split(' ').filter((word) => word.length > 3))
  let best = null
  let bestScore = 0
  DTE_ACTIVITIES.forEach((item) => {
    const candidate = normalize(item.name)
    if (candidate.includes(target) || target.includes(candidate)) {
      best = item
      bestScore = 100
      return
    }
    const words = candidate.split(' ').filter((word) => word.length > 3)
    const score = words.reduce((sum, word) => sum + (targetWords.has(word) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  })
  return bestScore >= 2 ? best : null
}

function applyToFiscalForm(data) {
  const root = document.querySelector('.clients-module')
  if (!root) return false
  const values = {
    preferred_dte_type: '03',
    taxpayer_type: '2',
    document_type: '36',
    document_number: data.nit,
    nit: data.nit,
    nrc: data.nrc,
    name: data.name,
    business_activity: data.business_activity,
    activity_code: data.activity_code,
    address: data.address,
  }
  Object.entries(values).forEach(([name, value]) => {
    if (!value) return
    const control = root.querySelector(`[name="${name}"]`)
    if (!control) return
    setNativeValue(control, value)
  })
  return true
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}
