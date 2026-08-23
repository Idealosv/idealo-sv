import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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

  useEffect(() => () => {
    if (front?.url) URL.revokeObjectURL(front.url)
    if (back?.url) URL.revokeObjectURL(back.url)
  }, [front, back])

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
  }

  const ready = Boolean(front && back)

  return (
    <>
      <div className="vat-scan-toolbar">
        <div>
          <strong>Tarjeta IVA</strong>
          <small>{ready ? 'Frente y reverso capturados' : 'Escanee las dos caras del documento'}</small>
        </div>
        <button type="button" className="vat-scan-trigger" onClick={() => setOpen(true)}>
          {ready ? '✓ Tarjeta IVA 2/2' : '▣ Escanear tarjeta IVA'}
        </button>
      </div>

      {open && createPortal(
        <div className="vat-scan-backdrop" role="dialog" aria-modal="true" aria-label="Escanear tarjeta IVA">
          <section className="vat-scan-dialog">
            <header>
              <div><small>CLIENTES · FISCAL DTE</small><h3>Escanear tarjeta IVA</h3></div>
              <button type="button" className="vat-scan-close" onClick={() => setOpen(false)}>×</button>
            </header>
            <p className="vat-scan-help">Capture primero el frente y después el reverso. En celular se abrirá la cámara; en computadora puede seleccionar una imagen.</p>
            <div className="vat-scan-grid">
              <SideCapture side="front" title="1. Frente" item={front} onFile={(file) => capture('front', file)} />
              <SideCapture side="back" title="2. Reverso" item={back} onFile={(file) => capture('back', file)} />
            </div>
            <div className="vat-scan-status"><strong>{ready ? '2/2 caras listas' : `${front ? 1 : 0 + (back ? 1 : 0)}/2 caras listas`}</strong><span>Las imágenes permanecen temporalmente en esta pantalla y no se guardan solas.</span></div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cerrar</button>
              <button type="button" className="vat-scan-done" disabled={!ready} onClick={() => setOpen(false)}>Usar ambas capturas</button>
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
