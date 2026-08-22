import { useEffect, useMemo, useRef, useState } from 'react'
import { DTE_ACTIVITIES, DTE_DISTRICTS_BY_MUNICIPALITY } from './dteCatalogs'

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

  const modules = ['Resumen', 'Empresa', 'Clientes', 'Servicios', 'Cotizaciones', 'Campañas']

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
        ) : activeModule === 'Empresa' ? (
          <CompanyFiscalModule company={company} supabase={supabase} />
        ) : activeModule === 'Clientes' ? (
          <ClientsModule company={company} supabase={supabase} />
        ) : (
          <ModulePreview name={activeModule} />
        )}
      </section>
    </main>
  )
}

const companyFiscalFields = [
  ['nit', 'NIT'], ['nrc', 'NRC'], ['name', 'razón social'],
  ['activity_code', 'código de actividad'], ['business_activity', 'actividad económica'],
  ['department_code', 'departamento'], ['municipality_code', 'municipio'],
  ['district_code', 'distrito'], ['address', 'dirección'], ['phone', 'teléfono'],
  ['email', 'correo'], ['establishment_code', 'establecimiento'], ['point_of_sale_code', 'punto de venta'],
]

function CompanyFiscalModule({ company, supabase }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.from('companies').select('*').eq('id', company.id).single().then(({ data, error }) => {
      if (error) setMessage(error.message.includes('district_code') ? 'Falta aplicar la migración 0007_company_dte_profile.sql.' : error.message)
      else setForm(data || {})
      setLoading(false)
    })
  }, [company.id, supabase])

  const missing = companyFiscalFields.filter(([key]) => !String(form[key] || '').trim()).map(([, label]) => label)
  const update = (event) => {
    const { name, value } = event.target
    setForm((current) => {
      if (name === 'activity_code') {
        const activity = DTE_ACTIVITIES.find((item) => item.code === value)
        return { ...current, activity_code: value, business_activity: activity?.name || '' }
      }
      if (name === 'department_code') {
        return { ...current, department_code: value, municipality_code: '', district_code: '' }
      }
      if (name === 'municipality_code') {
        return { ...current, municipality_code: value, district_code: '' }
      }
      return { ...current, [name]: value }
    })
  }
  const updateCatalog = (name, value) => {
    setForm((current) => {
      if (name === 'activity_code') {
        const activity = DTE_ACTIVITIES.find((item) => item.code === value)
        return { ...current, activity_code: value, business_activity: activity?.name || '' }
      }
      return { ...current, [name]: value }
    })
  }
  const selectedCompanyDepartment = DTE_DEPARTMENTS.find((item) => item.code === form.department_code)
  const companyDistricts = DTE_DISTRICTS_BY_MUNICIPALITY[`${form.department_code}-${form.municipality_code}`] || []
  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    const payload = Object.fromEntries(companyFiscalFields.map(([key]) => [key, String(form[key] || '').trim() || null]))
    const { error } = await supabase.from('companies').update(payload).eq('id', company.id)
    setMessage(error ? error.message : 'Expediente fiscal guardado correctamente.')
    setSaving(false)
  }

  if (loading) return <section className="loading-card"><span className="spinner" /><p>Cargando expediente fiscal…</p></section>

  return (
    <section className="clients-module">
      <div className="clients-titlebar">
        <div><p className="form-kicker">EMISOR DTE</p><h2>Datos fiscales de la empresa</h2><p>Información que alimentará automáticamente el emisor de cada documento.</p></div>
        <span className={missing.length ? 'status dte-pending' : 'status dte-ready'}>{missing.length ? `Faltan ${missing.length} datos` : 'Listo para DTE-01'}</span>
      </div>
      {message && <p className={message.includes('correctamente') ? 'feedback success' : 'feedback error'}>{message}</p>}
      {missing.length > 0 && <div className="dte-note"><strong>Para quedar listo:</strong> {missing.join(', ')}.</div>}
      <form className="client-form-full panel" onSubmit={save}>
        <fieldset className="form-section dte-section">
          <legend>Identificación tributaria</legend>
          <div className="form-grid three">
            <label className="field form-span-2"><span>Razón social *</span><input name="name" value={form.name || ''} onChange={update} required /></label>
            <label className="field"><span>Nombre comercial</span><input name="trade_name" value={form.trade_name || ''} onChange={update} /></label>
            <label className="field"><span>NIT *</span><input name="nit" value={form.nit || ''} onChange={update} required /></label>
            <label className="field"><span>NRC *</span><input name="nrc" value={form.nrc || ''} onChange={update} required /></label>
            <CatalogCombobox className="form-span-3" label="Actividad económica / giro (CAT-019) *" name="activity_code" value={form.activity_code || ''} options={DTE_ACTIVITIES} onValueChange={updateCatalog} placeholder="Buscar por código o nombre de actividad" required />
            <input type="hidden" name="business_activity" value={form.business_activity || ''} />
          </div>
        </fieldset>
        <fieldset className="form-section"><legend>Domicilio fiscal</legend><div className="form-grid three">
          <label className="field"><span>Departamento (CAT-012) *</span><select name="department_code" value={form.department_code || ''} onChange={update} required><option value="">Seleccionar</option>{DTE_DEPARTMENTS.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}</select></label>
          <label className="field"><span>Municipio (CAT-013) *</span><select name="municipality_code" value={form.municipality_code || ''} onChange={update} disabled={!selectedCompanyDepartment} required><option value="">Seleccionar</option>{(selectedCompanyDepartment?.municipalities || []).map((municipality) => <option key={municipality.code} value={municipality.code}>{municipality.code} - {municipality.name}</option>)}</select></label>
          <label className="field"><span>Distrito (CAT-008) *</span><select name="district_code" value={form.district_code || ''} onChange={update} disabled={!form.municipality_code} required><option value="">Seleccionar</option>{companyDistricts.map((district) => <option key={district.code} value={district.code}>{district.code} - {district.name}</option>)}</select></label>
          <label className="field form-span-3"><span>Complemento de dirección *</span><textarea name="address" value={form.address || ''} onChange={update} rows="2" required /></label>
        </div></fieldset>
        <fieldset className="form-section"><legend>Contacto y establecimiento</legend><div className="form-grid three">
          <label className="field"><span>Teléfono *</span><input name="phone" value={form.phone || ''} onChange={update} required /></label>
          <label className="field form-span-2"><span>Correo para DTE *</span><input type="email" name="email" value={form.email || ''} onChange={update} required /></label>
          <label className="field"><span>Código establecimiento *</span><input name="establishment_code" value={form.establishment_code || ''} onChange={update} placeholder="M001" required /></label>
          <label className="field"><span>Código punto de venta *</span><input name="point_of_sale_code" value={form.point_of_sale_code || ''} onChange={update} placeholder="P001" required /></label>
        </div></fieldset>
        <div className="dte-note">Las contraseñas, el certificado y las credenciales del MH no se guardan aquí. Permanecen protegidos en Render.</div>
        <div className="form-actions end"><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar expediente fiscal'}</button></div>
      </form>
    </section>
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


const DTE_DEPARTMENTS = [
  { code: '00', name: 'Otro (extranjero)', municipalities: [{ code: '00', name: 'Otro' }] },
  { code: '01', name: 'Ahuachapán', municipalities: [{ code: '13', name: 'Ahuachapán Norte' }, { code: '14', name: 'Ahuachapán Centro' }, { code: '15', name: 'Ahuachapán Sur' }] },
  { code: '02', name: 'Santa Ana', municipalities: [{ code: '14', name: 'Santa Ana Norte' }, { code: '15', name: 'Santa Ana Centro' }, { code: '16', name: 'Santa Ana Este' }, { code: '17', name: 'Santa Ana Oeste' }] },
  { code: '03', name: 'Sonsonate', municipalities: [{ code: '17', name: 'Sonsonate Norte' }, { code: '18', name: 'Sonsonate Centro' }, { code: '19', name: 'Sonsonate Este' }, { code: '20', name: 'Sonsonate Oeste' }] },
  { code: '04', name: 'Chalatenango', municipalities: [{ code: '34', name: 'Chalatenango Norte' }, { code: '35', name: 'Chalatenango Centro' }, { code: '36', name: 'Chalatenango Sur' }] },
  { code: '05', name: 'La Libertad', municipalities: [{ code: '23', name: 'La Libertad Norte' }, { code: '24', name: 'La Libertad Centro' }, { code: '25', name: 'La Libertad Oeste' }, { code: '26', name: 'La Libertad Este' }, { code: '27', name: 'La Libertad Costa' }, { code: '28', name: 'La Libertad Sur' }] },
  { code: '06', name: 'San Salvador', municipalities: [{ code: '20', name: 'San Salvador Norte' }, { code: '21', name: 'San Salvador Oeste' }, { code: '22', name: 'San Salvador Este' }, { code: '23', name: 'San Salvador Centro' }, { code: '24', name: 'San Salvador Sur' }] },
  { code: '07', name: 'Cuscatlán', municipalities: [{ code: '17', name: 'Cuscatlán Norte' }, { code: '18', name: 'Cuscatlán Sur' }] },
  { code: '08', name: 'La Paz', municipalities: [{ code: '23', name: 'La Paz Oeste' }, { code: '24', name: 'La Paz Centro' }, { code: '25', name: 'La Paz Este' }] },
  { code: '09', name: 'Cabañas', municipalities: [{ code: '10', name: 'Cabañas Este' }, { code: '11', name: 'Cabañas Oeste' }] },
  { code: '10', name: 'San Vicente', municipalities: [{ code: '14', name: 'San Vicente Norte' }, { code: '15', name: 'San Vicente Sur' }] },
  { code: '11', name: 'Usulután', municipalities: [{ code: '24', name: 'Usulután Norte' }, { code: '25', name: 'Usulután Este' }, { code: '26', name: 'Usulután Oeste' }] },
  { code: '12', name: 'San Miguel', municipalities: [{ code: '21', name: 'San Miguel Norte' }, { code: '22', name: 'San Miguel Centro' }, { code: '23', name: 'San Miguel Oeste' }] },
  { code: '13', name: 'Morazán', municipalities: [{ code: '27', name: 'Morazán Norte' }, { code: '28', name: 'Morazán Sur' }] },
  { code: '14', name: 'La Unión', municipalities: [{ code: '19', name: 'La Unión Norte' }, { code: '20', name: 'La Unión Sur' }] },
]

const DTE_DOCUMENT_TYPES = [
  { code: '36', name: 'NIT' },
  { code: '13', name: 'DUI' },
  { code: '03', name: 'Pasaporte' },
  { code: '02', name: 'Carnet de residente' },
  { code: '37', name: 'Otro' },
]

function getDteReadiness(client) {
  const common = [
    ['name', 'nombre o razón social'],
    ['email', 'correo electrónico'],
    ['phone', 'teléfono'],
    ['activity_code', 'código de actividad económica'],
    ['business_activity', 'descripción de actividad'],
    ['department_code', 'departamento'],
    ['municipality_code', 'municipio'],
    ['district_code', 'distrito'],
    ['address', 'complemento de dirección'],
  ]
  const fiscal = client.preferred_dte_type === '03'
    ? [['tax_id', 'NIT'], ['nrc', 'NRC']]
    : [['document_type', 'tipo de documento'], ['document_number', 'número de documento']]
  const missing = [...common, ...fiscal].filter(([key]) => !String(client[key] || '').trim())
  return { ready: missing.length === 0, missing: missing.map(([, label]) => label) }
}

function ClientsModule({ company, supabase }) {
  const emptyForm = {
    client_type: 'company',
    taxpayer_type: '2',
    preferred_dte_type: '03',
    document_type: '36',
    document_number: '',
    name: '',
    trade_name: '',
    tax_id: '',
    nrc: '',
    dui: '',
    activity_code: '',
    business_activity: '',
    email: '',
    phone: '',
    whatsapp: '',
    contact_name: '',
    contact_position: '',
    department_code: '',
    department: '',
    municipality_code: '',
    district_code: '',
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
    setForm((current) => {
      if (name === 'client_type') {
        return {
          ...current,
          client_type: value,
          taxpayer_type: value === 'person' ? '1' : '2',
          document_type: value === 'person' ? '13' : '36',
        }
      }
      if (name === 'department_code') {
        return { ...current, department_code: value, municipality_code: '', district_code: '' }
      }
      if (name === 'municipality_code') {
        return { ...current, municipality_code: value, district_code: '' }
      }
      if (name === 'activity_code') {
        const activity = DTE_ACTIVITIES.find((item) => item.code === value)
        return { ...current, activity_code: value, business_activity: activity?.name || '' }
      }
      return { ...current, [name]: value }
    })
  }

  const updateCatalog = (name, value) => {
    setForm((current) => {
      if (name === 'activity_code') {
        const activity = DTE_ACTIVITIES.find((item) => item.code === value)
        return { ...current, activity_code: value, business_activity: activity?.name || '' }
      }
      return { ...current, [name]: value }
    })
  }

  const selectedDepartment = DTE_DEPARTMENTS.find(
    (department) => department.code === form.department_code,
  )
  const selectedDistricts = DTE_DISTRICTS_BY_MUNICIPALITY[`${form.department_code}-${form.municipality_code}`] || []

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

    const readiness = getDteReadiness(form)
    if (!readiness.ready) {
      setMessage(`Completa los datos obligatorios para DTE: ${readiness.missing.join(', ')}.`)
      setSaving(false)
      return
    }

    const department = DTE_DEPARTMENTS.find((item) => item.code === form.department_code)
    const municipality = department?.municipalities.find(
      (item) => item.code === form.municipality_code,
    )

    const payload = {
      company_id: company.id,
      client_type: form.client_type,
      taxpayer_type: form.taxpayer_type,
      preferred_dte_type: form.preferred_dte_type,
      document_type: form.document_type,
      document_number: form.document_number.trim() || null,
      name: form.name.trim(),
      trade_name: form.trade_name.trim() || null,
      tax_id: form.tax_id.trim() || null,
      nrc: form.nrc.trim() || null,
      dui: form.dui.trim() || null,
      activity_code: form.activity_code.trim() || null,
      business_activity: form.business_activity.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_position: form.contact_position.trim() || null,
      department_code: form.department_code,
      department: department?.name || null,
      municipality_code: form.municipality_code,
      district_code: form.district_code,
      municipality: municipality?.name || null,
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
      taxpayer_type: client.taxpayer_type || (client.client_type === 'person' ? '1' : '2'),
      preferred_dte_type: client.preferred_dte_type || '01',
      document_type: client.document_type || (client.client_type === 'person' ? '13' : '36'),
      document_number: client.document_number || '',
      name: client.name || '',
      trade_name: client.trade_name || '',
      tax_id: client.tax_id || '',
      nrc: client.nrc || '',
      dui: client.dui || '',
      activity_code: client.activity_code || '',
      business_activity: client.business_activity || '',
      email: client.email || '',
      phone: client.phone || '',
      whatsapp: client.whatsapp || '',
      contact_name: client.contact_name || '',
      contact_position: client.contact_position || '',
      department_code: client.department_code || '',
      department: client.department || '',
      municipality_code: client.municipality_code || '',
      district_code: client.district_code || '',
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
      client.document_number,
      client.activity_code,
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
  const dteReadyCount = clients.filter((client) => getDteReadiness(client).ready).length

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
        <ClientStat label="Listos para DTE" value={dteReadyCount} note="Expediente fiscal completo" />
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

          <fieldset className="form-section dte-section">
            <legend>Facturación electrónica (DTE)</legend>
            <div className="dte-note">
              Estos datos alimentarán automáticamente el receptor del DTE.
              Para Crédito Fiscal se exigirán NIT y NRC.
            </div>
            <div className="form-grid three">
              <label className="field">
                <span>Documento habitual *</span>
                <select name="preferred_dte_type" value={form.preferred_dte_type} onChange={updateField}>
                  <option value="01">01 - Factura electrónica</option>
                  <option value="03">03 - Crédito Fiscal electrónico</option>
                </select>
              </label>
              <label className="field">
                <span>Tipo de persona (CAT-029) *</span>
                <select name="taxpayer_type" value={form.taxpayer_type} onChange={updateField}>
                  <option value="1">1 - Persona natural</option>
                  <option value="2">2 - Persona jurídica</option>
                </select>
              </label>
              <label className="field">
                <span>Tipo de identificación (CAT-022) *</span>
                <select name="document_type" value={form.document_type} onChange={updateField}>
                  {DTE_DOCUMENT_TYPES.map((type) => (
                    <option key={type.code} value={type.code}>{type.code} - {type.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Número de identificación *</span>
                <input name="document_number" value={form.document_number} onChange={updateField} placeholder="DUI, NIT, pasaporte u otro" required />
              </label>
              <label className="field">
                <span>NIT {form.preferred_dte_type === '03' ? '*' : ''}</span>
                <input name="tax_id" value={form.tax_id} onChange={updateField} placeholder="0000-000000-000-0" required={form.preferred_dte_type === '03'} />
              </label>
              <label className="field">
                <span>NRC {form.preferred_dte_type === '03' ? '*' : ''}</span>
                <input name="nrc" value={form.nrc} onChange={updateField} required={form.preferred_dte_type === '03'} />
              </label>
              <label className="field">
                <span>DUI</span>
                <input name="dui" value={form.dui} onChange={updateField} placeholder="00000000-0" />
              </label>
              <CatalogCombobox className="form-span-3" label="Actividad económica / giro (CAT-019) *" name="activity_code" value={form.activity_code} options={DTE_ACTIVITIES} onValueChange={updateCatalog} placeholder="Buscar por código o nombre de actividad" required />
              <input type="hidden" name="business_activity" value={form.business_activity} />
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Contacto principal</legend>
            <div className="form-grid three">
              <label className="field">
                <span>Correo electrónico para entrega DTE *</span>
                <input name="email" type="email" value={form.email} onChange={updateField} required />
              </label>
              <label className="field">
                <span>Teléfono para DTE *</span>
                <input name="phone" value={form.phone} onChange={updateField} required />
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
            <legend>Domicilio fiscal del receptor</legend>
            <div className="form-grid three">
              <label className="field">
                <span>Departamento (CAT-012) *</span>
                <select name="department_code" value={form.department_code} onChange={updateField} required>
                  <option value="">Seleccionar</option>
                  {DTE_DEPARTMENTS.map((department) => (
                    <option key={department.code} value={department.code}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Municipio (CAT-013) *</span>
                <select name="municipality_code" value={form.municipality_code} onChange={updateField} required disabled={!selectedDepartment}>
                  <option value="">Seleccionar</option>
                  {(selectedDepartment?.municipalities || []).map((municipality) => (
                    <option key={municipality.code} value={municipality.code}>
                      {municipality.code} - {municipality.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Distrito (CAT-008) *</span>
                <select name="district_code" value={form.district_code} onChange={updateField} required disabled={!form.municipality_code}>
                  <option value="">Seleccionar</option>
                  {selectedDistricts.map((district) => (
                    <option key={district.code} value={district.code}>{district.code} - {district.name}</option>
                  ))}
                </select>
              </label>
              <label className="field form-span-3">
                <span>Complemento de dirección *</span>
                <textarea name="address" rows="2" value={form.address} onChange={updateField} placeholder="Calle, avenida, colonia, número y referencias" required />
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
                      <strong>{client.preferred_dte_type === '03' ? '03 - Crédito Fiscal' : '01 - Factura'}</strong>
                      <small>{client.tax_id || client.document_number || 'Sin identificación'}</small>
                      <span className={getDteReadiness(client).ready ? 'status dte-ready' : 'status dte-pending'}>
                        {getDteReadiness(client).ready ? 'Listo para DTE' : `Faltan ${getDteReadiness(client).missing.length} datos`}
                      </span>
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

function CatalogCombobox({ label, name, value, options, onValueChange, placeholder, required = false, className = '' }) {
  const inputRef = useRef(null)
  const selected = options.find((option) => option.code === value)
  const selectedLabel = selected ? `${selected.code} - ${selected.name}` : ''
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) setQuery(selectedLabel)
  }, [open, selectedLabel])

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !value ? 'Selecciona una opción del catálogo.' : '')
  }, [required, value])

  const matches = useMemo(() => {
    const term = normalizeCatalogText(query === selectedLabel ? '' : query)
    if (!term) return options.slice(0, 40)
    return options
      .filter((option) => normalizeCatalogText(`${option.code} ${option.name}`).includes(term))
      .slice(0, 40)
  }, [options, query, selectedLabel])

  const choose = (option) => {
    onValueChange(name, option.code)
    setQuery(`${option.code} - ${option.name}`)
    setOpen(false)
  }

  return (
    <label className={`field catalog-combobox ${className}`.trim()}>
      <span>{label}</span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${name}-catalog-options`}
        required={required}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => {
          setOpen(false)
          if (!value) setQuery('')
        }, 120)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onValueChange(name, '')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && open && matches[0]) {
            event.preventDefault()
            choose(matches[0])
          }
          if (event.key === 'Escape') setOpen(false)
        }}
      />
      <input type="hidden" name={name} value={value} required={required} />
      {open && (
        <div className="catalog-options" id={`${name}-catalog-options`} role="listbox">
          {matches.length ? matches.map((option) => (
            <button type="button" role="option" aria-selected={option.code === value} key={option.code} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
              <strong>{option.code}</strong><span>{option.name}</span>
            </button>
          )) : <p>No hay coincidencias.</p>}
          {matches.length === 40 && <small>Escribe más letras para reducir los resultados.</small>}
        </div>
      )}
    </label>
  )
}

function normalizeCatalogText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
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
    Empresa: '▣',
    Clientes: '◎',
    Servicios: '◇',
    Cotizaciones: '▤',
    Campañas: '✦',
  }[module]
}
