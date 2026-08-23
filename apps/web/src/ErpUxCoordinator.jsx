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

const SEARCHABLE_MODULES = new Set([
  'Clientes', 'Productos', 'Cotizaciones', 'Producción', 'Inventario',
  'Facturación', 'Proveedores', 'Compras', 'Caja', 'Agenda', 'Reportes',
])

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

const visiblePanel = () => {
  const panels = [...document.querySelectorAll('.erp-modal-panel')].filter((item) => item.offsetParent !== null)
  return panels[panels.length - 1] || null
}

export default function ErpUxCoordinator() {
  const [activeModule, setActiveModule] = useState('Dashboard')
  const [panel, setPanel] = useState(null)
  const [query, setQuery] = useState('')
  const [candidateCount, setCandidateCount] = useState(0)

  useEffect(() => {
    const detect = () => {
      const nextPanel = visiblePanel()
      setPanel(nextPanel)
      setCandidateCount(nextPanel ? uniqueCandidates(nextPanel).length : 0)
    }
    const onModule = (event) => {
      setActiveModule(event.detail || 'Dashboard')
      setQuery('')
      window.setTimeout(detect, 0)
      window.setTimeout(detect, 80)
      window.setTimeout(detect, 300)
    }

    detect()
    window.addEventListener('idealo-module-change', onModule)
    const observer = new MutationObserver(detect)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('idealo-module-change', onModule)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!panel) return
    const candidates = uniqueCandidates(panel)
    setCandidateCount(candidates.length)
    const normalized = query.trim().toLowerCase()
    candidates.forEach((node) => {
      const matches = !normalized || node.textContent.toLowerCase().includes(normalized)
      node.dataset.erpFiltered = matches ? '0' : '1'
      node.style.display = matches ? '' : 'none'
    })
    return () => candidates.forEach((node) => { delete node.dataset.erpFiltered; node.style.display = '' })
  }, [panel, query])

  if (!panel) return null
  const related = RELATED[activeModule] || []
  const head = panel.querySelector('.erp-modal-head')
  if (!head) return null
  const showSearch = SEARCHABLE_MODULES.has(activeModule)

  const openRelated = (name) => {
    if (!name) return
    const button = [...document.querySelectorAll('.idealo-main-menu-item')].find((item) => item.textContent.trim() === name)
    if (!button) return
    panel.querySelector('.erp-modal-close')?.click()
    window.setTimeout(() => button.click(), 40)
  }

  return createPortal(<div className="erp-global-tools">
    {showSearch && <label className="erp-global-search">
      <span>Buscar</span>
      <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={`Buscar en ${activeModule.toLowerCase()}…`} />
      <small>{candidateCount ? `${candidateCount} registro${candidateCount === 1 ? '' : 's'}` : 'Buscador listo'}</small>
    </label>}
    {related.length > 0 && <select className="erp-related-select" value="" onChange={(event)=>openRelated(event.target.value)} aria-label="Ir a módulo relacionado">
      <option value="">Ir a módulo…</option>
      {related.map((name)=><option value={name} key={name}>{name}</option>)}
    </select>}
  </div>, head)
}
