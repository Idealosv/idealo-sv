import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const SEARCH_SELECTORS = [
  'tbody tr',
  '.product360-row',
  '.client-row',
  '.inventory-row',
  '.quote-row',
  '.supplier-row',
  '.purchase-row',
  '.cash-row',
  '.processed-dte-row',
  '.dte-row',
  '.timeline-item',
]

const RELATED = {
  Dashboard: ['Clientes','Facturación','Caja','Reportes'],
  Clientes: ['Cotizaciones','Facturación','Agenda'],
  Productos: ['Cotizaciones','Inventario','Producción'],
  Cotizaciones: ['Clientes','Productos','Producción','Facturación'],
  Producción: ['Cotizaciones','Productos','Inventario'],
  Inventario: ['Productos','Compras','Producción'],
  Facturación: ['Clientes','Cotizaciones','Caja','Reportes'],
  Proveedores: ['Compras','Inventario','Caja'],
  Compras: ['Proveedores','Inventario','Caja'],
  Caja: ['Facturación','Compras','Reportes'],
  Agenda: ['Clientes','Cotizaciones'],
  Reportes: ['Facturación','Caja','Dashboard'],
}

const uniqueCandidates = (panel) => {
  const set = new Set()
  SEARCH_SELECTORS.forEach((selector) => panel.querySelectorAll(selector).forEach((node) => set.add(node)))
  return [...set].filter((node) => !node.closest('.erp-global-search'))
}

export default function ErpUxCoordinator() {
  const [activeModule, setActiveModule] = useState('Dashboard')
  const [panel, setPanel] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onModule = (event) => { setActiveModule(event.detail || 'Dashboard'); setQuery('') }
    window.addEventListener('idealo-module-change', onModule)
    return () => window.removeEventListener('idealo-module-change', onModule)
  }, [])

  useEffect(() => {
    const detect = () => {
      const panels = [...document.querySelectorAll('.erp-modal-panel')].filter((item) => item.offsetParent !== null)
      setPanel(panels[panels.length - 1] || null)
    }
    detect()
    const observer = new MutationObserver(detect)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!panel) return
    const candidates = uniqueCandidates(panel)
    const normalized = query.trim().toLowerCase()
    candidates.forEach((node) => {
      const matches = !normalized || node.textContent.toLowerCase().includes(normalized)
      node.dataset.erpFiltered = matches ? '0' : '1'
      node.style.display = matches ? '' : 'none'
    })
    return () => candidates.forEach((node) => { delete node.dataset.erpFiltered; node.style.display = '' })
  }, [panel, query])

  if (!panel) return null
  const candidates = uniqueCandidates(panel)
  const showSearch = candidates.length >= 6
  const related = RELATED[activeModule] || []
  const head = panel.querySelector('.erp-modal-head')
  if (!head) return null

  const openRelated = (name) => {
    const button = [...document.querySelectorAll('.idealo-main-menu-item')].find((item) => item.textContent.trim() === name)
    if (!button) return
    const close = panel.querySelector('.erp-modal-close')
    if (close) close.click()
    window.setTimeout(() => button.click(), 40)
  }

  return createPortal(<div className="erp-global-tools">
    {showSearch && <label className="erp-global-search"><span>Buscar</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={`Buscar en ${activeModule.toLowerCase()}…`} /></label>}
    {related.length > 0 && <div className="erp-related-links" aria-label="Módulos relacionados"><span>Relacionados</span>{related.map((name)=><button type="button" key={name} onClick={()=>openRelated(name)}>{name}</button>)}</div>}
  </div>, head)
}
