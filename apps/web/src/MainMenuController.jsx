import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MODULES = ['Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad']

const openDirectModule = (target, tab) => {
  window.dispatchEvent(new CustomEvent('idealo-open-module', { detail: { target, tab } }))
  return true
}

export default function MainMenuController() {
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState('Dashboard')
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
    setQuery('')
    window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))

    if (name === 'Dashboard') return openDirectModule('workspace', 'Resumen')
    if (name === 'App móviles') return true
    if (name === 'Clientes') return openDirectModule('workspace', 'Clientes')
    if (name === 'Productos') return openDirectModule('commercial', 'Productos y trabajos')
    if (name === 'Cotizaciones') return openDirectModule('commercial', 'Cotizaciones')
    if (name === 'Producción') return openDirectModule('commercial', 'Producción')
    if (name === 'Inventario') return openDirectModule('inventory', 'Inventario')
    if (name === 'Facturación') return openDirectModule('billing', 'resumen')
    if (name === 'Proveedores') return openDirectModule('procurement', 'Proveedores')
    if (name === 'Compras') return openDirectModule('procurement', 'Compras y gastos')
    if (name === 'Caja') return openDirectModule('procurement', 'Caja')
    if (name === 'Asistente IA') return openDirectModule('assistant')
    if (name === 'Agenda') return openDirectModule('planning')
    if (name === 'Reportes') return openDirectModule('financial')
    if (name === 'Seguridad') return openDirectModule('security')
    return false
  }

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? MODULES.filter((name) => name.toLowerCase().includes(normalized)) : MODULES
  }, [query])

  if (!sidebar) return null

  return createPortal(
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      <div className="idealo-menu-search-wrap">
        <input ref={searchRef} className="idealo-menu-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
        {query && <button type="button" className="idealo-menu-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>}
      </div>
      <div className="idealo-menu-list">
        {filteredModules.map((name) => <button type="button" key={name} className={active === name ? 'idealo-main-menu-item active' : 'idealo-main-menu-item'} onClick={() => openModule(name)}>{name}</button>)}
      </div>
      {filteredModules.length === 0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>,
    sidebar,
  )
}
