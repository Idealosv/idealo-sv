import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import { canAccessModule, ERP_MODULES, ROLE_LABEL } from './erp-access-control.js'

const MODULE_RETRY_DELAYS = [0, 120, 350, 700, 1200, 2000, 3200, 5000]
const LAUNCHER_BY_TARGET = {
  commercial: '.sidebar-module-access.commercial',
  inventory: '.sidebar-module-access.inventory',
  billing: '.sidebar-module-access.billing',
  procurement: '.sidebar-module-access.procurement',
  planning: '.sidebar-module-access.planning',
  financial: '.sidebar-module-access.financial',
  assistant: '.sidebar-module-access.assistant',
  security: '.sidebar-module-access.security',
}

const notifyActive = (name) => {
  if (!name) return
  window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))
}

const openDirectModule = (target, tab, activeName) => {
  const detail = { target, tab }
  let opened = false

  const attempt = () => {
    if (target === 'workspace') {
      const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
      const button = buttons.find((node) => node.textContent?.trim().endsWith(tab || ''))
      if (button) {
        button.click()
        notifyActive(activeName)
        opened = true
        return
      }
      window.dispatchEvent(new CustomEvent('idealo-open-module', { detail }))
      return
    }

    const selector = LAUNCHER_BY_TARGET[target]
    const launcher = selector ? document.querySelector(selector) : null
    if (!launcher) {
      window.dispatchEvent(new CustomEvent('idealo-open-module', { detail }))
      return
    }

    launcher.click()
    window.dispatchEvent(new CustomEvent('idealo-open-module', { detail }))
    notifyActive(activeName)
    opened = true
  }

  MODULE_RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(() => {
      if (!opened) attempt()
    }, delay)
  })
  return true
}

export default function MainMenuController() {
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState('Dashboard')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const findSidebar = () => {
      if (cancelled) return
      const node = document.querySelector('.erp-sidebar')
      if (node) return setSidebar(node)
      attempts += 1
      if (attempts < 20) window.setTimeout(findSidebar, 100)
    }
    findSidebar()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let live = true
    if (!supabase) return undefined
    const applySession = async (session) => {
      if (!session) { if (live) setRole(''); return }
      const { data: companies, error: companyError } = await supabase.rpc('get_my_companies')
      if (companyError || !companies?.[0]?.id) { if (live) setRole(''); return }
      const { data, error } = await supabase.from('company_members').select('role').eq('company_id',companies[0].id).eq('user_id', session.user.id).maybeSingle()
      if (live && !error) setRole(String(data?.role || '').toLowerCase())
    }
    supabase.auth.getSession().then(({ data }) => void applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void applySession(session) })
    return () => { live = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const syncActive = (event) => { if (ERP_MODULES.includes(event.detail)) setActive(event.detail) }
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

  const markActive = (name) => {
    setActive(name)
    notifyActive(name)
  }

  const openModule = (name) => {
    if (role && !canAccessModule(role, name)) {
      window.dispatchEvent(new CustomEvent('idealo-access-denied', { detail: { message: `${ROLE_LABEL[role] || role} no tiene permiso para ${name}.` } }))
      return false
    }
    setQuery('')
    if (name === 'Dashboard') return openDirectModule('workspace', 'Resumen', name)
    if (name === 'App móviles') { markActive(name); return true }
    if (name === 'Clientes') return openDirectModule('workspace', 'Clientes', name)
    if (name === 'Productos') return openDirectModule('commercial', 'Productos y trabajos', name)
    if (name === 'Cotizaciones') return openDirectModule('commercial', 'Cotizaciones', name)
    if (name === 'Producción') return openDirectModule('commercial', 'Producción', name)
    if (name === 'Inventario') return openDirectModule('inventory', 'Inventario', name)
    if (name === 'Facturación') return openDirectModule('billing', 'resumen', name)
    if (name === 'Cuentas por cobrar') return openDirectModule('billing', 'cobros', name)
    if (name === 'Proveedores') return openDirectModule('procurement', 'Proveedores', name)
    if (name === 'Compras') return openDirectModule('procurement', 'Compras y gastos', name)
    if (name === 'Caja') return openDirectModule('procurement', 'Caja', name)
    if (name === 'Agenda') return openDirectModule('planning', undefined, name)
    if (name === 'Reportes') return openDirectModule('financial', undefined, name)
    if (name === 'Asistente IA') return openDirectModule('assistant', undefined, name)
    if (name === 'Seguridad') return openDirectModule('security', undefined, name)
    return false
  }

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? ERP_MODULES.filter((name) => name.toLowerCase().includes(normalized)) : ERP_MODULES
  }, [query])

  if (!sidebar) return null

  return createPortal(
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      <div className="idealo-menu-search-wrap">
        <input ref={searchRef} className="idealo-menu-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
        {query && <button type="button" className="idealo-menu-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>}
      </div>
      {role && <div className="idealo-role-strip"><span>Perfil</span><strong>{ROLE_LABEL[role] || role}</strong></div>}
      <div className="idealo-menu-list">
        {filteredModules.map((name) => {
          const allowed = !role || canAccessModule(role, name)
          return <button type="button" key={name} aria-disabled={!allowed} className={`${active === name ? 'idealo-main-menu-item active' : 'idealo-main-menu-item'}${allowed ? '' : ' locked'}`} onClick={() => openModule(name)}>{name}{!allowed && <small>Sin acceso</small>}</button>
        })}
      </div>
      {filteredModules.length === 0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>,
    sidebar,
  )
}
