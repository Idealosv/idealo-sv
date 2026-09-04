import { useCallback, useEffect, useMemo, useState } from 'react'
import './suppliers-directory.css'

const EMPTY_FORM = {
  name: '',
  trade_name: '',
  nit: '',
  nrc: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  supplier_type: 'MATERIALS',
  notes: '',
}

const TYPE_LABELS = {
  MATERIALS: 'Materiales e insumos',
  OUTSOURCED_SERVICE: 'Servicio tercerizado',
  TRANSPORT: 'Transporte',
  UTILITIES: 'Servicios básicos',
  OTHER: 'Otro',
}

const SELECT_FIELDS = 'id,company_id,name,trade_name,nit,nrc,contact_name,phone,email,address,supplier_type,notes,active,created_at,updated_at'

const normalizeId = (value) => String(value || '').replace(/[^0-9a-z]/gi, '').toLowerCase()

function friendlyError(error) {
  const text = String(error?.message || error || '').trim()
  if (!text) return 'No pudimos completar la operación.'
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(text)) {
    return 'No pudimos conectar con la base de datos. Revisa la conexión e intenta actualizar de nuevo.'
  }
  if (/jwt|token|unauthorized|401|not authenticated/i.test(text)) {
    return 'La sesión necesita renovarse. Vuelve a iniciar sesión y repite la operación.'
  }
  if (/permission|row-level security|rls|42501/i.test(text)) {
    return 'Tu usuario no tiene permiso para realizar esta operación en proveedores.'
  }
  return text
}

export default function SuppliersDirectoryModule({ company, supabase }) {
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [hasLoaded, setHasLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!supabase || !company?.id) return
    if (!quiet) setLoading(true)
    setLoadError('')

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select(SELECT_FIELDS)
        .eq('company_id', company.id)
        .order('name', { ascending: true })

      if (error) throw error
      setRows(data || [])
      setHasLoaded(true)
    } catch (error) {
      setLoadError(friendlyError(error))
    } finally {
      setLoading(false)
    }
  }, [company?.id, supabase])

  useEffect(() => {
    load()
  }, [load])

  const activeCount = useMemo(() => rows.filter((row) => row.active).length, [rows])
  const inactiveCount = rows.length - activeCount
  const supplierTypes = useMemo(() => new Set(rows.map((row) => row.supplier_type).filter(Boolean)).size, [rows])

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter === 'ACTIVE' && !row.active) return false
      if (statusFilter === 'INACTIVE' && row.active) return false
      if (typeFilter !== 'ALL' && row.supplier_type !== typeFilter) return false
      if (!term) return true
      return [row.name, row.trade_name, row.nit, row.nrc, row.contact_name, row.phone, row.email, row.address, TYPE_LABELS[row.supplier_type]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [rows, query, statusFilter, typeFilter])

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setMessage('')
  }

  const edit = (row) => {
    setEditingId(row.id)
    setForm({
      name: row.name || '',
      trade_name: row.trade_name || '',
      nit: row.nit || '',
      nrc: row.nrc || '',
      contact_name: row.contact_name || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      supplier_type: row.supplier_type || 'MATERIALS',
      notes: row.notes || '',
    })
    setShowForm(true)
    setMessage('')
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const save = async (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setMessageType('error')
      setMessage('La razón social es obligatoria.')
      return
    }

    const normalizedNit = normalizeId(form.nit)
    const duplicate = rows.find((row) => row.id !== editingId && normalizedNit && normalizeId(row.nit) === normalizedNit)
    if (duplicate) {
      setMessageType('error')
      setMessage(`Ya existe un proveedor con ese NIT: ${duplicate.name}.`)
      return
    }

    setSaving(true)
    setMessage('')
    const payload = Object.fromEntries(
      Object.entries({ ...form, name }).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    )

    try {
      const request = editingId
        ? supabase.from('suppliers').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId).eq('company_id', company.id)
        : supabase.from('suppliers').insert({ ...payload, company_id: company.id })
      const { error } = await request
      if (error) throw error

      setMessageType('success')
      setMessage(editingId ? 'Proveedor actualizado correctamente.' : 'Proveedor guardado correctamente.')
      closeForm()
      await load({ quiet: true })
    } catch (error) {
      setMessageType('error')
      setMessage(friendlyError(error))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (row) => {
    setMessage('')
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ active: !row.active, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('company_id', company.id)
      if (error) throw error

      setMessageType('success')
      setMessage(row.active ? 'Proveedor desactivado.' : 'Proveedor activado.')
      await load({ quiet: true })
    } catch (error) {
      setMessageType('error')
      setMessage(friendlyError(error))
    }
  }

  const metric = (value) => (hasLoaded ? value : '—')

  return (
    <section className="suppliers-directory">
      <div className="suppliers-hero">
        <div>
          <p className="form-kicker">ABASTECIMIENTO</p>
          <h2>Proveedores</h2>
          <p>Directorio único para materiales, servicios, transporte y gastos operativos.</p>
        </div>
        <div className="suppliers-hero-actions">
          <button type="button" className="supplier-secondary" onClick={() => load()} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button type="button" className="suppliers-primary" onClick={openNew}>+ Nuevo proveedor</button>
        </div>
      </div>

      <div className="supplier-connection-row" aria-live="polite">
        <span className={`supplier-connection ${loadError ? 'error' : hasLoaded ? 'ok' : 'loading'}`}>
          <i aria-hidden="true" />
          {loadError ? 'Conexión interrumpida' : hasLoaded ? 'Datos sincronizados' : 'Conectando…'}
        </span>
        {loadError && <button type="button" className="supplier-retry" onClick={() => load()}>Reintentar</button>}
      </div>

      <div className="suppliers-metrics" aria-label="Resumen de proveedores">
        <article><span>Total</span><strong>{metric(rows.length)}</strong><small>{hasLoaded ? 'registrados' : 'pendiente de cargar'}</small></article>
        <article><span>Activos</span><strong>{metric(activeCount)}</strong><small>disponibles para compras</small></article>
        <article><span>Inactivos</span><strong>{metric(inactiveCount)}</strong><small>fuera de operación</small></article>
        <article><span>Categorías</span><strong>{metric(supplierTypes)}</strong><small>tipos utilizados</small></article>
      </div>

      {loadError && (
        <div className="supplier-load-error" role="alert">
          <strong>No se pudo actualizar el directorio.</strong>
          <span>{loadError}</span>
          {rows.length > 0 && <small>Se mantienen visibles los últimos datos cargados.</small>}
        </div>
      )}

      {message && <p className={`feedback ${messageType}`} role="status">{message}</p>}

      {showForm && (
        <form className="panel supplier-create-card" onSubmit={save}>
          <div className="supplier-form-head">
            <div>
              <p className="form-kicker">{editingId ? 'EDITAR PROVEEDOR' : 'NUEVO PROVEEDOR'}</p>
              <h3>{editingId ? 'Actualizar información' : 'Información del proveedor'}</h3>
            </div>
            <p>La razón social es obligatoria. El resto puede completarse después.</p>
          </div>

          <fieldset className="supplier-fieldset">
            <legend>Identificación</legend>
            <div className="form-grid three">
              <label className="field form-span-2"><span>Nombre / razón social *</span><input autoFocus required value={form.name} onChange={(event) => updateForm('name', event.target.value)} /></label>
              <label className="field"><span>Tipo de proveedor</span><select value={form.supplier_type} onChange={(event) => updateForm('supplier_type', event.target.value)}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>Nombre comercial</span><input value={form.trade_name} onChange={(event) => updateForm('trade_name', event.target.value)} /></label>
              <label className="field"><span>NIT</span><input value={form.nit} onChange={(event) => updateForm('nit', event.target.value)} /></label>
              <label className="field"><span>NRC</span><input value={form.nrc} onChange={(event) => updateForm('nrc', event.target.value)} /></label>
            </div>
          </fieldset>

          <fieldset className="supplier-fieldset">
            <legend>Contacto</legend>
            <div className="form-grid three">
              <label className="field"><span>Persona de contacto</span><input value={form.contact_name} onChange={(event) => updateForm('contact_name', event.target.value)} /></label>
              <label className="field"><span>Teléfono</span><input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} /></label>
              <label className="field"><span>Correo</span><input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} /></label>
              <label className="field form-span-3"><span>Dirección</span><input value={form.address} onChange={(event) => updateForm('address', event.target.value)} /></label>
              <label className="field form-span-3"><span>Notas</span><textarea rows="2" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            </div>
          </fieldset>

          <div className="form-actions end supplier-form-actions">
            <button type="button" className="supplier-secondary" onClick={closeForm}>Cancelar</button>
            <button type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar proveedor'}</button>
          </div>
        </form>
      )}

      <section className="panel suppliers-list-card">
        <div className="supplier-list-heading">
          <div><p className="form-kicker">DIRECTORIO</p><h3>Proveedores registrados</h3><p>{hasLoaded ? `${filteredRows.length} de ${rows.length} proveedores` : 'Esperando datos…'}</p></div>
          <div className="supplier-list-tools">
            <input aria-label="Buscar proveedores" placeholder="Buscar por nombre, NIT, NRC, contacto…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="Filtrar proveedores por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">Todos los estados</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
            <select aria-label="Filtrar proveedores por tipo" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="ALL">Todos los tipos</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {loading && !hasLoaded ? (
          <div className="supplier-loading-state"><span className="spinner" /><strong>Cargando proveedores…</strong></div>
        ) : filteredRows.length ? (
          <div className="supplier-table-wrap">
            <table className="supplier-table">
              <thead><tr><th>Proveedor</th><th>Tipo</th><th>Contacto</th><th>Identificación</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>{filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong><small>{row.trade_name || row.address || 'Sin datos adicionales'}</small></td>
                  <td>{TYPE_LABELS[row.supplier_type] || row.supplier_type || 'Otro'}</td>
                  <td><strong>{row.contact_name || 'Sin contacto'}</strong><small>{row.phone || row.email || 'Sin datos de contacto'}</small></td>
                  <td><span>NIT {row.nit || '—'}</span><small>NRC {row.nrc || '—'}</small></td>
                  <td><span className={`supplier-status ${row.active ? 'active' : 'inactive'}`}>{row.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td><div className="supplier-row-actions"><button type="button" className="supplier-row-action" onClick={() => edit(row)}>Editar</button><button type="button" className="supplier-row-action" onClick={() => toggle(row)}>{row.active ? 'Desactivar' : 'Activar'}</button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : hasLoaded ? (
          <div className="empty-state supplier-empty">
            <strong>{rows.length ? 'Sin coincidencias' : 'Todavía no hay proveedores'}</strong>
            <p>{rows.length ? 'Prueba otro término de búsqueda o cambia los filtros.' : 'Usa “+ Nuevo proveedor” para registrar el primero.'}</p>
          </div>
        ) : (
          <div className="empty-state supplier-empty supplier-empty-error">
            <strong>Directorio no disponible</strong>
            <p>Reintenta la conexión para consultar los proveedores. No mostramos ceros como si fueran datos reales.</p>
          </div>
        )}
      </section>
    </section>
  )
}
