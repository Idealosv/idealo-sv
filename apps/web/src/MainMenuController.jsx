import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import { canAccessModule, ERP_MODULES, ROLE_LABEL } from './erp-access-control.js'

const ROUTES = {
  Dashboard: { target: 'workspace', tab: 'Resumen' },
  Clientes: { target: 'workspace', tab: 'Clientes' },
  Productos: { target: 'commercial', tab: 'Productos y trabajos' },
  Cotizaciones: { target: 'commercial', tab: 'Cotizaciones' },
  Producción: { target: 'commercial', tab: 'Producción' },
  Inventario: { target: 'inventory', tab: 'Inventario' },
  Facturación: { target: 'billing', tab: 'resumen' },
  'Cuentas por cobrar': { target: 'billing', tab: 'cobros' },
  Proveedores: { target: 'procurement', tab: 'Proveedores' },
  Compras: { target: 'procurement', tab: 'Compras y gastos' },
  Caja: { target: 'procurement', tab: 'Caja' },
  Agenda: { target: 'planning' },
  Reportes: { target: 'financial' },
  'Asistente IA': { target: 'assistant' },
  Seguridad: { target: 'security' },
}

const PANEL_BY_TARGET = {
  commercial: '.erp-modal-panel[aria-label="Gestión comercial y producción"]',
  inventory: '.erp-modal-panel[aria-label="Inventario, costos y rentabilidad"]',
  billing: '.erp-modal-panel[aria-label="Módulo de facturación"]',
  procurement: '.erp-modal-panel[aria-label="Abastecimiento y finanzas"]',
  planning: '.erp-modal-panel[aria-label="Planificación de producción"]',
  financial: '.erp-modal-panel[aria-label="Reportes financieros"]',
  assistant: '.erp-modal-panel[aria-label="Asistente Inteligente"]',
  security: '.erp-modal-panel[aria-label="Usuarios y Administración"]',
}

const OPEN_RETRIES = [0, 120, 350, 700, 1200, 2000, 3500]
const emitActive = (name) => window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))

export default function MainMenuController() {
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState('Dashboard')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const searchRef = useRef(null)
  const navigationRequest = useRef(0)

  useEffect(() => {
    let cancelled = false
    const findSidebar = () => {
      if (cancelled) return
      const node = document.querySelector('.erp-sidebar')
      if (node) setSidebar(node)
      else window.setTimeout(findSidebar, 100)
    }
    findSidebar()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let live = true
    if (!supabase) return undefined
    const applySession = async (session) => {
      if (!session) { if (live) setRole(''); return }
      const company = window.__IDEALO_ACTIVE_COMPANY__
      let companyId = company?.id || ''
      if (!companyId) {
        const { data } = await supabase.rpc('get_my_companies')
        companyId = data?.[0]?.id || ''
      }
      if (!companyId) { if (live) setRole(''); return }
      const { data, error } = await supabase.from('company_members').select('role').eq('company_id', companyId).eq('user_id', session.user.id).maybeSingle()
      if (live && !error) setRole(String(data?.role || '').toLowerCase())
    }
    supabase.auth.getSession().then(({ data }) => void applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void applySession(session) })
    return () => { live = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const syncActive = (event) => {
      if (ERP_MODULES.includes(event.detail)) setActive(event.detail)
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

  const confirmActive = (name) => {
    setActive(name)
    emitActive(name)
  }

  const openModule = (name) => {
    if (role && !canAccessModule(role, name)) {
      window.dispatchEvent(new CustomEvent('idealo-access-denied', { detail: { message: `${ROLE_LABEL[role] || role} no tiene permiso para ${name}.` } }))
      return
    }

    setQuery('')
    const requestId = ++navigationRequest.current

    if (name === 'App móviles') {
      confirmActive(name)
      return
    }

    const route = ROUTES[name]
    if (!route) return

    if (route.target === 'workspace') {
      window.dispatchEvent(new CustomEvent('idealo-workspace-navigate', { detail: { tab: route.tab, module: name } }))
      window.setTimeout(() => {
        if (navigationRequest.current === requestId) confirmActive(name)
      }, 0)
      return
    }

    const selector = PANEL_BY_TARGET[route.target]
    let confirmed = false

    const confirmPanel = () => {
      if (confirmed || navigationRequest.current !== requestId) return true
      const panel = selector ? document.querySelector(selector) : null
      if (!panel) return false
      confirmed = true
      confirmActive(name)
      return true
    }

    OPEN_RETRIES.forEach((delay) => {
      window.setTimeout(() => {
        if (confirmed || navigationRequest.current !== requestId) return
        window.dispatchEvent(new CustomEvent('idealo-open-module', {
          detail: { target: route.target, tab: route.tab, source: 'main-menu' },
        }))
        window.setTimeout(confirmPanel, 40)
      }, delay)
    })
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
