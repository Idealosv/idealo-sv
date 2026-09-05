import { useRef, useState } from 'react'
import ProcessedDtePanel from './ProcessedDtePanel.jsx'
import DteTraceabilityPanel from './DteTraceabilityPanel.jsx'

export default function ProcessedDtePanelBridge(props) {
  const hostRef = useRef(null)
  const [controlNumber,setControlNumber]=useState('')

  const handleClickCapture = (event) => {
    const button = event.target.closest?.('.billing-document-link')
    if (!button || !hostRef.current?.contains(button)) return
    const row = button.closest('tr')
    const selectedControl = row?.querySelector('td:first-child small')?.textContent?.trim() || ''
    if (selectedControl) {
      setControlNumber(selectedControl)
      window.dispatchEvent(new CustomEvent('idealo-dte-detail-selected', { detail: { controlNumber: selectedControl } }))
    }
    window.setTimeout(() => {
      const detail = hostRef.current?.querySelector('.billing-document-detail')
      detail?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      detail?.setAttribute('tabindex', '-1')
      detail?.focus({ preventScroll: true })
    }, 80)
  }

  return <div ref={hostRef} onClickCapture={handleClickCapture}>
    <ProcessedDtePanel {...props}/>
    <DteTraceabilityPanel supabase={props.supabase} company={props.company} session={props.session} controlNumber={controlNumber}/>
  </div>
}
