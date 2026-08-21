import { useEffect, useMemo, useState } from 'react'

export default function ErpApp({ session, supabase }) {
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [clientFormOpen, setClientFormOpen] = useState(false)
  const [feedback, setFeedback] = useState('')

  const loadWorkspace = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('company_members')
      .select('company_id, role, companies(id, name, slug)')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()

    if (error) setFeedback('No se pudo cargar el espacio de trabajo.')
    setCompany(data?.companies || null)
    setLoading(false)
  }

  useEffect(() => {
    loadWorkspace()
  }, [])

  const loadClients = async () => {
    if (!company) return
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, email, phone, status, created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })

    if (error) setFeedback('No se pudo cargar la lista de clientes.')
    else setClients(data)
  }

  useEffect(() => {
    if (company) loadClients()
  }, [company])

  if (loading) {
    return (
      <main className="erp-loading">
        <span className="spinner" />
        <p>Preparando tu empresa…</p>
      </main>
    )
  }

  if (!company) {
    return (
      <CompanyOnboarding
        session={session}
        supabase={supabase}
        onCreated={loadWorkspace}
        feedback={feedback}
      />
    )
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <main className="erp-shell">
      <aside className="erp-sidebar">
        <div className="brand">
          <span className="brand-mark">I</span>
          <span>IDEALO SV</span>
        </div>

        <div className="company-chip">
          <span>EMPRESA ACTIVA</span>
          <strong>{company.name}</strong>
        </div>

        <nav className="erp-nav">
          <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')}>
            Resumen
          </NavButton>
          <NavButton active={view === 'clients'} onClick={() => setView('clients')}>
            Clientes
          </NavButton>
          <NavButton disabled>Productos y servicios</NavButton>
          <NavButton disabled>Cotizaciones</NavButton>
          <NavButton disabled>Campañas</NavButton>
        </nav>

        <button type="button" className="sidebar-logout" onClick={signOut}>
          Cerrar sesión
        </button>
      </aside>

      <section className="erp-content">
        <header className="erp-topbar">
          <div>
            <p className="form-kicker">SISTEMA DE GESTIÓN PUBLICITARIA</p>
            <h1>{view === 'dashboard' ? 'Resumen' : 'Clientes'}</h1>
          </div>
          <div className="user-pill">
            <span>{initials(session.user.user_metadata?.full_name || session.user.email)}</span>
            <div>
              <strong>{session.user.user_metadata?.full_name || 'Administrador'}</strong>
              <small>{session.user.email}</small>
            </div>
          </div>
        </header>

        {feedback && <p className="feedback error">{feedback}</p>}

        {view === 'dashboard' ? (
          <Dashboard company={company} clients={clients} onClients={() => setView('clients')} />
        ) : (
          <ClientsView
            clients={clients}
            open={clientFormOpen}
            onOpen={() => setClientFormOpen(true)}
            onClose={() => setClientFormOpen(false)}
            onCreated={loadClients}
            company={company}
            session={session}
            supabase={supabase}
          />
        )}
      </section>
    </main>
  )
}

function CompanyOnboarding({ session, supabase, onCreated, feedback }) {
  const [name, setName] = useState('IDEALO SV')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    const slug = slugify(name) + '-' + session.user.id.slice(0, 6)
    const { error } = await supabase.rpc('create_company_with_owner', {
      company_name: name,
      company_slug: slug,
    })
    if (error) {
      setMessage('No se pudo crear la empresa. Verifica que la nueva migración esté instalada.')
    } else {
      await onCreated()
    }
    setSubmitting(false)
  }

  return (
    <main className="shell">
      <section className="onboarding-card">
        <div>
          <div className="brand">
            <span className="brand-mark">I</span>
            <span>IDEALO SV</span>
          </div>
          <p className="eyebrow">PRIMERA CONFIGURACIÓN</p>
          <h1>Crea tu empresa.</h1>
          <p className="lead">
            Este será el espacio principal donde administrarás clientes,
            cotizaciones, campañas y resultados.
          </p>
        </div>

        <form onSubmit={submit} className="company-form">
          <label className="field">
            <span>Nombre de la empresa</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              required
            />
          </label>
          {(message || feedback) && (
            <p className="feedback error">{message || feedback}</p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creando empresa…' : 'Crear empresa y continuar'}
          </button>
          <small>Tu usuario quedará registrado como propietario.</small>
        </form>
      </section>
    </main>
  )
}

function Dashboard({ company, clients, onClients }) {
  const activeClients = clients.filter((client) => client.status === 'active').length
  return (
    <>
      <section className="metric-grid">
        <Metric label="Clientes totales" value={clients.length} />
        <Metric label="Clientes activos" value={activeClients} accent />
        <Metric label="Cotizaciones" value="0" />
        <Metric label="Campañas activas" value="0" />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="form-kicker">ACTIVIDAD</p>
              <h2>Tu empresa está lista</h2>
            </div>
          </div>
          <p>
            {company.name} ya cuenta con un espacio protegido. Comienza
            registrando tus clientes para construir el flujo comercial.
          </p>
          <button type="button" onClick={onClients}>Agregar primer cliente</button>
        </article>

        <article className="panel roadmap-panel">
          <p className="form-kicker">SIGUIENTES MÓDULOS</p>
          <ul>
            <li className="done">Empresa y usuarios</li>
            <li className="done">Clientes</li>
            <li>Productos y servicios</li>
            <li>Cotizaciones</li>
            <li>Campañas y producción</li>
          </ul>
        </article>
      </section>
    </>
  )
}

function ClientsView({ clients, open, onOpen, onClose, onCreated, company, session, supabase }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () => clients.filter((client) =>
      [client.name, client.email, client.phone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query.toLowerCase())),
    ),
    [clients, query],
  )

  return (
    <section className="clients-section">
      <div className="list-toolbar">
        <input
          className="search-input"
          placeholder="Buscar por nombre, correo o teléfono"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" onClick={onOpen}>+ Nuevo cliente</button>
      </div>

      {open && (
        <ClientForm
          company={company}
          session={session}
          supabase={supabase}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}

      <div className="table-card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span>CL</span>
            <h2>Aún no hay clientes</h2>
            <p>Registra el primero para comenzar a trabajar.</p>
            <button type="button" onClick={onOpen}>Agregar cliente</button>
          </div>
        ) : (
          <div className="client-table">
            <div className="client-row client-head">
              <span>Cliente</span><span>Contacto</span><span>Estado</span>
            </div>
            {filtered.map((client) => (
              <div className="client-row" key={client.id}>
                <strong>{client.name}</strong>
                <span>{client.email || client.phone || 'Sin contacto'}</span>
                <span className={`status-badge ${client.status}`}>
                  {client.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ClientForm({ company, session, supabase, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    const { error } = await supabase.from('clients').insert({
      ...form,
      company_id: company.id,
      created_by: session.user.id,
    })
    if (error) setMessage('No se pudo guardar el cliente.')
    else {
      await onCreated()
      onClose()
    }
    setSubmitting(false)
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="inline-form-heading">
        <div>
          <p className="form-kicker">NUEVO REGISTRO</p>
          <h2>Agregar cliente</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>×</button>
      </div>
      <div className="form-grid">
        <label className="field"><span>Nombre *</span><input required value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} /></label>
        <label className="field"><span>Correo</span><input type="email" value={form.email} onChange={(e) => setForm({...form, email:e.target.value})} /></label>
        <label className="field"><span>Teléfono</span><input value={form.phone} onChange={(e) => setForm({...form, phone:e.target.value})} /></label>
        <label className="field"><span>Notas</span><input value={form.notes} onChange={(e) => setForm({...form, notes:e.target.value})} /></label>
      </div>
      {message && <p className="feedback error">{message}</p>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
        <button type="submit" disabled={submitting}>{submitting ? 'Guardando…' : 'Guardar cliente'}</button>
      </div>
    </form>
  )
}

function Metric({ label, value, accent = false }) {
  return <article className={accent ? 'metric accent' : 'metric'}><span>{label}</span><strong>{value}</strong></article>
}

function NavButton({ children, active = false, disabled = false, onClick }) {
  return <button type="button" className={active ? 'active' : ''} disabled={disabled} onClick={onClick}>{children}{disabled && <small>Próximamente</small>}</button>
}

function initials(value = '') {
  return value.split(/[ @]/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('')
}

function slugify(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
