import { useCallback, useEffect, useMemo, useState } from 'react'
import Workspace from './Workspace.jsx'

const RETRY_DELAYS = [0, 450, 1200]

export default function SafeWorkspaceGate({ session, supabase }) {
  const [status, setStatus] = useState('checking')
  const [companies, setCompanies] = useState([])
  const [message, setMessage] = useState('')

  const loadCompanies = useCallback(async () => {
    setStatus('checking')
    setMessage('')

    let lastError = null

    for (const delay of RETRY_DELAYS) {
      if (delay) await wait(delay)
      try {
        const { data, error } = await supabase.rpc('get_my_companies')
        if (!error) {
          setCompanies(Array.isArray(data) ? data : [])
          setStatus('ready')
          return
        }
        lastError = error
      } catch (error) {
        lastError = error
      }
    }

    try {
      const { data, error } = await supabase
        .from('company_members')
        .select('company_id, role, companies(id, name, slug)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(10)

      if (!error) {
        const recovered = (data || [])
          .map((membership) => {
            const company = Array.isArray(membership.companies)
              ? membership.companies[0]
              : membership.companies
            return company ? { ...company, role: membership.role } : null
          })
          .filter(Boolean)

        setCompanies(recovered)
        setStatus('ready')
        return
      }
      lastError = error
    } catch (error) {
      lastError = error
    }

    console.error('No se pudo resolver la empresa del usuario', lastError)
    setMessage('No pudimos consultar tu empresa en este momento. Tu empresa y tus datos siguen guardados. Intenta nuevamente.')
    setStatus('error')
  }, [session.user.id, supabase])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await loadCompanies()
    }
    run()
    return () => {
      cancelled = true
    }
  }, [loadCompanies])

  const safeSupabase = useMemo(() => new Proxy(supabase, {
    get(target, property) {
      if (property === 'rpc') {
        return (functionName, args, options) => {
          if (functionName === 'get_my_companies') {
            return Promise.resolve({ data: companies, error: null })
          }
          return target.rpc(functionName, args, options)
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }), [companies, supabase])

  if (status === 'checking') {
    return (
      <main className="shell">
        <section className="loading-card">
          <span className="spinner" />
          <p>Verificando tu empresa…</p>
        </section>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="shell auth-shell">
        <section className="auth-layout">
          <div className="auth-intro">
            <Brand />
            <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
            <h1>No vamos a crear otra empresa.</h1>
            <p className="lead">La consulta falló temporalmente. Por seguridad, el ERP bloquea la pantalla de creación hasta confirmar si ya tienes una empresa.</p>
          </div>
          <div className="auth-card">
            <div>
              <p className="form-kicker">EMPRESA PROTEGIDA</p>
              <h2>Reintentar conexión</h2>
            </div>
            <p className="feedback error" role="status">{message}</p>
            <button type="button" className="submit-button" onClick={loadCompanies}>Reintentar</button>
            <button type="button" className="auth-link" onClick={() => supabase.auth.signOut()}>Usar otra cuenta</button>
          </div>
        </section>
      </main>
    )
  }

  return <Workspace session={session} supabase={safeSupabase} />
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">I</span>
      <span>IDEALO SV</span>
    </div>
  )
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
