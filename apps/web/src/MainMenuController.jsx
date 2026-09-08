import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import { canAccessModule, ERP_MODULES, ROLE_LABEL } from './erp-access-control.js'

const RETRY_DELAYS = [0, 80, 180, 350, 700, 1200, 2000, 3200, 5000, 7500]

const ROUTES = {
  Dashboard: { target: 'workspace', tab: 'Resumen' },
  Clientes: { target: 'workspace', tab: 'Clientes' },
  Productos: { target: 'commercial', tab: 'Productos y trabajos', launcher: '.sidebar-module-access.commercial' },
  Cotizaciones: { target: 'commercial', tab: 'Cotizaciones', launcher: '.sidebar-module-access.commercial' },
  Producción: { target: 'commercial', tab: 'Producción', launcher: '.sidebar-module-access.commercial' },
  Inventario: { target: 'inventory', tab: 'Inventario', launcher: '.sidebar-module-access.inventory' },
  Facturación: { target: 'billing', tab: 'resumen', launcher: '.sidebar-module-access.billing' },
  'Cuentas por cobrar': { target: 'billing', tab: 'cobros', launcher: '.sidebar-module-access.billing' },
  Proveedores: { target: 'procurement', tab: 'Proveedores', launcher: '.sidebar-module-access.procurement' },
  Compras: { target: 'procurement', tab: 'Compras y gastos', launcher: '.sidebar-module-access.procurement' },
  Caja: { target: 'procurement', tab: 'Caja', launcher: '.sidebar-module-access.procurement' },
  Agenda: { target: 'planning', launcher: '.sidebar-module-access.planning' },
  Reportes: { target: 'financial', launcher: '.sidebar-module-access.financial' },
  'Asistente IA': { target: 'assistant', launcher: '.sidebar-module-access.assistant' },
  Seguridad: { target: 'security', launcher: '.sidebar-module-access.security' },
}

function emitOpen(detail) {
  window.dispatchEvent(new CustomEvent('idealo-open-module', { detail }))
}

function notifyActive(name) {
  window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))
}

function clickWorkspaceTab(tab) {
  if (!tab) return false
  const buttons = [...document.querySelectorAll('.erp-sidebar > nav:not(.idealo-main-menu) .nav-item')]
  const button = buttons.find((node) => node.textContent?.trim().endsWith(tab))
  if (!button) return false
  button.click()
  return true
}

function openRoute(name) {
  const route = ROUTES[name]
  if (!route) return false

  const detail = { target: route.target, tab: route.tab }

  // Acción inmediata y determinista: primero intentamos abrir el receptor real.
  if (route.target === 'workspace') {
    clickWorkspaceTab(route.tab)
  } else if (route.launcher) {
    const launcher = document.querySelector(route.launcher)
    if (launcher && !document.querySelector('.erp-modal-backdrop')) launcher.click()
  }

  // El evento es la fuente única de navegación interna. Se reintenta para cubrir
  // carga diferida de los módulos sin depender de MutationObserver ni del DOM oculto.
  RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(() => {
      if (route.target === 'workspace') clickWorkspaceTab(route.tab)
      emitOpen(detail)
    }, delay)
  })

  notifyActive(name)
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
      if (attempts < 40) window.setTimeout(findSidebar, 100)
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
      const { data, error } = await supabase
        .from('company_members')
        .select('role')
        .eq('company_id', companies[0].id)
        .eq('user_id', session.user.id)
        .maybeSingle()
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

  const openModule = (name) => {
    if (role && !canAccessModule(role, name)) {
      window.dispatchEvent(new CustomEvent('idealo-access-denied', {
        detail: { message: `${ROLE_LABEL[role] || role} no tiene permiso para ${name}.` },
      }))
      return false
    }

    setQuery('')
    setActive(name)

    if (name === 'App móviles') {
      notifyActive(name)
      return true
    }

    return openRoute(name)
  }

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? ERP_MODULES.filter((name) => name.toLowerCase().includes(normalized))
      : ERP_MODULES
  }, [query])

  if (!sidebar) return null

  return createPortal(
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      <div className="idealo-menu-search-wrap">
        <input
          ref={searchRef}
          className="idealo-menu-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar módulo…"
          aria-label="Buscar módulo"
        />
        {query && (
          <button type="button" className="idealo-menu-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>
        )}
      </div>
      {role && (
        <div className="idealo-role-strip"><span>Perfil</span><strong>{ROLE_LABEL[role] || role}</strong></div>
      )}
      <div className="idealo-menu-list">
        {filteredModules.map((name) => {
          const allowed = !role || canAccessModule(role, name)
          return (
            <button
              type="button"
              key={name}
              aria-disabled={!allowed}
              className={`${active === name ? 'idealo-main-menu-item active' : 'idealo-main-menu-item'}${allowed ? '' : ' locked'}`}
              onClick={() => openModule(name)}
            >
              {name}{!allowed && <small>Sin acceso</small>}
            </button>
          )
        })}
      </div>
      {filteredModules.length === 0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>,
    sidebar,
  )
}
