import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } }) : null

export default function SecurityLauncher() {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(null)

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onOpen = (event) => {
      const detail = event.detail || {}
      if (detail.target !== 'security') return
      setOpen(true)
    }
    window.addEventListener('idealo-open-module', onOpen)
    return () => window.removeEventListener('idealo-open-module', onOpen)
  }, [])

  if (!open) return null

  return <div className="erp-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
    <section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Seguridad" onMouseDown={(event) => event.stopPropagation()}>
      <header className="erp-modal-head">
        <div><strong>Seguridad</strong><small>Acceso, sesión y controles del ERP</small></div>
        <button type="button" className="erp-modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
      </header>
      <div className="erp-modal-body">
        <section className="panel">
          <p className="form-kicker">ESTADO DE ACCESO</p>
          <h2>Seguridad de la cuenta</h2>
          <div className="metric-grid">
            <article className="metric-card"><small>Sesión</small><strong>{session ? 'Activa' : 'No disponible'}</strong><span>Autenticación administrada por Supabase</span></article>
            <article className="metric-card"><small>Usuario</small><strong>{session?.user?.email || 'Sin sesión'}</strong><span>Identidad de la sesión actual</span></article>
            <article className="metric-card"><small>Datos</small><strong>Aislados</strong><span>Operaciones filtradas por empresa</span></article>
            <article className="metric-card"><small>Credenciales DTE</small><strong>Servidor</strong><span>No se exponen en esta interfaz</span></article>
          </div>
          <p className="feedback success">Este módulo concentra el estado de seguridad sin reutilizar ni renombrar la pantalla fiscal de Empresa.</p>
        </section>
      </div>
    </section>
  </div>
}
