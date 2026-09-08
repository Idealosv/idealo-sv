import { useRef } from 'react'
import ProcessedDtePanel from './ProcessedDtePanel.jsx'

export default function ProcessedDtePanelBridge(props) {
  const hostRef = useRef(null)

  const handleClickCapture = (event) => {
    const button = event.target.closest?.('.billing-document-link')
    if (!button || !hostRef.current?.contains(button)) return
    const row = button.closest('tr')
    const controlNumber = row?.querySelector('td:first-child small')?.textContent?.trim() || ''
    if (controlNumber) window.dispatchEvent(new CustomEvent('idealo-dte-detail-selected', { detail: { controlNumber } }))
    window.setTimeout(() => {
      const detail = hostRef.current?.querySelector('.billing-document-detail')
      detail?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      detail?.setAttribute('tabindex', '-1')
      detail?.focus({ preventScroll: true })
    }, 80)
  }

  return <div ref={hostRef} onClickCapture={handleClickCapture}>
    <ProcessedDtePanel {...props}/>
  </div>
}
