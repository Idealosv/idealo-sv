import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const MODULES = [
  'Dashboard','App móviles','Clientes','Productos','Cotizaciones','Producción','Inventario','Facturación','Proveedores','Compras','Caja','Asistente IA','Agenda','Reportes','Seguridad',
]

const clickWorkspaceModule = (label) => {
  const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
  const button = buttons.find((item) => item.textContent.trim().endsWith(label))
  if (!button) return false
  button.click()
  return true
}

const openLauncher = (selector, tabLabel, attempt = 0) => {
  const launcher = document.querySelector(selector)
  if (!launcher) {
    if (attempt < 60) window.setTimeout(() => openLauncher(selector, tabLabel, attempt + 1), 50)
    return false
  }
  launcher.click()
  if (tabLabel) window.setTimeout(() => {
    const panels = [...document.querySelectorAll('.erp-modal-panel')]
    const panel = panels[panels.length - 1]
    const tabs = panel ? [...panel.querySelectorAll('.erp-module-tab')] : []
    tabs.find((button) => button.textContent.trim() === tabLabel)?.click()
  }, 60)
  return true
}

export default function MainMenuController() {
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState('Dashboard')
  const [placeholder, setPlaceholder] = useState('')

  useEffect(() => {
    const findSidebar = () => setSidebar(document.querySelector('.erp-sidebar'))
    findSidebar()
    const observer = new MutationObserver(findSidebar)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const openModule = (name) => {
    setActive(name); setPlaceholder('')
    window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))
    if (name === 'Dashboard') return clickWorkspaceModule('Resumen')
    if (name === 'App móviles') return true
    if (name === 'Clientes') return clickWorkspaceModule('Clientes')
    if (name === 'Productos') return openLauncher('.sidebar-module-access.commercial', 'Productos y trabajos')
    if (name === 'Cotizaciones') return openLauncher('.sidebar-module-access.commercial', 'Cotizaciones')
    if (name === 'Producción') return openLauncher('.sidebar-module-access.commercial', 'Producción')
    if (name === 'Inventario') return openLauncher('.sidebar-module-access.inventory')
    if (name === 'Facturación') return true
    if (name === 'Proveedores') return openLauncher('.sidebar-module-access.procurement', 'Proveedores')
    if (name === 'Compras') return openLauncher('.sidebar-module-access.procurement', 'Compras y gastos')
    if (name === 'Caja') return openLauncher('.sidebar-module-access.procurement', 'Caja')
    if (name === 'Agenda') return openLauncher('.sidebar-module-access.planning')
    if (name === 'Reportes') return openLauncher('.sidebar-module-access.financial')
    if (name === 'Seguridad') return clickWorkspaceModule('Empresa')
    setPlaceholder(name)
  }

  if (!sidebar) return null
  return createPortal(<>
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      {MODULES.map(name => <button type="button" key={name} className={active===name?'idealo-main-menu-item active':'idealo-main-menu-item'} onClick={()=>openModule(name)}>{name}</button>)}
    </nav>
    {placeholder && createPortal(<div className="erp-modal-backdrop" onMouseDown={()=>setPlaceholder('')}><section className="erp-modal-panel compact-module-placeholder" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>{placeholder}</strong><small>Módulo principal IDEALO SV</small></div><button type="button" className="erp-modal-close" onClick={()=>setPlaceholder('')}>×</button></header><div className="erp-modal-body"><section className="panel module-placeholder-card"><p className="form-kicker">ESTRUCTURA DEFINIDA</p><h2>{placeholder}</h2><p>Este módulo ya ocupa su posición definitiva en el menú principal y se desarrollará sobre esta misma estructura sin agregar accesos adicionales al lateral.</p></section></div></section></div>,document.body)}
  </>,sidebar)
}
