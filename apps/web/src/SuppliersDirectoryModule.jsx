import { useEffect, useMemo, useState } from 'react'
import './suppliers-directory.css'

const EMPTY_FORM = {
  name: '',
  trade_name: '',
  nit: '',
  nrc: '',
  contact_name: '',
  phone: '',
  email: '',
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

export default function SuppliersDirectoryModule({ company, supabase }) {
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const load = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('company_id', company.id)
      .order('name')

    if (error) {
      setMessageType('error')
      setMessage(error.message)
      return
    }
    setRows(data || [])
  }

  useEffect(() => {
    load()
  }, [company.id])

  const activeCount = useMemo(() => rows.filter((row) => row.active).length, [rows])
  const inactiveCount = rows.length - activeCount
  const supplierTypes = useMemo(() => new Set(rows.map((row) => row.supplier_type).filter(Boolean)).size, [rows])

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter === 'ACTIVE' && !row.active) return false
      if (statusFilter === 'INACTIVE' && row.active) return false
      if (!term) return true
      return [row.name, row.trade_name, row.nit, row.nrc, row.contact_name, row.phone, row.email, TYPE_LABELS[row.supplier_type]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [rows, query, statusFilter])

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const closeForm = () => {
    setShowForm(false)
    setForm(EMPTY_FORM)
  }

  const save = async (event) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return

    const normalizedNit = form.nit.trim()
    const duplicate = rows.find((row) => normalizedNit && String(row.nit || '').trim() === normalizedNit)
    if (duplicate) {
      setMessageType('error')
      setMessage(`Ya existe un proveedor con el NIT ${normalizedNit}: ${duplicate.name}.`)
      return
    }

    setSaving(true)
    setMessage('')
    const payload = Object.fromEntries(
      Object.entries({ ...form, name }).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    )
    const { error } = await supabase.from('suppliers').insert({ ...payload, company_id: company.id })

    if (error) {
      setMessageType('error')
      setMessage(error.message)
      setSaving(false)
      return
    }

    setMessageType('success')
    setMessage('Proveedor guardado correctamente.')
    setForm(EMPTY_FORM)
    setShowForm(false)
    await load()
    setSaving(false)
  }

  const toggle = async (row) => {
    const { error } = await supabase
      .from('suppliers')
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq('id', row.id)

    setMessageType(error ? 'error' : 'success')
    setMessage(error ? error.message : row.active ? 'Proveedor desactivado.' : 'Proveedor activado.')
    if (!error) await load()
  }

  return (
    <section className="suppliers-directory">
      <div className="suppliers-hero">
        <div>
          <p className="form-kicker">ABASTECIMIENTO</p>
          <h2>Proveedores</h2>
          <p>Directorio de empresas y personas que suministran materiales, servicios, transporte y gastos operativos.</p>
        </div>
        <button type="button" className="suppliers-primary" onClick={() => setShowForm((current) => !current)}>
          {showForm ? 'Cerrar registro' : '+ Nuevo proveedor'}
        </button>
      </div>

      <div className="suppliers-metrics" aria-label="Resumen de proveedores">
        <article><span>Total</span><strong>{rows.length}</strong><small>registrados</small></article>
        <article><span>Activos</span><strong>{activeCount}</strong><small>disponibles para compras</small></article>
        <article><span>Inactivos</span><strong>{inactiveCount}</strong><small>fuera de operación</small></article>
        <article><span>Categorías</span><strong>{supplierTypes}</strong><small>tipos utilizados</small></article>
      </div>

      {message && <p className={`feedback ${messageType}`}>{message}</p>}

      {showForm && (
        <form className="panel supplier-create-card" onSubmit={save}>
          <div className="supplier-form-head">
            <div><p className="form-kicker">NUEVO PROVEEDOR</p><h3>Información del proveedor</h3></div>
            <p>Completa solo los datos que tengas disponibles. La razón social es obligatoria.</p>
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
              <label className="field form-span-3"><span>Notas</span><textarea rows="2" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            </div>
          </fieldset>

          <div className="form-actions end supplier-form-actions">
            <button type="button" className="supplier-secondary" onClick={closeForm}>Cancelar</button>
            <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar proveedor'}</button>
          </div>
        </form>
      )}

      <section className="panel suppliers-list-card">
        <div className="supplier-list-heading">
          <div><p className="form-kicker">DIRECTORIO</p><h3>Proveedores registrados</h3><p>{filteredRows.length} de {rows.length} proveedores</p></div>
          <div className="supplier-list-tools">
            <input aria-label="Buscar proveedores" placeholder="Buscar por nombre, NIT, NRC, contacto…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="Filtrar proveedores por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
          </div>
        </div>

        {filteredRows.length ? (
          <div className="supplier-table-wrap">
            <table className="supplier-table">
              <thead><tr><th>Proveedor</th><th>Tipo</th><th>Contacto</th><th>Identificación</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>{filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong><small>{row.trade_name || 'Sin nombre comercial'}</small></td>
                  <td>{TYPE_LABELS[row.supplier_type] || row.supplier_type || 'Otro'}</td>
                  <td><strong>{row.contact_name || 'Sin contacto'}</strong><small>{row.phone || row.email || 'Sin datos de contacto'}</small></td>
                  <td><span>NIT {row.nit || '—'}</span><small>NRC {row.nrc || '—'}</small></td>
                  <td><span className={`supplier-status ${row.active ? 'active' : 'inactive'}`}>{row.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td><button type="button" className="supplier-row-action" onClick={() => toggle(row)}>{row.active ? 'Desactivar' : 'Activar'}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state supplier-empty">
            <strong>{rows.length ? 'Sin coincidencias' : 'Todavía no hay proveedores'}</strong>
            <p>{rows.length ? 'Prueba otro término de búsqueda o cambia el filtro.' : 'Usa “+ Nuevo proveedor” para registrar el primero.'}</p>
          </div>
        )}
      </section>
    </section>
  )
}
