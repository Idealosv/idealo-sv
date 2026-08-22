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
    client_type: 'company',
    name: '',
    trade_name: '',
    tax_id: '',
    nrc: '',
    dui: '',
    business_activity: '',
    email: '',
    phone: '',
    whatsapp: '',
    contact_name: '',
    contact_position: '',
    department: '',
    municipality: '',
    address: '',
    payment_terms: 'cash',
    credit_limit: '0',
    source: '',
    notes: '',
    status: 'active',
  }

  const [clients, setClients] = useState([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
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
          ? 'Falta ejecutar la migración 0004_client_details.sql en Supabase.'
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
    setShowForm(false)
    setMessage('')
  }

  const startNewClient = () => {
    setForm(emptyForm)
    setEditingId(null)
    setMessage('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveClient = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      company_id: company.id,
      client_type: form.client_type,
      name: form.name.trim(),
      trade_name: form.trade_name.trim() || null,
      tax_id: form.tax_id.trim() || null,
      nrc: form.nrc.trim() || null,
      dui: form.dui.trim() || null,
      business_activity: form.business_activity.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_position: form.contact_position.trim() || null,
      department: form.department.trim() || null,
      municipality: form.municipality.trim() || null,
      address: form.address.trim() || null,
      payment_terms: form.payment_terms,
      credit_limit: Number(form.credit_limit || 0),
      source: form.source.trim() || null,
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
      client_type: client.client_type || 'company',
      name: client.name || '',
      trade_name: client.trade_name || '',
      tax_id: client.tax_id || '',
      nrc: client.nrc || '',
      dui: client.dui || '',
      business_activity: client.business_activity || '',
      email: client.email || '',
      phone: client.phone || '',
      whatsapp: client.whatsapp || '',
      contact_name: client.contact_name || '',
      contact_position: client.contact_position || '',
      department: client.department || '',
      municipality: client.municipality || '',
      address: client.address || '',
      payment_terms: client.payment_terms || 'cash',
      credit_limit: String(client.credit_limit || 0),
      source: client.source || '',
      notes: client.notes || '',
      status: client.status || 'active',
    })
    setMessage('')
    setShowForm(true)
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

  const filteredClients = clients.filter((client) => {
    const searchable = [
      client.name,
      client.trade_name,
      client.email,
      client.phone,
      client.whatsapp,
      client.tax_id,
      client.nrc,
      client.dui,
      client.contact_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      searchable.includes(query.toLowerCase()) &&
      (statusFilter === 'all' || client.status === statusFilter) &&
      (typeFilter === 'all' || client.client_type === typeFilter)
    )
  })

  const activeCount = clients.filter((client) => client.status === 'active').length
  const companyCount = clients.filter((client) => client.client_type === 'company').length
  const creditCount = clients.filter((client) => client.payment_terms === 'credit').length

  return (
    <section className="clients-module">
      <div className="clients-titlebar">
        <div>
          <p className="form-kicker">DIRECTORIO COMERCIAL</p>
          <h2>Gestión de clientes</h2>
          <p>Administra datos comerciales, fiscales, contactos y condiciones de venta.</p>
        </div>
        <button type="button" className="primary-action" onClick={startNewClient}>
          + Nuevo cliente
        </button>
      </div>

      <section className="client-stats" aria-label="Resumen de clientes">
        <ClientStat label="Total" value={clients.length} note="Clientes registrados" />
        <ClientStat label="Activos" value={activeCount} note="Disponibles para operar" />
        <ClientStat label="Empresas" value={companyCount} note="Personas jurídicas" />
        <ClientStat label="Con crédito" value={creditCount} note="Condición autorizada" />
      </section>

      {message && (
        <p className="feedback error" role="status">
          {message}
        </p>
      )}

      {showForm && (
        <form className="client-form-full panel" onSubmit={saveClient}>
          <div className="client-form-header">
            <div>
              <p className="form-kicker">{editingId ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}</p>
              <h3>{editingId ? 'Actualizar expediente' : 'Crear expediente comercial'}</h3>
            </div>
            <button type="button" className="secondary-button" onClick={resetForm}>
              Cerrar
            </button>
          </div>

          <fieldset className="form-section">
            <legend>Identificación</legend>
            <div className="form-grid three">
              <label className="field">
                <span>Tipo de cliente *</span>
                <select name="client_type" value={form.client_type} onChange={updateField}>
                  <option value="company">Empresa</option>
                  <option value="person">Persona natural</option>
                </select>
              </label>
              <label className="field form-span-2">
                <span>{form.client_type === 'company' ? 'Razón social *' : 'Nombre completo *'}</span>
                <input name="name" value={form.name} onChange={updateField} minLength={2} required />
              </label>
              <label className="field form-span-2">
                <span>Nombre comercial</span>
                <input name="trade_name" value={form.trade_name} onChange={updateField} />
              </label>
              <label className="field">
                <span>Estado</span>
                <select name="status" value={form.status} onChange={updateField}>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Información fiscal</legend>
            <div className="form-grid three">
              <label className="field">
                <span>NIT</span>
                <input name="tax_id" value={form.tax_id} onChange={updateField} placeholder="0000-000000-000-0" />
              </label>
              <label className="field">
                <span>NRC</span>
                <input name="nrc" value={form.nrc} onChange={updateField} />
              </label>
              <label className="field">
                <span>DUI</span>
                <input name="dui" value={form.dui} onChange={updateField} placeholder="00000000-0" />
              </label>
              <label className="field form-span-3">
                <span>Giro o actividad económica</span>
                <input name="business_activity" value={form.business_activity} onChange={updateField} />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Contacto principal</legend>
            <div className="form-grid three">
              <label className="field">
                <span>Correo electrónico</span>
                <input name="email" type="email" value={form.email} onChange={updateField} />
              </label>
              <label className="field">
                <span>Teléfono</span>
                <input name="phone" value={form.phone} onChange={updateField} />
              </label>
              <label className="field">
                <span>WhatsApp</span>
                <input name="whatsapp" value={form.whatsapp} onChange={updateField} />
              </label>
              <label className="field form-span-2">
                <span>Persona de contacto</span>
                <input name="contact_name" value={form.contact_name} onChange={updateField} />
              </label>
              <label className="field">
                <span>Cargo</span>
                <input name="contact_position" value={form.contact_position} onChange={updateField} />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Dirección</legend>
            <div className="form-grid three">
              <label className="field">
                <span>Departamento</span>
                <select name="department" value={form.department} onChange={updateField}>
                  <option value="">Seleccionar</option>
                  {SALVADOR_DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Municipio / distrito</span>
                <input name="municipality" value={form.municipality} onChange={updateField} />
              </label>
              <label className="field form-span-3">
                <span>Dirección completa</span>
                <textarea name="address" rows="2" value={form.address} onChange={updateField} />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Condiciones comerciales</legend>
            <div className="form-grid three">
              <label className="field">
                <span>Forma de pago</span>
                <select name="payment_terms" value={form.payment_terms} onChange={updateField}>
                  <option value="cash">Contado</option>
                  <option value="credit">Crédito</option>
                  <option value="mixed">Mixto</option>
                </select>
              </label>
              <label className="field">
                <span>Límite de crédito ($)</span>
                <input name="credit_limit" type="number" min="0" step="0.01" value={form.credit_limit} onChange={updateField} />
              </label>
              <label className="field">
                <span>Origen del cliente</span>
                <input name="source" value={form.source} onChange={updateField} placeholder="Recomendación, redes, visita..." />
              </label>
              <label className="field form-span-3">
                <span>Notas internas</span>
                <textarea name="notes" rows="3" value={form.notes} onChange={updateField} />
              </label>
            </div>
          </fieldset>

          <div className="form-actions end">
            <button type="button" className="secondary-button" onClick={resetForm}>Cancelar</button>
            <button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      )}

      <section className="clients-directory panel">
        <div className="directory-toolbar">
          <label className="client-search">
            <span>Buscar cliente</span>
            <input
              type="search"
              placeholder="Nombre, NIT, NRC, DUI, correo o teléfono"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="compact-filter">
            <span>Estado</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </label>
          <label className="compact-filter">
            <span>Tipo</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="company">Empresas</option>
              <option value="person">Personas</option>
            </select>
          </label>
        </div>

        <div className="directory-count">
          <strong>{filteredClients.length}</strong>
          <span>{filteredClients.length === 1 ? 'resultado' : 'resultados'}</span>
        </div>

        {loadingClients ? (
          <div className="client-empty"><span className="spinner" /><p>Cargando clientes…</p></div>
        ) : filteredClients.length === 0 ? (
          <div className="client-empty">
            <span className="module-icon">◎</span>
            <strong>{query || statusFilter !== 'all' || typeFilter !== 'all' ? 'No encontramos coincidencias' : 'Aún no hay clientes'}</strong>
            <p>{clients.length ? 'Cambia los filtros o la búsqueda.' : 'Crea el primer expediente comercial.'}</p>
            {!clients.length && <button type="button" onClick={startNewClient}>+ Crear primer cliente</button>}
          </div>
        ) : (
          <div className="client-table-wrap">
            <table className="client-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Fiscal</th>
                  <th>Condición</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div className="table-client">
                        <span className="client-avatar">{client.name.charAt(0).toUpperCase()}</span>
                        <div>
                          <strong>{client.trade_name || client.name}</strong>
                          {client.trade_name && <small>{client.name}</small>}
                          <small>{client.client_type === 'person' ? 'Persona natural' : 'Empresa'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{client.phone || client.whatsapp || 'Sin teléfono'}</strong>
                      <small>{client.email || client.contact_name || 'Sin contacto adicional'}</small>
                    </td>
                    <td>
                      <strong>{client.tax_id || client.dui || 'Sin identificación'}</strong>
                      <small>{client.nrc ? `NRC ${client.nrc}` : client.business_activity || 'Sin NRC'}</small>
                    </td>
                    <td>
                      <strong>{client.payment_terms === 'credit' ? 'Crédito' : client.payment_terms === 'mixed' ? 'Mixto' : 'Contado'}</strong>
                      <small>{Number(client.credit_limit || 0) > 0 ? `Límite ${formatMoney(client.credit_limit)}` : 'Sin límite asignado'}</small>
                    </td>
                    <td>
                      <span className={client.status === 'active' ? 'status active' : 'status'}>
                        {client.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="secondary-button" onClick={() => editClient(client)}>Editar</button>
                        <button type="button" className="danger-button" onClick={() => deleteClient(client)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

function ClientStat({ label, value, note }) {
  return (
    <article className="client-stat">
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  )
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-SV', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

const SALVADOR_DEPARTMENTS = [
  'Ahuachapán',
  'Santa Ana',
  'Sonsonate',
  'Chalatenango',
  'La Libertad',
  'San Salvador',
  'Cuscatlán',
  'La Paz',
  'Cabañas',
  'San Vicente',
  'Usulután',
  'San Miguel',
  'Morazán',
  'La Unión',
]

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
