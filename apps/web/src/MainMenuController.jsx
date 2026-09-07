import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import { canAccessModule, ERP_MODULES, ROLE_LABEL } from './erp-access-control.js'

const emitModule = (target, tab) => {
  const detail = { target, tab }
  window.dispatchEvent(new CustomEvent('idealo-open-module', { detail }))
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('idealo-open-module', { detail })), 120)
  return true
}

const openWorkspaceTab = (tab) => {
  const buttons = [...document.querySelectorAll('.erp-sidebar nav .nav-item')]
  const button = buttons.find(node => node.textContent?.trim().endsWith(tab))
  if (button) button.click()
  return emitModule('workspace', tab)
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
    const applySession = async session => {
      if (!session) {
        if (live) setRole('')
        return
      }
      const { data: companies, error: companyError } = await supabase.rpc('get_my_companies')
      if (companyError || !companies?.[0]?.id) {
        if (live) setRole('')
        return
      }
      const { data, error } = await supabase.from('company_members').select('role').eq('company_id', companies[0].id).eq('user_id', session.user.id).maybeSingle()
      if (live && !error) setRole(String(data?.role || '').toLowerCase())
    }
    supabase.auth.getSession().then(({ data }) => void applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void applySession(session) })
    return () => { live = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const hidePrivateIdentity = () => {
      const chip = document.querySelector('.user-chip')
      if (!chip) return
      const initial = chip.querySelector(':scope > span')
      const name = chip.querySelector('strong')
      const email = chip.querySelector('small')
      if (initial) initial.textContent = 'A'
      if (name) name.textContent = 'Administrador'
      if (email) email.textContent = 'IDEALO SV'
    }
    hidePrivateIdentity()
    const retry1 = window.setTimeout(hidePrivateIdentity, 150)
    const retry2 = window.setTimeout(hidePrivateIdentity, 700)
    return () => {
      window.clearTimeout(retry1)
      window.clearTimeout(retry2)
    }
  }, [sidebar])

  useEffect(() => {
    const syncActive = event => { if (ERP_MODULES.includes(event.detail)) setActive(event.detail) }
    window.addEventListener('idealo-module-change', syncActive)
    return () => window.removeEventListener('idealo-module-change', syncActive)
  }, [])

  useEffect(() => {
    const shortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  const openModule = name => {
    if (role && !canAccessModule(role, name)) {
      window.dispatchEvent(new CustomEvent('idealo-access-denied', { detail: { message: `${ROLE_LABEL[role] || role} no tiene permiso para ${name}.` } }))
      return false
    }
    setActive(name)
    setQuery('')
    window.dispatchEvent(new CustomEvent('idealo-module-change', { detail: name }))
    if (name === 'Dashboard') return openWorkspaceTab('Resumen')
    if (name === 'App móviles') return emitModule('mobile')
    if (name === 'Clientes') return openWorkspaceTab('Clientes')
    if (name === 'Productos') return emitModule('commercial', 'Productos y trabajos')
    if (name === 'Cotizaciones') return emitModule('commercial', 'Cotizaciones')
    if (name === 'Producción') return emitModule('commercial', 'Producción')
    if (name === 'Inventario') return emitModule('inventory', 'Inventario')
    if (name === 'Facturación') return emitModule('billing', 'resumen')
    if (name === 'Cuentas por cobrar') return emitModule('billing', 'cobros')
    if (name === 'Proveedores') return emitModule('procurement', 'Proveedores')
    if (name === 'Compras') return emitModule('procurement', 'Compras y gastos')
    if (name === 'Caja') return emitModule('procurement', 'Caja')
    if (name === 'Asistente IA') return emitModule('assistant')
    if (name === 'Agenda') return emitModule('planning')
    if (name === 'Reportes') return emitModule('financial')
    if (name === 'Seguridad') return emitModule('security')
    return false
  }

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? ERP_MODULES.filter(name => name.toLowerCase().includes(normalized)) : ERP_MODULES
  }, [query])

  if (!sidebar) return null

  return createPortal(
    <nav className="idealo-main-menu" aria-label="Módulos principales IDEALO SV">
      <div className="idealo-menu-search-wrap">
        <input ref={searchRef} className="idealo-menu-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" />
        {query && <button type="button" className="idealo-menu-search-clear" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>}
      </div>
      {role && <div className="idealo-role-strip"><span>Perfil</span><strong>{ROLE_LABEL[role] || role}</strong></div>}
      <div className="idealo-menu-list">
        {filteredModules.map(name => {
          const allowed = !role || canAccessModule(role, name)
          return <button type="button" key={name} aria-disabled={!allowed} className={`${active === name ? 'idealo-main-menu-item active' : 'idealo-main-menu-item'}${allowed ? '' : ' locked'}`} onClick={() => openModule(name)}>{name}{!allowed && <small>Sin acceso</small>}</button>
        })}
      </div>
      {filteredModules.length === 0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>,
    sidebar,
  )
}
