import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import { canAccessModule, ERP_MODULES, ROLE_LABEL } from './erp-access-control.js'

const MODULE_RETRY_DELAYS = [0, 120, 350, 700, 1200, 2000, 3200, 5000]

const openDirectModule = (target, tab) => {
  if (target === 'workspace' && tab) {
    const buttons = [...document.querySelectorAll('.erp-sidebar nav .nav-item')]
    const button = buttons.find((node) => node.textContent?.trim().endsWith(tab))
    button?.click()
  }
  const detail = { target, tab }
  MODULE_RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('idealo-open-module', { detail })), delay)
  })
  return true
}

const openBillingModule = (tab = 'resumen') => {
  const detail = { target: 'billing', tab }
  MODULE_RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(() => {
      const launcher = document.querySelector('.sidebar-module-access.billing')
      const modalOpen = Boolean(document.querySelector('.erp-modal-panel.billing-modal'))
      if (launcher && !modalOpen) launcher.click()
      window.dispatchEvent(new CustomEvent('idealo-open-module', { detail }))
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
    window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))
  }

  const openModule = (name) => {
    if (role && !canAccessModule(role, name)) {
      window.dispatchEvent(new CustomEvent('idealo-access-denied', { detail: { message: `${ROLE_LABEL[role] || role} no tiene permiso para ${name}.` } }))
      return false
    }
    setQuery('')
    if (name === 'Dashboard') { openDirectModule('workspace', 'Resumen'); markActive(name); return true }
    if(name==='App móviles'){markActive(name);return true}
    if (name === 'Clientes') { openDirectModule('workspace', 'Clientes'); markActive(name); return true }
    if (name === 'Productos') { openDirectModule('commercial', 'Productos y trabajos'); markActive(name); return true }
    if (name === 'Cotizaciones') { openDirectModule('commercial', 'Cotizaciones'); markActive(name); return true }
    if (name === 'Producción') { openDirectModule('commercial', 'Producción'); markActive(name); return true }
    if (name === 'Inventario') { openDirectModule('inventory', 'Inventario'); markActive(name); return true }
    if (name === 'Facturación') { openBillingModule('resumen'); markActive(name); return true }
    if (name === 'Cuentas por cobrar') { openBillingModule('cobros'); markActive(name); return true }
    if (name === 'Proveedores') { openDirectModule('procurement', 'Proveedores'); markActive(name); return true }
    if (name === 'Compras') { openDirectModule('procurement', 'Compras y gastos'); markActive(name); return true }
    if (name === 'Caja') { openDirectModule('procurement', 'Caja'); markActive(name); return true }
    if (name === 'Agenda') { openDirectModule('planning'); markActive(name); return true }
    if (name === 'Reportes') { openDirectModule('financial'); markActive(name); return true }
    if (name === 'Asistente IA') { openDirectModule('assistant'); markActive(name); return true }
    if (name === 'Seguridad') { openDirectModule('security'); markActive(name); return true }
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
