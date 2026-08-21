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
        ) : activeModule === 'Clientes' ? (
          <ClientsModule company={company} supabase={supabase} />
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


function ClientsModule({ company, supabase }) {
  const emptyForm = {
    name: '',
    email: '',
    phone: '',
    tax_id: '',
    notes: '',
    status: 'active',
  }
  const [clients, setClients] = useState([])
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [loadingClients, setLoadingClients] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadClients = async () => {
    setLoadingClients(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(
        error.message.includes('clients')
          ? 'Falta ejecutar la migración 0003_clients.sql en Supabase.'
          : error.message,
      )
    } else {
      setClients(data || [])
      setMessage('')
    }
    setLoadingClients(false)
  }

  useEffect(() => {
    loadClients()
  }, [company.id])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setMessage('')
  }

  const saveClient = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      company_id: company.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      tax_id: form.tax_id.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    }

    const operation = editingId
      ? supabase
          .from('clients')
          .update(payload)
          .eq('id', editingId)
          .eq('company_id', company.id)
      : supabase.from('clients').insert(payload)

    const { error } = await operation
    if (error) {
      setMessage(error.message)
    } else {
      resetForm()
      await loadClients()
    }
    setSaving(false)
  }

  const editClient = (client) => {
    setEditingId(client.id)
    setForm({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      tax_id: client.tax_id || '',
      notes: client.notes || '',
      status: client.status || 'active',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteClient = async (client) => {
    if (!window.confirm(`¿Eliminar a ${client.name}? Esta acción no se puede deshacer.`)) {
      return
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', client.id)
      .eq('company_id', company.id)

    if (error) setMessage(error.message)
    else await loadClients()
  }

  const filteredClients = clients.filter((client) =>
    [client.name, client.email, client.phone, client.tax_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  return (
    <section className="clients-module">
      <div className="clients-toolbar">
        <div>
          <p className="form-kicker">DIRECTORIO COMERCIAL</p>
          <h2>{clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}</h2>
        </div>
        <label className="client-search">
          <span>Buscar</span>
          <input
            type="search"
            placeholder="Nombre, correo, teléfono o NIT"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="clients-layout">
        <form className="client-form panel" onSubmit={saveClient}>
          <div className="panel-heading">
            <div>
              <p className="form-kicker">{editingId ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}</p>
              <h3>{editingId ? 'Actualiza sus datos' : 'Registra un cliente'}</h3>
            </div>
          </div>

          <label className="field">
            <span>Nombre o razón social *</span>
            <input name="name" value={form.name} onChange={updateField} minLength={2} required />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Correo</span>
              <input name="email" type="email" value={form.email} onChange={updateField} />
            </label>
            <label className="field">
              <span>Teléfono</span>
              <input name="phone" value={form.phone} onChange={updateField} />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              <span>NIT / Identificación</span>
              <input name="tax_id" value={form.tax_id} onChange={updateField} />
            </label>
            <label className="field">
              <span>Estado</span>
              <select name="status" value={form.status} onChange={updateField}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Notas</span>
            <textarea name="notes" rows="3" value={form.notes} onChange={updateField} />
          </label>

          {message && <p className="feedback error">{message}</p>}

          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cliente'}
            </button>
            {editingId && (
              <button type="button" className="secondary-button" onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="client-list">
          {loadingClients ? (
            <div className="client-empty panel"><span className="spinner" /><p>Cargando clientes…</p></div>
          ) : filteredClients.length === 0 ? (
            <div className="client-empty panel">
              <span className="module-icon">◎</span>
              <strong>{query ? 'No encontramos coincidencias' : 'Aún no hay clientes'}</strong>
              <p>{query ? 'Prueba con otra búsqueda.' : 'Completa el formulario para registrar el primero.'}</p>
            </div>
          ) : (
            <div className="client-grid">
              {filteredClients.map((client) => (
                <article className="client-card" key={client.id}>
                  <div className="client-card-top">
                    <span className="client-avatar">{client.name.charAt(0).toUpperCase()}</span>
                    <div>
                      <h3>{client.name}</h3>
                      <span className={client.status === 'active' ? 'status active' : 'status'}>
                        {client.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                  <dl>
                    <div><dt>Correo</dt><dd>{client.email || 'Sin correo'}</dd></div>
                    <div><dt>Teléfono</dt><dd>{client.phone || 'Sin teléfono'}</dd></div>
                    <div><dt>NIT</dt><dd>{client.tax_id || 'Sin registro'}</dd></div>
                  </dl>
                  {client.notes && <p className="client-notes">{client.notes}</p>}
                  <div className="client-actions">
                    <button type="button" className="secondary-button" onClick={() => editClient(client)}>
                      Editar
                    </button>
                    <button type="button" className="danger-button" onClick={() => deleteClient(client)}>
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
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
