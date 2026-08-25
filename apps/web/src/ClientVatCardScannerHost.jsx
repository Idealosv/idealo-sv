import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { recognize } from 'tesseract.js'
import { parseVatCardSides } from './clientVatCardParser'

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
      const parsed = parseVatCardSides(frontOcr.data.text || '', backOcr.data.text || '')
      setResult(parsed)
      if (!parsed.ready_for_dte03) {
        setError(`Lectura incompleta: falta confirmar ${parsed.missing.join(', ')}. No se llenará el formulario hasta reconocer los datos fiscales obligatorios.`)
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
    if (!result?.ready_for_dte03) {
      setError('No se puede llenar el formulario: NIT, NRC, razón social, giro y dirección de casa matriz deben estar confirmados.')
      return
    }
    if (!applyToFiscalForm(result)) {
      setError('Se leyeron los datos, pero no se encontró el formulario Fiscal DTE visible.')
      return
    }
    setOpen(false)
  }

  return <>
    <div className="vat-scan-toolbar">
      <div><strong>Tarjeta IVA</strong><small>{result?.ready_for_dte03 ? 'Datos fiscales completos y listos para aplicar' : ready ? 'Frente y reverso capturados' : 'Capture las dos caras y el ERP leerá los datos'}</small></div>
      <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>{result?.ready_for_dte03 ? '✓ Datos IVA verificados' : '▣ Escanear datos tarjeta IVA'}</button>
    </div>

    {open && createPortal(
      <div className="vat-scan-backdrop" role="dialog" aria-modal="true" aria-label="Escanear datos de tarjeta IVA">
        <section className="vat-scan-dialog">
          <header><div><small>CLIENTES · FISCAL DTE</small><h3>Escanear datos de tarjeta IVA</h3></div><button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button></header>
          <p className="vat-scan-help">Capture frente y reverso. El ERP identifica NIT, NRC, razón social y giro en el frente, y la dirección únicamente desde “Dirección de casa matriz” del reverso. Los encabezados de Hacienda nunca se usan como datos del cliente.</p>
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
            {!result
              ? <button type="button" className="vat-scan-done" disabled={!ready || reading} onClick={scan}>{reading ? 'Leyendo…' : 'Leer datos'}</button>
              : <button type="button" className="vat-scan-done brand-orange" disabled={!result.ready_for_dte03} onClick={apply}>{result.ready_for_dte03 ? 'Llenar formulario' : 'Datos incompletos'}</button>}
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

function DetectedData({ data }) {
  const items = [['Razón social', data.name], ['NIT', data.nit], ['NRC', data.nrc], ['Actividad / giro', data.business_activity], ['Dirección casa matriz', data.address]]
  return <section className="vat-detected">
    <div><strong>Datos detectados</strong><small>{data.ready_for_dte03 ? 'Datos mínimos DTE-03 completos. Revise antes de aplicar.' : 'OCR incompleto: vuelva a capturar la cara donde falten datos.'}</small></div>
    <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'No reconocido'}</dd></div>)}</dl>
  </section>
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
