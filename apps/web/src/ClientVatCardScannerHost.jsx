import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { recognize } from 'tesseract.js'
import { buildVatCardResult, mergeVatReadings, normalizeNrc, normalizeTaxId } from './vatCardOcrEngine'
import { createVatFieldVariants, preprocessVatField, releaseVatFieldVariants, splitCombinedVatImageV2 } from './vatCardImagePipeline'

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
    setProgress('Separando y encuadrando frente y reverso…')
    try {
      const split = await splitCombinedVatImageV2(file)
      if (combined?.url) URL.revokeObjectURL(combined.url)
      setCombined({ file, url: URL.createObjectURL(file), orientation: split.orientation })
      replaceSide(setFront, front, split.frontFile)
      replaceSide(setBack, back, split.backFile)
      setProgress('Frente y reverso listos para lectura por campos.')
    } catch (e) {
      console.error(e)
      setError('No se pudo separar la imagen. Intente con una foto más recta o use frente y reverso por separado.')
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
    setProgress('Preparando zonas fiscales de la tarjeta…')
    let variants
    try {
      variants = await createVatFieldVariants(front.file, back.file)
      const first = await readVariantSet(variants, 0, setProgress)
      let parsed = buildVatCardResult(first)

      const missingFields = missingToReadingFields(parsed)
      if (missingFields.length || parsed.review_fields.length) {
        setProgress('Segunda lectura enfocada solo en campos pendientes…')
        const second = await readVariantSet(variants, 1, setProgress, new Set([...missingFields, ...reviewToReadingFields(parsed.review_fields)]))
        parsed = buildVatCardResult(mergeVatReadings(first, second))
      }

      setResult(parsed)
      if (parsed.review_fields.length) {
        setError('Hay campos con baja confianza. Revise únicamente los marcados antes de llenar el formulario.')
      } else if (!parsed.ready_for_dte03) {
        setError(`Lectura incompleta: falta confirmar ${parsed.missing.join(', ')}. Puede corregir solo esos campos abajo.`)
      }
      setProgress('Lectura por campos terminada.')
    } catch (e) {
      console.error(e)
      setError('No se pudo completar la lectura por campos. Puede corregir manualmente sin volver a cargar la imagen.')
      setProgress('')
    } finally {
      if (variants) releaseVatFieldVariants(variants)
      setBusy(false)
    }
  }

  const apply = () => {
    if (!resolved?.ready_for_dte03) {
      setError('Confirme razón social, NIT/DUI, NRC, giro principal y dirección antes de continuar.')
      return
    }
    if (!applyToFiscalForm(resolved)) {
      setError('No se encontró el formulario Fiscal DTE visible.')
      return
    }
    window.dispatchEvent(new CustomEvent('idealo-vat-additional-activities', { detail: { activities: resolved.additional_activities || [] } }))
    setOpen(false)
  }

  return <>
    <div className="vat-scan-toolbar">
      <div><strong>Tarjeta IVA</strong><small>{resolved?.ready_for_dte03 ? 'Datos fiscales verificados por campos' : ready ? 'Frente y reverso listos' : 'Cargue una imagen con ambas caras o dos imágenes separadas'}</small></div>
      <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>{resolved?.ready_for_dte03 ? '✓ Datos IVA verificados' : '▣ Escanear datos tarjeta IVA'}</button>
    </div>

    {open && createPortal(
      <div className="vat-scan-backdrop" role="dialog" aria-modal="true" aria-label="Escanear datos de tarjeta IVA">
        <section className="vat-scan-dialog">
          <header><div><small>CLIENTES · FISCAL DTE</small><h3>Escáner Tarjeta IVA · motor v2</h3></div><button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button></header>
          <p className="vat-scan-help">Este lector procesa cada campo en una zona independiente: nombre, NIT, NRC, giros y dirección. Un dato de una zona no puede convertirse en otro campo.</p>

          <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
            <button type="button" className={captureMode === 'combined' ? 'vat-scan-done brand-orange' : 'secondary-button'} onClick={() => setCaptureMode('combined')}>Una imagen con ambas caras</button>
            <button type="button" className={captureMode === 'separate' ? 'vat-scan-done brand-orange' : 'secondary-button'} onClick={() => setCaptureMode('separate')}>Dos imágenes separadas</button>
          </div>

          {captureMode === 'combined' && <section style={{ border: '1px solid #aab4be', borderRadius: 8, padding: 12, marginBottom: 14, background: '#f7f9fa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div><strong>Archivo combinado</strong><small style={{ display: 'block', marginTop: 3 }}>Frente y reverso pueden estar arriba/abajo o lado a lado.</small></div>
              <label className="vat-side-button" style={{ cursor: 'pointer' }}>{busy ? 'Procesando…' : combined ? 'Cambiar imagen' : 'Seleccionar imagen'}<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => captureCombined(e.target.files?.[0])} /></label>
            </div>
            {combined?.url && <div style={{ marginTop: 10, textAlign: 'center' }}><img src={combined.url} alt="Tarjeta IVA con ambas caras" style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6 }} /><small style={{ display: 'block', marginTop: 6 }}>Separación: {combined.orientation === 'horizontal' ? 'arriba / abajo' : 'izquierda / derecha'}.</small></div>}
          </section>}

          <div className="vat-scan-grid">
            <SideCapture title="1. Frente" item={front} readOnly={captureMode === 'combined'} onFile={(file) => captureSide('front', file)} />
            <SideCapture title="2. Reverso" item={back} readOnly={captureMode === 'combined'} onFile={(file) => captureSide('back', file)} />
          </div>

          <div className="vat-scan-status"><strong>{ready ? '2/2 caras listas' : `${front ? 1 : 0 + (back ? 1 : 0)}/2 caras listas`}</strong><span>Las imágenes solo se usan temporalmente para OCR.</span></div>
          {error && <p className="vat-scan-error">{error}</p>}
          {busy && <div className="vat-scan-reading"><span className="spinner" /><strong>{progress || 'Procesando…'}</strong></div>}
          {result && <DetectedData data={resolved} original={result} manual={manual} onManual={(field, value) => setManual((current) => ({ ...current, [field]: value }))} />}

          <footer>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cerrar</button>
            {!result
              ? <button type="button" className="vat-scan-done brand-orange" disabled={!ready || busy} onClick={scan}>{busy ? 'Leyendo por campos…' : 'Leer datos'}</button>
              : <button type="button" className="vat-scan-done brand-orange" disabled={!resolved?.ready_for_dte03} onClick={apply}>{resolved?.ready_for_dte03 ? 'Llenar formulario' : 'Complete datos faltantes'}</button>}
          </footer>
        </section>
      </div>, document.body,
    )}
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
  const review = new Set(data.review_fields || [])
  return <section className="vat-detected">
    <div><strong>Datos detectados</strong><small>{data.ready_for_dte03 ? 'Todos los campos fiscales están completos.' : 'Solo complete los campos que falten o estén marcados para revisión.'}</small></div>
    <dl>
      {fields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd style={review.has(key) ? { color: '#a84400', fontWeight: 800 } : undefined}>{data[key] || 'No reconocido'}{review.has(key) ? ' · REVISAR' : ''}</dd></div>)}
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

async function readVariantSet(variants, variantIndex, setProgress, onlyFields = null) {
  const readings = {}
  const fields = ['name', 'nit', 'nrc', 'activity', 'address']
  for (const field of fields) {
    if (onlyFields && !onlyFields.has(field)) continue
    const source = variants[field]?.[variantIndex]
    if (!source) continue
    setProgress(`Leyendo ${fieldLabel(field)}…`)
    const mode = field === 'nit' || field === 'nrc' ? 'digits' : 'text'
    const prepared = preprocessVatField(source, mode)
    try {
      const language = mode === 'digits' ? 'eng' : 'spa'
      const ocr = await recognize(prepared, language)
      readings[field] = ocr.data.text || ''
    } finally {
      prepared.width = 1
      prepared.height = 1
    }
  }
  return readings
}

function missingToReadingFields(result) {
  const fields = []
  if (!result.name) fields.push('name')
  if (!result.nit) fields.push('nit')
  if (!result.nrc) fields.push('nrc')
  if (!result.business_activity) fields.push('activity')
  if (!result.address) fields.push('address')
  return fields
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
  if (name) { next.name = name; next.review_fields = next.review_fields.filter((f) => f !== 'name') }
  if (nit) { next.nit = nit; next.review_fields = next.review_fields.filter((f) => f !== 'nit') }
  if (nrc) { next.nrc = nrc; next.review_fields = next.review_fields.filter((f) => f !== 'nrc') }
  if (activity) { next.business_activity = activity; next.activity_code = ''; next.review_fields = next.review_fields.filter((f) => f !== 'business_activity') }
  if (address) { next.address = address; next.review_fields = next.review_fields.filter((f) => f !== 'address') }
  const missing = []
  if (!next.name) missing.push('razón social')
  if (!next.nit) missing.push('NIT')
  if (!next.nrc) missing.push('NRC')
  if (!next.business_activity) missing.push('giro / actividad')
  if (!next.address) missing.push('dirección de casa matriz')
  return { ...next, missing, ready_for_dte03: missing.length === 0 && next.review_fields.length === 0 }
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
