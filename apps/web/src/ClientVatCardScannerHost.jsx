import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { recognize } from 'tesseract.js'
import { extractVatNit, parseVatCardSides } from './clientVatCardParser'
import { splitCombinedVatImage } from './vatCombinedImage'

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

const EMPTY_MANUAL = { name: '', nit: '', nrc: '', business_activity: '', address: '' }

function VatCardScanner() {
  const [open, setOpen] = useState(false)
  const [captureMode, setCaptureMode] = useState('separate')
  const [front, setFront] = useState(null)
  const [back, setBack] = useState(null)
  const [combined, setCombined] = useState(null)
  const [preparingCombined, setPreparingCombined] = useState(false)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [error, setError] = useState('')

  const clearResult = () => {
    setResult(null)
    setManual(EMPTY_MANUAL)
    setError('')
  }

  const replaceSide = (side, item) => {
    if (side === 'front') {
      if (front?.url) URL.revokeObjectURL(front.url)
      setFront(item)
    } else {
      if (back?.url) URL.revokeObjectURL(back.url)
      setBack(item)
    }
  }

  const capture = (side, file) => {
    if (!file) return
    setCaptureMode('separate')
    if (combined?.url) URL.revokeObjectURL(combined.url)
    setCombined(null)
    replaceSide(side, { file, url: URL.createObjectURL(file) })
    clearResult()
  }

  const captureCombined = async (file) => {
    if (!file || preparingCombined || reading) return
    setCaptureMode('combined')
    setPreparingCombined(true)
    clearResult()
    setProgress('Separando frente y reverso de la imagen…')
    try {
      const split = await splitCombinedVatImage(file)
      if (combined?.url) URL.revokeObjectURL(combined.url)
      const combinedItem = { file, url: URL.createObjectURL(file), orientation: split.orientation, splitRatio: split.splitRatio }
      setCombined(combinedItem)
      replaceSide('front', { file: split.frontFile, url: URL.createObjectURL(split.frontFile) })
      replaceSide('back', { file: split.backFile, url: URL.createObjectURL(split.backFile) })
      setProgress('Imagen separada. Revise las dos vistas antes de leer.')
    } catch (splitError) {
      console.error(splitError)
      setError('No se pudo separar automáticamente la imagen. Puede intentar otra foto o usar la opción de frente y reverso por separado.')
      setProgress('')
    } finally {
      setPreparingCombined(false)
    }
  }

  const capturedCount = (front ? 1 : 0) + (back ? 1 : 0)
  const ready = capturedCount === 2
  const resolvedResult = applyManualCorrections(result, manual)

  const scan = async () => {
    if (!ready || reading || preparingCombined) return
    setReading(true)
    setError('')
    setResult(null)
    setManual(EMPTY_MANUAL)
    try {
      setProgress('Leyendo frente…')
      const frontOcr = await recognize(front.file, 'spa')
      setProgress('Leyendo reverso…')
      const backOcr = await recognize(back.file, 'spa')
      let frontText = frontOcr.data.text || ''
      let backText = backOcr.data.text || ''
      let parsed = parseVatCardSides(frontText, backText)

      if (!parsed.ready_for_dte03 || (parsed.additional_activities?.length || 0) < 2) {
        setProgress('Mejorando lectura de tarjeta antigua y giros…')
        const enhanced = await recoverLegacyCardText(front.file, back.file)
        frontText = `${frontText}\n${enhanced.frontText}`
        backText = `${backText}\n${enhanced.backText}`
        parsed = preferMoreComplete(parsed, parseVatCardSides(frontText, backText))
      }

      if (!parsed.nit) {
        const recoveredNit = await recoverNitFromFront(front.file, setProgress)
        if (recoveredNit) parsed = mergeRecoveredField(parsed, 'nit', recoveredNit, 'NIT')
      }

      setResult(parsed)
      if (parsed.review_fields?.length) {
        setError('El OCR encontró texto dudoso en uno o más campos. Revise los campos marcados en naranja y corríjalos antes de llenar el formulario.')
      } else if (!parsed.ready_for_dte03) {
        setError(`Lectura incompleta: falta confirmar ${parsed.missing.join(', ')}. Puede corregir abajo cualquier dato no reconocido sin volver a tomar la foto.`)
      }
      setProgress('Lectura terminada')
    } catch (scanError) {
      console.error(scanError)
      setError('No se pudieron leer los datos. Intente con fotos más rectas, iluminadas y nítidas; también puede corregir manualmente los campos que el OCR alcance a detectar.')
      setProgress('')
    } finally {
      setReading(false)
    }
  }

  const apply = () => {
    if (!resolvedResult?.ready_for_dte03) {
      const reviewText = resolvedResult?.review_fields?.length ? ' Revise también los campos marcados como dudosos.' : ''
      setError(`Confirme los cinco datos fiscales: NIT/DUI homologado, NRC, razón social, giro y dirección de casa matriz.${reviewText}`)
      return
    }
    if (!applyToFiscalForm(resolvedResult)) {
      setError('Se leyeron los datos, pero no se encontró el formulario Fiscal DTE visible.')
      return
    }
    window.dispatchEvent(new CustomEvent('idealo-vat-additional-activities', {
      detail: { activities: resolvedResult.additional_activities || [] },
    }))
    setOpen(false)
  }

  return <>
    <div className="vat-scan-toolbar">
      <div><strong>Tarjeta IVA</strong><small>{resolvedResult?.ready_for_dte03 ? 'Datos fiscales completos y listos para aplicar' : ready ? captureMode === 'combined' ? 'Una imagen separada en frente y reverso' : 'Frente y reverso capturados' : 'Capture las dos caras o cargue una sola imagen con ambas'}</small></div>
      <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>{resolvedResult?.ready_for_dte03 ? '✓ Datos IVA verificados' : '▣ Escanear datos tarjeta IVA'}</button>
    </div>

    {open && createPortal(
      <div className="vat-scan-backdrop" role="dialog" aria-modal="true" aria-label="Escanear datos de tarjeta IVA">
        <section className="vat-scan-dialog">
          <header><div><small>CLIENTES · FISCAL DTE</small><h3>Escanear datos de tarjeta IVA</h3></div><button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button></header>
          <p className="vat-scan-help">Puede capturar frente y reverso por separado o cargar una sola foto/archivo donde aparezcan las dos caras. El ERP separa automáticamente imágenes apiladas verticalmente o colocadas lado a lado.</p>

          <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
            <button type="button" className={captureMode === 'separate' ? 'vat-scan-done brand-orange' : 'secondary-button'} onClick={() => setCaptureMode('separate')}>Dos imágenes separadas</button>
            <button type="button" className={captureMode === 'combined' ? 'vat-scan-done brand-orange' : 'secondary-button'} onClick={() => setCaptureMode('combined')}>Una imagen con ambas caras</button>
          </div>

          {captureMode === 'combined' && <section style={{ border: '1px solid #aab4be', borderRadius: 8, padding: 12, marginBottom: 14, background: '#f7f9fa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div><strong>Archivo combinado</strong><small style={{ display: 'block', marginTop: 3 }}>Ejemplo: frente arriba y reverso abajo en la misma fotografía.</small></div>
              <label className="vat-side-button" style={{ cursor: 'pointer' }}>{preparingCombined ? 'Separando…' : combined ? 'Cambiar imagen' : 'Seleccionar una imagen'}<input type="file" accept="image/*" capture="environment" disabled={preparingCombined || reading} onChange={(event) => captureCombined(event.target.files?.[0])} /></label>
            </div>
            {combined?.url && <div style={{ marginTop: 10, textAlign: 'center' }}><img src={combined.url} alt="Frente y reverso de tarjeta IVA en una sola imagen" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 6 }} /><small style={{ display: 'block', marginTop: 6 }}>Separación automática: {combined.orientation === 'horizontal' ? 'arriba / abajo' : 'izquierda / derecha'}.</small></div>}
          </section>}

          <div className="vat-scan-grid">
            <SideCapture side="front" title="1. Frente" item={front} onFile={(file) => capture('front', file)} readOnly={captureMode === 'combined'} />
            <SideCapture side="back" title="2. Reverso" item={back} onFile={(file) => capture('back', file)} readOnly={captureMode === 'combined'} />
          </div>
          <div className="vat-scan-status"><strong>{capturedCount}/2 caras listas</strong><span>{captureMode === 'combined' ? 'El archivo original se divide temporalmente para OCR; no se guarda automáticamente.' : 'Las imágenes se usan temporalmente para OCR y no se guardan automáticamente.'}</span></div>
          {error && <p className="vat-scan-error">{error}</p>}
          {(reading || preparingCombined) && <div className="vat-scan-reading"><span className="spinner" /><strong>{progress || 'Procesando documento…'}</strong></div>}
          {result && <DetectedData data={resolvedResult} original={result} manual={manual} onManual={(field, value) => setManual((current) => ({ ...current, [field]: value }))} />}
          <footer>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cerrar</button>
            {!result
              ? <button type="button" className="vat-scan-done" disabled={!ready || reading || preparingCombined} onClick={scan}>{reading ? 'Leyendo…' : 'Leer datos'}</button>
              : <button type="button" className="vat-scan-done brand-orange" disabled={!resolvedResult?.ready_for_dte03} onClick={apply}>{resolvedResult?.ready_for_dte03 ? 'Llenar formulario' : resolvedResult?.review_fields?.length ? 'Revise campos dudosos' : 'Complete datos faltantes'}</button>}
          </footer>
        </section>
      </div>, document.body,
    )}
  </>
}

function SideCapture({ side, title, item, onFile, readOnly = false }) {
  return <article className={item ? 'vat-side-card ready' : 'vat-side-card'}>
    <div className="vat-side-head"><strong>{title}</strong><span>{item ? 'Lista' : 'Pendiente'}</span></div>
    {item ? <img src={item.url} alt={`${title} de tarjeta IVA`} /> : <div className="vat-side-placeholder">Tarjeta IVA · {side === 'front' ? 'frente' : 'reverso'}</div>}
    {readOnly
      ? <div className="vat-side-button" style={{ opacity: 0.75 }}>Separada automáticamente</div>
      : <label className="vat-side-button">{item ? 'Volver a capturar' : 'Tomar foto / seleccionar'}<input type="file" accept="image/*" capture="environment" onChange={(event) => onFile(event.target.files?.[0])} /></label>}
  </article>
}

function DetectedData({ data, original, manual, onManual }) {
  const fields = [
    { key: 'name', label: 'Razón social', placeholder: 'Nombre o razón social' },
    { key: 'nit', label: 'NIT / DUI homologado', placeholder: '00000000-0 o 0000-000000-000-0' },
    { key: 'nrc', label: 'NRC', placeholder: '000000-0' },
    { key: 'business_activity', label: 'Giro principal', placeholder: 'Actividad económica principal' },
    { key: 'address', label: 'Dirección casa matriz', placeholder: 'Dirección completa' },
  ]
  const reviewFields = new Set(data.review_fields || [])
  const additional = data.additional_activities || []
  return <section className="vat-detected">
    <div><strong>Datos detectados</strong><small>{data.ready_for_dte03 ? 'Datos mínimos DTE-03 completos. Revise antes de aplicar.' : reviewFields.size ? 'Hay campos con baja confianza. Debe revisarlos y corregirlos antes de continuar.' : 'Revise y complete manualmente únicamente lo que el OCR no reconoció bien.'}</small></div>
    <dl>
      {fields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd style={reviewFields.has(key) ? { color: '#a84400', fontWeight: 800 } : undefined}>{data[key] || 'No reconocido'}{reviewFields.has(key) ? ' · REVISAR' : ''}</dd></div>)}
      <div><dt>Giro 2</dt><dd>{additional[0]?.name || 'No detectado'}</dd></div>
      <div><dt>Giro 3</dt><dd>{additional[1]?.name || 'No detectado'}</dd></div>
    </dl>
    <div className="vat-manual-review" style={{ marginTop: 14 }}>
      <strong>Revisión / corrección manual</strong>
      <small style={{ display: 'block', marginBottom: 8 }}>Los valores escritos aquí tienen prioridad sobre el OCR. Los campos marcados REVISAR deben confirmarse contra la tarjeta. Los giros 2 y 3 se podrán ajustar en el formulario del cliente.</small>
      {fields.map(({ key, label, placeholder }) => {
        const needsReview = reviewFields.has(key)
        return <label key={key} style={{ display: 'block', marginTop: 8 }}>
          <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>{label}{needsReview ? ' · REVISAR' : ''}</span>
          <input type="text" inputMode={key === 'nit' || key === 'nrc' ? 'numeric' : 'text'} placeholder={original?.[key] || placeholder} value={manual[key] || ''} onChange={(event) => onManual(key, event.target.value)} style={{ width: '100%', borderColor: needsReview ? '#f97316' : undefined, boxShadow: needsReview ? '0 0 0 1px #f97316 inset' : undefined }} />
        </label>
      })}
    </div>
  </section>
}

async function recoverLegacyCardText(frontFile, backFile) {
  const frontCanvas = await prepareDocumentForOcr(frontFile, { threshold: 158, width: 2600 })
  const backCanvas = await prepareDocumentForOcr(backFile, { threshold: 165, width: 2600 })
  try {
    const [frontOcr, backOcr] = await Promise.all([recognize(frontCanvas, 'spa'), recognize(backCanvas, 'spa')])
    return { frontText: frontOcr.data.text || '', backText: backOcr.data.text || '' }
  } finally {
    frontCanvas.width = 1
    frontCanvas.height = 1
    backCanvas.width = 1
    backCanvas.height = 1
  }
}

async function prepareDocumentForOcr(file, { threshold = 160, width = 2400 } = {}) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(800, Math.round(width * bitmap.height / bitmap.width))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)
    const boosted = gray < threshold ? Math.max(0, gray - 55) : Math.min(255, gray + 42)
    image.data[i] = boosted
    image.data[i + 1] = boosted
    image.data[i + 2] = boosted
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function recoverNitFromFront(file, setProgress) {
  for (let variant = 0; variant < 3; variant += 1) {
    setProgress(`Reintentando NIT/DUI · lectura ${variant + 1}/3…`)
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

function mergeRecoveredField(result, field, value, missingLabel) {
  const missing = result.missing.filter((item) => item !== missingLabel)
  return finalizeResult({ ...result, [field]: value, missing })
}

function preferMoreComplete(first, second) {
  if (!first) return second
  if (!second) return first
  const additional = mergeActivities(first.additional_activities, second.additional_activities)
  return finalizeResult({
    ...first,
    name: second.name || first.name,
    nit: second.nit || first.nit,
    nrc: second.nrc || first.nrc,
    business_activity: second.business_activity || first.business_activity,
    activity_code: second.activity_code || first.activity_code,
    additional_activities: additional,
    address: second.address || first.address,
    review_fields: [...new Set([...(first.review_fields || []), ...(second.review_fields || [])])],
  })
}

function mergeActivities(first = [], second = []) {
  const merged = []
  ;[...second, ...first].forEach((activity) => {
    if (!activity?.name) return
    const key = activity.code || activity.name.toLowerCase()
    if (!merged.some((item) => (item.code || item.name.toLowerCase()) === key)) merged.push(activity)
  })
  return merged.slice(0, 2)
}

function applyManualCorrections(result, manual) {
  if (!result) return result
  const next = { ...result, review_fields: [...(result.review_fields || [])] }
  const name = String(manual.name || '').trim()
  const nrc = normalizeNrc(manual.nrc)
  const businessActivity = String(manual.business_activity || '').trim()
  const address = String(manual.address || '').trim()
  const nit = normalizeTaxId(manual.nit)
  if (name) { next.name = name; next.review_fields = next.review_fields.filter((field) => field !== 'name') }
  if (nit) { next.nit = nit; next.review_fields = next.review_fields.filter((field) => field !== 'nit') }
  if (nrc) { next.nrc = nrc; next.review_fields = next.review_fields.filter((field) => field !== 'nrc') }
  if (businessActivity) { next.business_activity = businessActivity; next.activity_code = ''; next.review_fields = next.review_fields.filter((field) => field !== 'business_activity') }
  if (address) { next.address = address; next.review_fields = next.review_fields.filter((field) => field !== 'address') }
  return finalizeResult(next)
}

function finalizeResult(result) {
  const missing = []
  if (!result.nit) missing.push('NIT')
  if (!result.nrc) missing.push('NRC')
  if (!result.name) missing.push('razón social')
  if (!result.business_activity) missing.push('giro / actividad')
  if (!result.address) missing.push('dirección de casa matriz')
  const review_fields = [...new Set(result.review_fields || [])].filter((field) => Boolean(result[field]))
  return { ...result, missing, review_fields, additional_activities: result.additional_activities || [], ready_for_dte03: missing.length === 0 && review_fields.length === 0 }
}

function normalizeTaxId(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (![9, 14].includes(digits.length)) return ''
  return digits.length === 9 ? `${digits.slice(0, 8)}-${digits.slice(8)}` : `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`
}

function normalizeNrc(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 3 || digits.length > 8) return ''
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`
}

function applyToFiscalForm(data) {
  const root = document.querySelector('.clients-module')
  if (!root) return false
  const digits = String(data.nit || '').replace(/\D/g, '')
  const isHomologatedDui = digits.length === 9
  const values = {
    preferred_dte_type: '03', taxpayer_type: '2', document_type: isHomologatedDui ? '13' : '36', document_number: data.nit,
    nit: data.nit, nrc: data.nrc, name: data.name, business_activity: data.business_activity, activity_code: data.activity_code, address: data.address,
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
