import { useEffect, useMemo, useState } from 'react'
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

const ACTION_CLUSTER_SELECTORS = [
  '.products360-hero-actions',
  '.quotes360-hero-actions',
  '.inventory360-hero-actions',
  '.toolbar-actions',
  '.panel-actions',
  '.action-row',
  '.erp-module-actions',
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

const findSections = (panel) => [...panel.querySelectorAll('details')]
  .filter((detail) => !detail.closest('.erp-global-tools'))
  .map((detail, index) => ({
    detail,
    label: detail.querySelector(':scope > summary')?.textContent?.trim() || `Sección ${index + 1}`,
  }))

export default function ErpUxCoordinator() {
  const [activeModule, setActiveModule] = useState('Dashboard')
  const [panel, setPanel] = useState(null)
  const [query, setQuery] = useState('')
  const [showAllActions, setShowAllActions] = useState(false)
  const [domVersion, setDomVersion] = useState(0)

  useEffect(() => {
    const onModule = (event) => {
      setActiveModule(event.detail || 'Dashboard')
      setQuery('')
      setShowAllActions(false)
    }
    window.addEventListener('idealo-module-change', onModule)
    return () => window.removeEventListener('idealo-module-change', onModule)
  }, [])

  useEffect(() => {
    const detect = () => {
      const panels = [...document.querySelectorAll('.erp-modal-panel')].filter((item) => item.offsetParent !== null)
      setPanel(panels[panels.length - 1] || null)
      setDomVersion((value) => value + 1)
    }
    detect()
    const observer = new MutationObserver(detect)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','open'] })
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
  }, [panel, query, domVersion])

  useEffect(() => {
    if (!panel) return
    panel.classList.toggle('erp-show-all-actions', showAllActions)
    const clusters = ACTION_CLUSTER_SELECTORS.flatMap((selector) => [...panel.querySelectorAll(selector)])
    clusters.forEach((cluster) => cluster.classList.add('erp-compact-actions'))
    return () => {
      panel.classList.remove('erp-show-all-actions')
      clusters.forEach((cluster) => cluster.classList.remove('erp-compact-actions'))
    }
  }, [panel, showAllActions, domVersion])

  const sections = useMemo(() => panel ? findSections(panel) : [], [panel, domVersion])

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

  const openSection = (detail) => {
    detail.open = true
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const closeAllSections = () => sections.forEach(({ detail }) => { detail.open = false })

  return createPortal(<div className="erp-global-tools">
    {showSearch && <label className="erp-global-search"><span>Buscar</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={`Buscar en ${activeModule.toLowerCase()}…`} /></label>}
    {sections.length > 0 && <details className="erp-tools-menu">
      <summary>Secciones</summary>
      <div className="erp-tools-popover">
        <button type="button" onClick={closeAllSections}>Cerrar todas</button>
        {sections.slice(0,8).map(({detail,label})=><button type="button" key={label} onClick={()=>openSection(detail)}>{label}</button>)}
      </div>
    </details>}
    <details className="erp-tools-menu">
      <summary>Más</summary>
      <div className="erp-tools-popover">
        <button type="button" onClick={()=>setShowAllActions((value)=>!value)}>{showAllActions?'Ocultar acciones secundarias':'Mostrar acciones secundarias'}</button>
        {related.map((name)=><button type="button" key={name} onClick={()=>openRelated(name)}>Ir a {name}</button>)}
      </div>
    </details>
  </div>, head)
}
