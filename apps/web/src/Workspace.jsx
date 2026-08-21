import { useEffect, useState } from 'react'

export default function Workspace({ session, supabase }) {
  const [company, setCompany] = useState(null)
  const [companyName, setCompanyName] = useState('IDEALO SV')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [activeModule, setActiveModule] = useState('Resumen')

  useEffect(() => {
    let active = true

    supabase
      .rpc('get_my_companies')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setFeedback(
            error.message.includes('get_my_companies')
              ? 'Falta instalar el módulo de empresa en Supabase.'
              : 'No pudimos consultar tu empresa.',
          )
        } else {
          setCompany(data?.[0] || null)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [supabase])

  const createCompany = async (event) => {
    event.preventDefault()
    setCreating(true)
    setFeedback('')

    const { data, error } = await supabase.rpc('create_company', {
      company_name: companyName.trim(),
    })

    if (error) {
      setFeedback(error.message || 'No pudimos crear la empresa.')
    } else {
      setCompany(data?.[0] || null)
    }

    setCreating(false)
  }

  const signOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    setSigningOut(false)
  }

  if (loading) {
    return (
      <main className="shell">
        <section className="loading-card">
          <span className="spinner" />
          <p>Preparando tu empresa…</p>
        </section>
      </main>
    )
  }

  if (!company) {
    return (
      <main className="shell">
        <section className="company-onboarding">
          <div className="company-copy">
            <Brand />
            <p className="eyebrow">PRIMERA EMPRESA</p>
            <h1>Crea tu espacio de trabajo.</h1>
            <p className="lead">
              Aquí vivirán tus clientes, servicios, cotizaciones, campañas y
              resultados.
            </p>
            <p className="signed-user">{session.user.email}</p>
          </div>

          <form className="auth-card" onSubmit={createCompany}>
            <div>
              <p className="form-kicker">CONFIGURACIÓN INICIAL</p>
              <h2>Nombre de la empresa</h2>
            </div>

            <label className="field">
              <span>Empresa o agencia</span>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                minLength={2}
                maxLength={80}
                autoFocus
                required
              />
            </label>

            {feedback && (
              <p className="feedback error" role="status">
                {feedback}
              </p>
            )}

            <button type="submit" className="submit-button" disabled={creating}>
              {creating ? 'Creando empresa…' : 'Crear empresa y entrar'}
            </button>

            <button type="button" className="auth-link" onClick={signOut}>
              Usar otra cuenta
            </button>
          </form>
        </section>
      </main>
    )
  }

  const modules = ['Resumen', 'Clientes', 'Servicios', 'Cotizaciones', 'Campañas']

  return (
    <main className="erp-shell">
      <aside className="erp-sidebar">
        <Brand />
        <div className="company-badge">
          <span>{company.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{company.name}</strong>
            <small>Propietario</small>
          </div>
        </div>

        <nav aria-label="Módulos principales">
          {modules.map((module) => (
            <button
              type="button"
              key={module}
              className={activeModule === module ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveModule(module)}
            >
              <span>{moduleIcon(module)}</span>
              {module}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-logout"
          onClick={signOut}
          disabled={signingOut}
        >
          {signingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </aside>

      <section className="erp-content">
        <header className="erp-header">
          <div>
            <p className="form-kicker">IDEALO SV</p>
            <h1>{activeModule}</h1>
          </div>
          <div className="user-chip">
            <span>{displayName(session).charAt(0).toUpperCase()}</span>
            <div>
              <strong>{displayName(session)}</strong>
              <small>{session.user.email}</small>
            </div>
          </div>
        </header>

        {activeModule === 'Resumen' ? (
          <Dashboard company={company} />
        ) : (
          <ModulePreview name={activeModule} />
        )}
      </section>
    </main>
  )
}

function Dashboard({ company }) {
  return (
    <>
      <section className="welcome-strip">
        <div>
          <p className="form-kicker">EMPRESA ACTIVA</p>
          <h2>Bienvenido a {company.name}</h2>
          <p>Tu espacio está preparado para comenzar a registrar operaciones.</p>
        </div>
        <span className="ready-pill">Sistema en línea</span>
      </section>

      <section className="metric-grid">
        <Metric label="Clientes" value="0" note="Listos para registrar" />
        <Metric label="Cotizaciones" value="0" note="Este mes" />
        <Metric label="Campañas activas" value="0" note="Sin pendientes" />
        <Metric label="Ventas" value="$0.00" note="Mes actual" />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="form-kicker">PRÓXIMOS PASOS</p>
              <h3>Completa tu ERP</h3>
            </div>
          </div>
          <div className="check-list">
            <CheckItem done text="Cuenta protegida" />
            <CheckItem done text="Empresa creada" />
            <CheckItem text="Registrar primer cliente" />
            <CheckItem text="Agregar servicios y precios" />
            <CheckItem text="Crear primera cotización" />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="form-kicker">ACTIVIDAD</p>
              <h3>Movimientos recientes</h3>
            </div>
          </div>
          <div className="empty-state">
            <span>↗</span>
            <strong>Todo comienza aquí</strong>
            <p>Los movimientos de tu empresa aparecerán en este espacio.</p>
          </div>
        </article>
      </section>
    </>
  )
}

function ModulePreview({ name }) {
  return (
    <section className="module-preview">
      <span className="module-icon">{moduleIcon(name)}</span>
      <p className="form-kicker">MÓDULO PREPARADO</p>
      <h2>{name}</h2>
      <p>
        La navegación ya está activa. En la siguiente entrega habilitaremos sus
        formularios, listados y operaciones.
      </p>
    </section>
  )
}

function Metric({ label, value, note }) {
  return (
    <article className="metric-card">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  )
}

function CheckItem({ done = false, text }) {
  return (
    <div className="check-item">
      <span className={done ? 'done' : ''}>{done ? '✓' : '○'}</span>
      <p>{text}</p>
    </div>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">I</span>
      <span>IDEALO SV</span>
    </div>
  )
}

function displayName(session) {
  return (
    session.user.user_metadata?.full_name ||
    session.user.email?.split('@')[0] ||
    'Usuario'
  )
}

function moduleIcon(module) {
  return {
    Resumen: '⌂',
    Clientes: '◎',
    Servicios: '◇',
    Cotizaciones: '▤',
    Campañas: '✦',
  }[module]
}
