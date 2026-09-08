import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import { canAccessModule, ERP_MODULES, ROLE_LABEL } from './erp-access-control.js'
import { getNavigationState, requestModule, subscribeNavigation } from './erp-navigation.js'

export default function MainMenuController() {
  const initialNavigation = getNavigationState()
  const [sidebar, setSidebar] = useState(null)
  const [active, setActive] = useState(initialNavigation.activeModule)
  const [pending, setPending] = useState(initialNavigation.status === 'requested' ? initialNavigation.requestedModule : '')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const searchRef = useRef(null)

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

  useEffect(() => subscribeNavigation((navigation) => {
    setActive(navigation.activeModule || 'Dashboard')
    setPending(navigation.status === 'requested' ? navigation.requestedModule : '')
  }), [])

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
      window.dispatchEvent(new CustomEvent('idealo-access-denied', { detail: { message: `${ROLE_LABEL[role] || role} no tiene permiso para ${name}.` } }))
      return
    }
    setQuery('')
    requestModule(name, { source: 'main-menu' })
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
          const className = [
            'idealo-main-menu-item',
            active === name ? 'active' : '',
            pending === name ? 'pending' : '',
            allowed ? '' : 'locked',
          ].filter(Boolean).join(' ')
          return <button type="button" key={name} aria-disabled={!allowed} aria-current={active === name ? 'page' : undefined} className={className} onClick={() => openModule(name)}>{name}{!allowed && <small>Sin acceso</small>}</button>
        })}
      </div>
      {filteredModules.length === 0 && <div className="idealo-menu-empty">No hay módulos con ese nombre.</div>}
    </nav>,
    sidebar,
  )
}
