import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createWorker, PSM } from 'tesseract.js'
import { buildVatCardResult, mergeVatReadings, normalizeNrc, normalizeTaxId } from './vatCardOcrEngine'
import { createVatFieldVariants, prepareSegmentedDigitLine, preprocessVatField, releaseVatFieldVariants, splitCombinedVatImageV2 } from './vatCardImagePipeline'

const EMPTY_MANUAL = { name: '', nit: '', nrc: '', business_activity: '', address: '' }

export default function ClientVatCardScannerHost() {
  const [mount, setMount] = useState(null)

  useEffect(() => {
    const locate = () => {
      const fieldsets = [...document.querySelectorAll('.clients-module fieldset')]
      const target = fieldsets.find((fieldset) => /facturaci[oó]n electr[oó]nica|fiscal dte/i.test(fieldset.querySelector(':scope > legend')?.textContent || ''))
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
  const [captureMode, setCaptureMode] = useState('combined')
  const [front, setFront] = useState(null)
  const [back, setBack] = useState(null)
  const [combined, setCombined] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [error, setError] = useState('')

  const clearResult = () => {
    setResult(null)
    setManual(EMPTY_MANUAL)
    setError('')
  }

  const replaceSide = (setter, current, file) => {
    if (current?.url) URL.revokeObjectURL(current.url)
    setter(file ? { file, url: URL.createObjectURL(file) } : null)
  }

  const captureSide = (side, file) => {
    if (!file) return
    setCaptureMode('separate')
    if (combined?.url) URL.revokeObjectURL(combined.url)
    setCombined(null)
    if (side === 'front') replaceSide(setFront, front, file)
    else replaceSide(setBack, back, file)
    clearResult()
  }

  const captureCombined = async (file) => {
    if (!file || busy) return
    setBusy(true)
    setCaptureMode('combined')
    clearResult()
    setProgress('Detectando físicamente frente y reverso…')
    try {
      const split = await splitCombinedVatImageV2(file)
      if (combined?.url) URL.revokeObjectURL(combined.url)
      setCombined({ file, url: URL.createObjectURL(file), orientation: split.orientation })
      replaceSide(setFront, front, split.frontFile)
      replaceSide(setBack, back, split.backFile)
      setProgress('Frente y reverso encuadrados.')
    } catch (e) {
      console.error(e)
      setError('No se pudo separar automáticamente la imagen. Use frente y reverso por separado para esta fotografía.')
      setProgress('')
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(front && back)
  const resolved = applyManualCorrections(result, manual)

  const scan = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    setManual(EMPTY_MANUAL)
    setProgress('Preparando zonas fiscales…')

    let variants
    let workers
    try {
      variants = await createVatFieldVariants(front.file, back.file)
      workers = await createOcrWorkers()

      // Lectura global: las etiquetas impresas de la tarjeta son la referencia primaria
      // para nombre, giros y dirección. Las zonas siguen siendo respaldo independiente.
      const whole = await readWholeCardText(variants, workers, setProgress)
      const first = await readVariantSet(variants, 0, setProgress, workers)
      first.name = mergeTextReadings(first.name, whole.front)
      first.activity = mergeTextReadings(first.activity, whole.front)
      first.address = mergeTextReadings(first.address, whole.back)

      let parsed = buildVatCardResult(first)

      // Para NIT/NRC antiguos se intenta primero OCR normal. Si falla, se segmentan
      // físicamente los dígitos y se reconstruye una línea limpia sin marca de agua.
      if (!parsed.nit) {
        setProgress('Reconstruyendo los 14 dígitos del NIT…')
        const segmentedNit = await readSegmentedNumber(variants.nit?.[0], 14, workers.digits)
        if (segmentedNit) first.nit = segmentedNit
      }
      if (!parsed.nrc) {
        setProgress('Reconstruyendo los dígitos del NRC…')
        const segmentedNrc = await readSegmentedNumber(variants.nrc?.[0], 7, workers.digits)
        if (segmentedNrc) first.nrc = segmentedNrc
      }

      parsed = buildVatCardResult(first)
      const retry = new Set([...missingToReadingFields(parsed), ...reviewToReadingFields(parsed.review_fields)])
      if (retry.size) {
        setProgress('Segunda lectura únicamente de campos pendientes…')
        const second = await readVariantSet(variants, 1, setProgress, workers, retry)
        if (retry.has('name')) second.name = mergeTextReadings(second.name, whole.front)
        if (retry.has('activity')) second.activity = mergeTextReadings(second.activity, whole.front)
        if (retry.has('address')) second.address = mergeTextReadings(second.address, whole.back)
        const merged = mergeVatReadings(first, second)

        let retried = buildVatCardResult(merged)
        if (!retried.nit) {
          const segmentedNit = await readSegmentedNumber(variants.nit?.[1] || variants.nit?.[0], 14, workers.digits)
          if (segmentedNit) merged.nit = segmentedNit
        }
        if (!retried.nrc) {
          const segmentedNrc = await readSegmentedNumber(variants.nrc?.[1] || variants.nrc?.[0], 7, workers.digits)
          if (segmentedNrc) merged.nrc = segmentedNrc
        }
        retried = buildVatCardResult(merged)
        parsed = retried
      }

      setResult(parsed)
      if (!parsed.ready_for_dte03) {
        setError(`Lectura incompleta: falta confirmar ${parsed.missing.join(', ')}. Ningún texto dudoso se aplicará automáticamente.`)
      }
      setProgress('Lectura terminada.')
    } catch (e) {
      console.error(e)
      setError('No se pudo completar la lectura automática. Los campos dudosos quedan vacíos para evitar datos incorrectos.')
      setProgress('')
    } finally {
      if (variants) releaseVatFieldVariants(variants)
      await workers?.text?.terminate?.()
      await workers?.digits?.terminate?.()
      setBusy(false)
    }
  }

  const apply = () => {
    if (!resolved?.ready_for_dte03) return setError('Confirme razón social, NIT/DUI, NRC, giro principal y dirección.')
    if (!applyToFiscalForm(resolved)) return setError('No se encontró el formulario Fiscal DTE visible.')
    window.dispatchEvent(new CustomEvent('idealo-vat-additional-activities', { detail: { activities: resolved.additional_activities || [] } }))
    setOpen(false)
  }

  return <>
    <div className="vat-scan-toolbar">
      <div>
        <strong>Tarjeta IVA</strong>
        <small>{resolved?.ready_for_dte03 ? 'Datos fiscales verificados' : ready ? 'Frente y reverso listos' : 'Cargue una imagen o dos caras separadas'}</small>
      </div>
      <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>{resolved?.ready_for_dte03 ? '✓ Datos IVA verificados' : '▣ Escanear datos tarjeta IVA'}</button>
    </div>

    {open && createPortal(<div className="vat-scan-backdrop" role="dialog" aria-modal="true">
      <section className="vat-scan-dialog">
        <header>
          <div><small>CLIENTES · FISCAL DTE</small><h3>Escáner Tarjeta IVA · motor v4</h3></div>
          <button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button>
        </header>
        <p className="vat-scan-help">Lectura híbrida: etiquetas completas para nombre/giros/dirección y segmentación física de dígitos para NIT/NRC. Si un valor no supera validación, queda vacío.</p>

        <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
          <button type="button" className={captureMode === 'combined' ? 'vat-scan-done brand-orange' : 'secondary-button'} onClick={() => setCaptureMode('combined')}>Una imagen con ambas caras</button>
          <button type="button" className={captureMode === 'separate' ? 'vat-scan-done brand-orange' : 'secondary-button'} onClick={() => setCaptureMode('separate')}>Dos imágenes separadas</button>
        </div>

        {captureMode === 'combined' && <section style={{ border: '1px solid #aab4be', borderRadius: 8, padding: 12, marginBottom: 14, background: '#f7f9fa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><strong>Archivo combinado</strong><small style={{ display: 'block' }}>Frente y reverso arriba/abajo o lado a lado.</small></div>
            <label className="vat-side-button">{busy ? 'Procesando…' : combined ? 'Cambiar imagen' : 'Seleccionar imagen'}<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => captureCombined(e.target.files?.[0])} /></label>
          </div>
          {combined?.url && <div style={{ marginTop: 10, textAlign: 'center' }}><img src={combined.url} alt="Tarjeta IVA combinada" style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6 }} /></div>}
        </section>}

        <div className="vat-scan-grid">
          <SideCapture title="1. Frente" item={front} readOnly={captureMode === 'combined'} onFile={(file) => captureSide('front', file)} />
          <SideCapture title="2. Reverso" item={back} readOnly={captureMode === 'combined'} onFile={(file) => captureSide('back', file)} />
        </div>

        <div className="vat-scan-status">
          <strong>{ready ? '2/2 caras listas' : `${(front ? 1 : 0) + (back ? 1 : 0)}/2 caras listas`}</strong>
          <span>Las imágenes se usan temporalmente para OCR.</span>
        </div>
        {error && <p className="vat-scan-error">{error}</p>}
        {busy && <div className="vat-scan-reading"><span className="spinner" /><strong>{progress || 'Procesando…'}</strong></div>}
        {result && <DetectedData data={resolved} original={result} manual={manual} onManual={(field, value) => setManual((current) => ({ ...current, [field]: value }))} />}

        <footer>
          <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cerrar</button>
          {!result
            ? <button type="button" className="vat-scan-done brand-orange" disabled={!ready || busy} onClick={scan}>{busy ? 'Leyendo…' : 'Leer datos'}</button>
            : <button type="button" className="vat-scan-done brand-orange" disabled={!resolved?.ready_for_dte03} onClick={apply}>{resolved?.ready_for_dte03 ? 'Llenar formulario' : 'Complete datos faltantes'}</button>}
        </footer>
      </section>
    </div>, document.body)}
  </>
}

function SideCapture({ title, item, onFile, readOnly }) {
  return <article className={item ? 'vat-side-card ready' : 'vat-side-card'}>
    <div className="vat-side-head"><strong>{title}</strong><span>{item ? 'Lista' : 'Pendiente'}</span></div>
    {item ? <img src={item.url} alt={title} /> : <div className="vat-side-placeholder">Tarjeta IVA</div>}
    {readOnly
      ? <div className="vat-side-button" style={{ opacity: 0.75 }}>Separada automáticamente</div>
      : <label className="vat-side-button">{item ? 'Cambiar' : 'Tomar foto / seleccionar'}<input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} /></label>}
  </article>
}

function DetectedData({ data, original, manual, onManual }) {
  const fields = [
    { key: 'name', label: 'Razón social / Nombre del contribuyente', placeholder: 'Nombre del contribuyente' },
    { key: 'nit', label: 'NIT / DUI homologado', placeholder: '00000000-0 o 0000-000000-000-0' },
    { key: 'nrc', label: 'NRC', placeholder: '000000-0' },
    { key: 'business_activity', label: 'Giro principal', placeholder: 'Actividad económica principal' },
    { key: 'address', label: 'Dirección casa matriz', placeholder: 'Dirección completa' },
  ]
  return <section className="vat-detected">
    <div><strong>Datos detectados</strong><small>{data.ready_for_dte03 ? 'Todos los campos fiscales están completos.' : 'Los campos inseguros quedan vacíos; complete únicamente lo faltante.'}</small></div>
    <dl>
      {fields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{data[key] || 'No reconocido'}</dd></div>)}
      <div><dt>Giro 2</dt><dd>{data.additional_activities?.[0]?.name || 'No detectado'}</dd></div>
      <div><dt>Giro 3</dt><dd>{data.additional_activities?.[1]?.name || 'No detectado'}</dd></div>
    </dl>
    <div className="vat-manual-review" style={{ marginTop: 14 }}>
      <strong>Revisión / corrección manual</strong>
      {fields.map(({ key, label, placeholder }) => <label key={key} style={{ display: 'block', marginTop: 8 }}>
        <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>{label}</span>
        <input type="text" inputMode={key === 'nit' || key === 'nrc' ? 'numeric' : 'text'} placeholder={original?.[key] || placeholder} value={manual[key] || ''} onChange={(e) => onManual(key, e.target.value)} style={{ width: '100%' }} />
      </label>)}
    </div>
  </section>
}

async function createOcrWorkers() {
  const [text, digits] = await Promise.all([createWorker('spa'), createWorker('eng')])
  await text.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1', user_defined_dpi: '300' })
  await digits.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD, tessedit_char_whitelist: '0123456789-', user_defined_dpi: '300' })
  return { text, digits }
}

async function readWholeCardText(variants, workers, setProgress) {
  const read = async (source, label) => {
    if (!source) return ''
    setProgress(`Leyendo contexto completo del ${label}…`)
    const prepared = preprocessVatField(source, 'text')
    try {
      await workers.text.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      const ocr = await workers.text.recognize(prepared)
      return Number(ocr.data.confidence || 0) >= 28 ? (ocr.data.text || '') : ''
    } finally {
      prepared.width = 1
      prepared.height = 1
    }
  }
  return {
    front: await read(variants.fullFront?.[0], 'frente'),
    back: await read(variants.fullBack?.[0], 'reverso'),
  }
}

async function readVariantSet(variants, variantIndex, setProgress, workers, onlyFields = null) {
  const readings = {}
  for (const field of ['name', 'nit', 'nrc', 'activity', 'address']) {
    if (onlyFields && !onlyFields.has(field)) continue
    const source = variants[field]?.[variantIndex]
    if (!source) continue
    setProgress(`Leyendo ${fieldLabel(field)}…`)
    const numeric = field === 'nit' || field === 'nrc'
    const prepared = preprocessVatField(source, numeric ? 'digits' : 'text')
    try {
      if (!numeric) await workers.text.setParameters({ tessedit_pageseg_mode: field === 'name' ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK })
      const ocr = await (numeric ? workers.digits : workers.text).recognize(prepared)
      const minConfidence = numeric ? 35 : field === 'name' ? 48 : 38
      readings[field] = Number(ocr.data.confidence || 0) >= minConfidence ? (ocr.data.text || '') : ''
    } finally {
      prepared.width = 1
      prepared.height = 1
    }
  }
  return readings
}

async function readSegmentedNumber(source, expectedCount, worker) {
  if (!source || !worker) return ''
  const line = prepareSegmentedDigitLine(source, expectedCount)
  if (!line) return ''
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789', user_defined_dpi: '300' })
    const ocr = await worker.recognize(line)
    const digits = String(ocr.data.text || '').replace(/\D/g, '')
    if (digits.length !== expectedCount) return ''
    return expectedCount === 14
      ? `${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 13)}-${digits.slice(13)}`
      : `${digits.slice(0, -1)}-${digits.slice(-1)}`
  } finally {
    line.width = 1
    line.height = 1
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD, tessedit_char_whitelist: '0123456789-', user_defined_dpi: '300' })
  }
}

function mergeTextReadings(local, whole) {
  const left = String(local || '').trim()
  const right = String(whole || '').trim()
  if (!left) return right
  if (!right) return left
  return `${left}\n${right}`
}

function missingToReadingFields(result) {
  const out = []
  if (!result.name) out.push('name')
  if (!result.nit) out.push('nit')
  if (!result.nrc) out.push('nrc')
  if (!result.business_activity) out.push('activity')
  if (!result.address) out.push('address')
  return out
}

function reviewToReadingFields(fields = []) {
  return fields.map((field) => field === 'business_activity' ? 'activity' : field)
}

function fieldLabel(field) {
  return ({ name: 'nombre del contribuyente', nit: 'NIT/DUI', nrc: 'NRC', activity: 'giros', address: 'dirección' })[field] || field
}

function applyManualCorrections(result, manual) {
  if (!result) return result
  const next = { ...result, review_fields: [...(result.review_fields || [])] }
  const name = String(manual.name || '').trim()
  const nit = normalizeTaxId(manual.nit)
  const nrc = normalizeNrc(manual.nrc)
  const activity = String(manual.business_activity || '').trim()
  const address = String(manual.address || '').trim()
  if (name) next.name = name
  if (nit) next.nit = nit
  if (nrc) next.nrc = nrc
  if (activity) { next.business_activity = activity; next.activity_code = '' }
  if (address) next.address = address
  const missing = []
  if (!next.name) missing.push('razón social')
  if (!next.nit) missing.push('NIT')
  if (!next.nrc) missing.push('NRC')
  if (!next.business_activity) missing.push('giro / actividad')
  if (!next.address) missing.push('dirección de casa matriz')
  return { ...next, missing, ready_for_dte03: missing.length === 0 }
}

function applyToFiscalForm(data) {
  const root = document.querySelector('.clients-module')
  if (!root) return false
  const digits = String(data.nit || '').replace(/\D/g, '')
  const values = {
    preferred_dte_type: '03', taxpayer_type: '2', document_type: digits.length === 9 ? '13' : '36', document_number: data.nit,
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
