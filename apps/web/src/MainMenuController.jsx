import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MODULES = ['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad']

const clickWorkspaceModule = (label) => {
  const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
  const button = buttons.find((item) => item.textContent.trim().endsWith(label))
  if (!button) return false
  button.click()
  return true
}

const openLauncher = (selector, tabLabel) => {
  const launcher = document.querySelector(selector)
  if (!launcher) return false
  launcher.click()
  if (tabLabel) window.setTimeout(() => {
    const panels = [...document.querySelectorAll('.erp-modal-panel')]
    const panel = panels[panels.length - 1]
    const tabs = panel ? [...panel.querySelectorAll('.erp-module-tab')] : []
    tabs.find((button) => button.textContent.trim() === tabLabel)?.click()
  }, 30)
  return true
}

const openDirectModule = (target, tab) => {
  window.dispatchEvent(new CustomEvent('idealo-open-module', { detail: { target, tab } }))
  return true
}

export default function MainMenuController() {
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState('Dashboard')
  const [placeholder, setPlaceholder] = useState('')
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    const findSidebar = () => setSidebar(document.querySelector('.erp-sidebar'))
    findSidebar()
    const observer = new MutationObserver(findSidebar)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const syncActive = (event) => {
      if (MODULES.includes(event.detail)) setActive(event.detail)
    }
    window.addEventListener('idealo-module-change', syncActive)
    return () => window.removeEventListener('idealo-module-change', syncActive)
  }, [])

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  const openModule = (name) => {
    setActive(name)
    setPlaceholder('')
    setQuery('')
    window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))

    if (name === 'Dashboard') return clickWorkspaceModule('Resumen')
    if (name === 'App móviles') return true
    if (name === 'Clientes') return clickWorkspaceModule('Clientes')
    if (name === 'Productos') return openDirectModule('commercial', 'Productos y trabajos')
    if (name === 'Cotizaciones') return openDirectModule('commercial', 'Cotizaciones')
    if (name === 'Producción') return openDirectModule('commercial', 'Producción')
    if (name === 'Inventario') return openDirectModule('inventory', 'Inventario')
    if (name === 'Facturación') return openDirectModule('billing', 'resumen')
    if (name === 'Proveedores') return openDirectModule('procurement', 'Proveedores')
    if (name === 'Compras') return openDirectModule('procurement', 'Compras y gastos')
    if (name === 'Caja') return openDirectModule('procurement', 'Caja')
    if (name === 'Agenda') return openLauncher('.sidebar-module-access.planning')
    if (name === 'Reportes') return openLauncher('.sidebar-module-access.financial')
    if (name === 'Seguridad') return clickWorkspaceModule('Empresa')

    setPlaceholder(name)
    return true
  }

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? MODULES.filter((name) => name.toLowerCase().includes(normalized)) : MODULES
  }, [query])

  if (!sidebar) return null

  return createPortal(<>
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      <div className="idealo-menu-search-wrap">
        <input ref={searchRef} className="idealo-menu-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
        {query && <button type="button" className="idealo-menu-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>}
      </div>
      <div className="idealo-menu-list">
        {filteredModules.map((name) => <button type="button" key={name} className={active === name ? 'idealo-main-menu-item active' : 'idealo-main-menu-item'} onClick={() => openModule(name)}>{name}</button>)}
      </div>
      {filteredModules.length === 0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>
    {placeholder && createPortal(<div className="erp-modal-backdrop" onMouseDown={() => setPlaceholder('')}><section className="erp-modal-panel compact-module-placeholder" onMouseDown={(event) => event.stopPropagation()}><header className="erp-modal-head"><div><strong>{placeholder}</strong><small>Módulo principal IDEALO SV</small></div><button type="button" className="erp-modal-close" onClick={() => setPlaceholder('')}>×</button></header><div className="erp-modal-body"><section className="panel module-placeholder-card"><p className="form-kicker">MÓDULO EN ESTRUCTURA</p><h2>{placeholder}</h2><p>Este acceso queda reservado para este módulo dentro de la navegación principal.</p></section></div></section></div>, document.body)}
  </>, sidebar)
}
