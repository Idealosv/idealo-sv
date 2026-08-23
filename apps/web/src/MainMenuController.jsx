import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MODULE_GROUPS = [
  { label: 'Principal', modules: ['Dashboard','App móviles'] },
  { label: 'Ventas', modules: ['Clientes','Productos','Cotizaciones','Facturación'] },
  { label: 'Operación', modules: ['Producción','Inventario'] },
  { label: 'Compras y caja', modules: ['Proveedores','Compras','Caja'] },
  { label: 'Gestión', modules: ['Asistente IA','Agenda','Reportes'] },
  { label: 'Administración', modules: ['Seguridad'] },
]

const groupForModule = (name) => MODULE_GROUPS.find((group) => group.modules.includes(name))?.label || 'Principal'

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

export default function MainMenuController() {
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState('Dashboard')
  const [placeholder, setPlaceholder] = useState('')
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState(() => new Set(['Principal']))
  const searchRef = useRef(null)

  useEffect(() => {
    const findSidebar = () => setSidebar(document.querySelector('.erp-sidebar'))
    findSidebar()
    const observer = new MutationObserver(findSidebar)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
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
    setActive(name); setPlaceholder(''); setQuery('')
    setOpenGroups(new Set([groupForModule(name)]))
    window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:name}))
    if (name === 'Dashboard') return clickWorkspaceModule('Resumen')
    if (name === 'App móviles') return true
    if (name === 'Clientes') return clickWorkspaceModule('Clientes')
    if (name === 'Productos') return openLauncher('.sidebar-module-access.commercial', 'Productos y trabajos')
    if (name === 'Cotizaciones') return openLauncher('.sidebar-module-access.commercial', 'Cotizaciones')
    if (name === 'Producción') return openLauncher('.sidebar-module-access.commercial', 'Producción')
    if (name === 'Inventario') return openLauncher('.sidebar-module-access.inventory')
    if (name === 'Facturación') return openLauncher('.sidebar-module-access.billing')
    if (name === 'Proveedores') return openLauncher('.sidebar-module-access.procurement', 'Proveedores')
    if (name === 'Compras') return openLauncher('.sidebar-module-access.procurement', 'Compras y gastos')
    if (name === 'Caja') return openLauncher('.sidebar-module-access.procurement', 'Caja')
    if (name === 'Agenda') return openLauncher('.sidebar-module-access.planning')
    if (name === 'Reportes') return openLauncher('.sidebar-module-access.financial')
    if (name === 'Seguridad') return clickWorkspaceModule('Empresa')
    setPlaceholder(name)
  }

  const toggleGroup = (label) => {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else {
        next.clear()
        next.add(label)
      }
      return next
    })
  }

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return MODULE_GROUPS
    return MODULE_GROUPS.map((group) => ({
      ...group,
      modules: group.modules.filter((name) => name.toLowerCase().includes(normalized)),
    })).filter((group) => group.modules.length)
  }, [query])

  if (!sidebar) return null
  return createPortal(<>
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      <div className="idealo-menu-search-wrap">
        <input ref={searchRef} className="idealo-menu-search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
        {query && <button type="button" className="idealo-menu-search-clear" onClick={()=>setQuery('')} aria-label="Limpiar búsqueda">×</button>}
      </div>
      {groups.map((group) => {
        const expanded = Boolean(query) || openGroups.has(group.label)
        return <section className={`idealo-menu-group ${expanded ? 'open' : ''}`} key={group.label}>
          <button type="button" className="idealo-menu-group-toggle" onClick={()=>toggleGroup(group.label)} aria-expanded={expanded}>
            <span>{group.label}</span><span className="idealo-menu-group-chevron">⌄</span>
          </button>
          {expanded && <div className="idealo-menu-group-items">
            {group.modules.map(name => <button type="button" key={name} className={active===name?'idealo-main-menu-item active':'idealo-main-menu-item'} onClick={()=>openModule(name)}>{name}</button>)}
          </div>}
        </section>
      })}
      {groups.length===0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>
    {placeholder && createPortal(<div className="erp-modal-backdrop" onMouseDown={()=>setPlaceholder('')}><section className="erp-modal-panel compact-module-placeholder" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>{placeholder}</strong><small>Módulo principal IDEALO SV</small></div><button type="button" className="erp-modal-close" onClick={()=>setPlaceholder('')}>×</button></header><div className="erp-modal-body"><section className="panel module-placeholder-card"><p className="form-kicker">ESTRUCTURA DEFINIDA</p><h2>{placeholder}</h2><p>Este módulo ya ocupa su posición definitiva en el menú principal y se desarrollará sobre esta misma estructura sin agregar accesos adicionales al lateral.</p></section></div></section></div>,document.body)}
  </>,sidebar)
}
