import { useEffect, useMemo, useState } from 'react'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const normalizeText = (value) => String(value || '').trim()
const emptyForm = () => ({
  id: '', sku: '', name: '', category: '', subcategory: '', unit: 'unidad', status: 'ACTIVE',
  short_description: '', description: '', technical_description: '', internal_notes: '', image_url: '', tags_text: '',
  sale_price: '', minimum_price: '', cost_estimate: '', labor_cost: '', installation_cost: '', price_per_m2: '',
  width: '', height: '', dimension_unit: 'm', min_quantity: '1', estimated_minutes: '', lead_time_days: '',
  taxable: true, tax_rate: '13', design_included: false, installation_included: false,
  requires_production: true, affects_inventory: false, active: true,
})

const units = ['unidad', 'm²', 'metro', 'metro lineal', 'paquete', 'docena', 'ciento', 'juego', 'trabajo', 'servicio']
const statuses = [
  ['ACTIVE', 'Activo'], ['INACTIVE', 'Inactivo'], ['TEMPORARY', 'Temporal'], ['DISCONTINUED', 'Descontinuado'],
]
const sorters = {
  name: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
  price_desc: (a, b) => number(b.sale_price) - number(a.sale_price),
  price_asc: (a, b) => number(a.sale_price) - number(b.sale_price),
  margin_desc: (a, b) => marginOf(b) - marginOf(a),
  recent: (a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0),
}

function totalCost(row) {
  return number(row.cost_estimate) + number(row.labor_cost) + number(row.installation_cost)
}
function profitOf(row) { return number(row.sale_price) - totalCost(row) }
function marginOf(row) { const sale = number(row.sale_price); return sale > 0 ? (profitOf(row) / sale) * 100 : 0 }
function areaM2(row) {
  const w = number(row.width), h = number(row.height)
  if (!w || !h) return 0
  const factor = row.dimension_unit === 'cm' ? 0.01 : row.dimension_unit === 'mm' ? 0.001 : 1
  return w * factor * h * factor
}
function skuSeed(name) {
  const head = normalizeText(name).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'PROD'
  return `${head}-${Date.now().toString(36).toUpperCase().slice(-5)}`
}

export default function Products360Module({ company, supabase }) {
  const [rows, setRows] = useState([])
  const [variants, setVariants] = useState([])
  const [tiers, setTiers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('name')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const [detailOpen, setDetailOpen] = useState(true)
  const [variantForm, setVariantForm] = useState({ name: '', sku: '', attributes_text: '', sale_price: '', cost_estimate: '' })
  const [tierForm, setTierForm] = useState({ min_quantity: '', max_quantity: '', unit_price: '', notes: '' })

  const load = async () => {
    setMessage({ type: '', text: '' })
    const { data, error } = await supabase.from('finished_products').select('*').eq('company_id', company.id).order('name')
    if (error) {
      setMessage({ type: 'error', text: error.message.includes('column') ? 'Falta aplicar la migración 0099_products_360.sql en Supabase.' : error.message })
      return
    }
    setRows(data || [])
  }

  const loadChildren = async (productId) => {
    if (!productId) { setVariants([]); setTiers([]); return }
    const [v, t] = await Promise.all([
      supabase.from('product_variants').select('*').eq('company_id', company.id).eq('product_id', productId).order('sort_order').order('name'),
      supabase.from('product_price_tiers').select('*').eq('company_id', company.id).eq('product_id', productId).order('min_quantity'),
    ])
    if (v.error || t.error) {
      setMessage({ type: 'error', text: 'No se pudieron cargar variantes o escalas. Verificá la migración Productos 360.' })
      return
    }
    setVariants(v.data || [])
    setTiers(t.data || [])
  }

  useEffect(() => { load() }, [company.id])
  useEffect(() => { loadChildren(form.id) }, [form.id])

  const categories = useMemo(() => [...new Set(rows.map(r => normalizeText(r.category)).filter(Boolean))].sort(), [rows])
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return [...rows]
      .filter(r => categoryFilter === 'ALL' || r.category === categoryFilter)
      .filter(r => statusFilter === 'ALL' || (r.status || (r.active ? 'ACTIVE' : 'INACTIVE')) === statusFilter)
      .filter(r => !q || [r.sku, r.name, r.category, r.subcategory, r.description, r.short_description, ...(r.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort(sorters[sortBy] || sorters.name)
  }, [rows, query, categoryFilter, statusFilter, sortBy])

  const stats = useMemo(() => {
    const active = rows.filter(r => (r.status || (r.active ? 'ACTIVE' : 'INACTIVE')) === 'ACTIVE')
    const avgPrice = active.length ? active.reduce((s, r) => s + number(r.sale_price), 0) / active.length : 0
    const avgMargin = active.length ? active.reduce((s, r) => s + marginOf(r), 0) / active.length : 0
    const noCost = active.filter(r => totalCost(r) <= 0).length
    return { total: rows.length, active: active.length, categories: categories.length, avgPrice, avgMargin, noCost }
  }, [rows, categories])

  const calculatedArea = areaM2(form)
  const suggestedM2Price = calculatedArea > 0 && number(form.price_per_m2) > 0 ? calculatedArea * number(form.price_per_m2) : 0
  const formCost = totalCost(form)
  const formProfit = number(form.sale_price) - formCost
  const formMargin = number(form.sale_price) > 0 ? (formProfit / number(form.sale_price)) * 100 : 0

  const update = (name, value) => setForm(current => ({ ...current, [name]: value }))
  const reset = () => { setForm(emptyForm()); setVariants([]); setTiers([]); setVariantForm({ name: '', sku: '', attributes_text: '', sale_price: '', cost_estimate: '' }); setTierForm({ min_quantity: '', max_quantity: '', unit_price: '', notes: '' }); setMessage({ type: '', text: '' }) }

  const edit = (row) => {
    setForm({
      ...emptyForm(), ...row,
      tags_text: (row.tags || []).join(', '),
      sale_price: row.sale_price ?? '', minimum_price: row.minimum_price ?? '', cost_estimate: row.cost_estimate ?? '',
      labor_cost: row.labor_cost ?? '', installation_cost: row.installation_cost ?? '', price_per_m2: row.price_per_m2 ?? '',
      width: row.width ?? '', height: row.height ?? '', min_quantity: row.min_quantity ?? '1', estimated_minutes: row.estimated_minutes ?? '', lead_time_days: row.lead_time_days ?? '',
      tax_rate: row.tax_rate ?? '13', status: row.status || (row.active ? 'ACTIVE' : 'INACTIVE'),
    })
    setDetailOpen(true)
    setMessage({ type: '', text: '' })
  }

  const payloadFromForm = () => ({
    company_id: company.id,
    sku: normalizeText(form.sku) || skuSeed(form.name),
    name: normalizeText(form.name), category: normalizeText(form.category), subcategory: normalizeText(form.subcategory),
    unit: form.unit, status: form.status, active: form.status === 'ACTIVE' || form.status === 'TEMPORARY',
    short_description: normalizeText(form.short_description), description: normalizeText(form.description), technical_description: normalizeText(form.technical_description),
    internal_notes: normalizeText(form.internal_notes), image_url: normalizeText(form.image_url) || null,
    tags: form.tags_text.split(',').map(x => x.trim()).filter(Boolean),
    sale_price: number(form.sale_price), minimum_price: number(form.minimum_price), cost_estimate: number(form.cost_estimate), labor_cost: number(form.labor_cost), installation_cost: number(form.installation_cost), price_per_m2: number(form.price_per_m2),
    width: form.width === '' ? null : number(form.width), height: form.height === '' ? null : number(form.height), dimension_unit: form.dimension_unit,
    min_quantity: Math.max(0.01, number(form.min_quantity, 1)), estimated_minutes: form.estimated_minutes === '' ? null : Math.max(0, number(form.estimated_minutes)), lead_time_days: form.lead_time_days === '' ? null : Math.max(0, Math.round(number(form.lead_time_days))),
    taxable: !!form.taxable, tax_rate: form.taxable ? Math.max(0, number(form.tax_rate, 13)) : 0,
    design_included: !!form.design_included, installation_included: !!form.installation_included, requires_production: !!form.requires_production, affects_inventory: !!form.affects_inventory,
  })

  const save = async (event) => {
    event.preventDefault()
    if (!normalizeText(form.name)) return setMessage({ type: 'error', text: 'El nombre del producto o trabajo es obligatorio.' })
    if (number(form.sale_price) < 0) return setMessage({ type: 'error', text: 'El precio no puede ser negativo.' })
    if (number(form.minimum_price) > number(form.sale_price) && number(form.sale_price) > 0) return setMessage({ type: 'error', text: 'El precio mínimo no puede superar el precio de venta.' })
    setBusy(true); setMessage({ type: '', text: '' })
    const payload = payloadFromForm()
    const request = form.id
      ? supabase.from('finished_products').update(payload).eq('id', form.id).eq('company_id', company.id).select().single()
      : supabase.from('finished_products').insert(payload).select().single()
    const { data, error } = await request
    if (error) setMessage({ type: 'error', text: error.message.includes('duplicate') ? 'Ese SKU ya existe en la empresa.' : error.message })
    else {
      await load()
      edit(data)
      setMessage({ type: 'success', text: form.id ? 'Producto actualizado correctamente.' : 'Producto creado correctamente. Ya puede usarse en cotizaciones.' })
    }
    setBusy(false)
  }

  const duplicate = async (row) => {
    setBusy(true)
    const copy = { ...row }
    delete copy.id; delete copy.created_at; delete copy.updated_at
    copy.name = `${row.name} (copia)`
    copy.sku = skuSeed(row.name)
    const { data, error } = await supabase.from('finished_products').insert(copy).select().single()
    if (error) setMessage({ type: 'error', text: error.message })
    else {
      const [v, t] = await Promise.all([
        supabase.from('product_variants').select('*').eq('product_id', row.id),
        supabase.from('product_price_tiers').select('*').eq('product_id', row.id),
      ])
      if (v.data?.length) await supabase.from('product_variants').insert(v.data.map((item, i) => ({ company_id: company.id, product_id: data.id, name: item.name, sku: item.sku ? `${item.sku}-C${i + 1}` : null, attributes: item.attributes || {}, sale_price: item.sale_price, cost_estimate: item.cost_estimate, active: item.active, sort_order: item.sort_order })))
      if (t.data?.length) await supabase.from('product_price_tiers').insert(t.data.map(item => ({ company_id: company.id, product_id: data.id, min_quantity: item.min_quantity, max_quantity: item.max_quantity, unit_price: item.unit_price, notes: item.notes, active: item.active })))
      await load(); edit(data); setMessage({ type: 'success', text: 'Producto duplicado con sus escalas y variantes.' })
    }
    setBusy(false)
  }

  const toggleActive = async (row) => {
    const activeNow = (row.status || (row.active ? 'ACTIVE' : 'INACTIVE')) === 'ACTIVE'
    const { error } = await supabase.from('finished_products').update({ active: !activeNow, status: activeNow ? 'INACTIVE' : 'ACTIVE' }).eq('id', row.id).eq('company_id', company.id)
    if (error) setMessage({ type: 'error', text: error.message }); else { await load(); if (form.id === row.id) edit({ ...row, active: !activeNow, status: activeNow ? 'INACTIVE' : 'ACTIVE' }) }
  }

  const remove = async (row) => {
    if (!window.confirm(`¿Eliminar “${row.name}”? Si ya fue usado en documentos, se desactivará en lugar de borrarse.`)) return
    setBusy(true)
    const [{ count: quoteCount }, { count: workCount }] = await Promise.all([
      supabase.from('quote_items').select('id', { count: 'exact', head: true }).eq('product_id', row.id),
      supabase.from('work_order_items').select('id', { count: 'exact', head: true }).eq('product_id', row.id),
    ])
    if (number(quoteCount) + number(workCount) > 0) {
      const { error } = await supabase.from('finished_products').update({ active: false, status: 'DISCONTINUED' }).eq('id', row.id).eq('company_id', company.id)
      setMessage(error ? { type: 'error', text: error.message } : { type: 'success', text: 'El producto tiene historial comercial; se marcó como descontinuado para conservar trazabilidad.' })
    } else {
      const { error } = await supabase.from('finished_products').delete().eq('id', row.id).eq('company_id', company.id)
      setMessage(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Producto eliminado.' })
      if (!error && form.id === row.id) reset()
    }
    await load(); setBusy(false)
  }

  const addVariant = async () => {
    if (!form.id) return setMessage({ type: 'error', text: 'Guardá primero el producto principal.' })
    if (!normalizeText(variantForm.name)) return setMessage({ type: 'error', text: 'La variante necesita un nombre.' })
    let attributes = {}
    variantForm.attributes_text.split(',').map(x => x.trim()).filter(Boolean).forEach(pair => { const [k, ...rest] = pair.split(':'); if (k && rest.length) attributes[k.trim()] = rest.join(':').trim() })
    const { error } = await supabase.from('product_variants').insert({ company_id: company.id, product_id: form.id, name: normalizeText(variantForm.name), sku: normalizeText(variantForm.sku) || null, attributes, sale_price: variantForm.sale_price === '' ? null : number(variantForm.sale_price), cost_estimate: variantForm.cost_estimate === '' ? null : number(variantForm.cost_estimate), sort_order: variants.length })
    if (error) setMessage({ type: 'error', text: error.message }); else { setVariantForm({ name: '', sku: '', attributes_text: '', sale_price: '', cost_estimate: '' }); await loadChildren(form.id); setMessage({ type: 'success', text: 'Variante agregada.' }) }
  }

  const deleteVariant = async (id) => { await supabase.from('product_variants').delete().eq('id', id).eq('company_id', company.id); await loadChildren(form.id) }

  const addTier = async () => {
    if (!form.id) return setMessage({ type: 'error', text: 'Guardá primero el producto principal.' })
    if (number(tierForm.min_quantity) <= 0 || number(tierForm.unit_price) < 0) return setMessage({ type: 'error', text: 'Completá correctamente cantidad mínima y precio.' })
    const { error } = await supabase.from('product_price_tiers').insert({ company_id: company.id, product_id: form.id, min_quantity: number(tierForm.min_quantity), max_quantity: tierForm.max_quantity === '' ? null : number(tierForm.max_quantity), unit_price: number(tierForm.unit_price), notes: normalizeText(tierForm.notes) || null })
    if (error) setMessage({ type: 'error', text: error.message }); else { setTierForm({ min_quantity: '', max_quantity: '', unit_price: '', notes: '' }); await loadChildren(form.id); setMessage({ type: 'success', text: 'Escala de precio agregada.' }) }
  }

  const deleteTier = async (id) => { await supabase.from('product_price_tiers').delete().eq('id', id).eq('company_id', company.id); await loadChildren(form.id) }

  const applyM2 = () => { if (suggestedM2Price > 0) update('sale_price', suggestedM2Price.toFixed(2)) }

  return <section className="products360">
    <div className="products360-hero">
      <div><p className="form-kicker">CATÁLOGO COMERCIAL 360</p><h2>Productos y trabajos terminados</h2><p>Administrá precios, costos, margen, medidas, variantes, escalas y datos de producción de todo lo que recibe el cliente.</p></div>
      <div className="products360-hero-actions"><button type="button" className="secondary-action" onClick={reset}>Nuevo producto</button><span className="status dte-ready">{stats.active} activos</span></div>
    </div>

    {message.text && <p className={`feedback ${message.type === 'error' ? 'error' : 'success'}`}>{message.text}</p>}

    <section className="products360-kpis">
      <Metric label="Catálogo total" value={stats.total} />
      <Metric label="Activos" value={stats.active} />
      <Metric label="Categorías" value={stats.categories} />
      <Metric label="Precio promedio" value={money(stats.avgPrice)} />
      <Metric label="Margen promedio" value={`${stats.avgMargin.toFixed(1)}%`} warn={stats.avgMargin < 25} />
      <Metric label="Sin costo definido" value={stats.noCost} warn={stats.noCost > 0} />
    </section>

    <section className="panel products360-toolbar">
      <input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por SKU, nombre, categoría, descripción o etiqueta" />
      <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="ALL">Todas las categorías</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">Todos los estados</option>{statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="name">Orden: nombre</option><option value="recent">Más recientes</option><option value="price_desc">Precio mayor</option><option value="price_asc">Precio menor</option><option value="margin_desc">Margen mayor</option></select>
      <span className="products360-result-count">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
    </section>

    <section className="products360-layout">
      <section className="panel products360-list-panel">
        <div className="panel-heading"><div><p className="form-kicker">CATÁLOGO</p><h3>Productos disponibles</h3></div></div>
        {filtered.length ? <div className="products360-list">{filtered.map(row => <article key={row.id} className={`product360-row ${form.id === row.id ? 'selected' : ''}`} onClick={() => edit(row)}>
          <div className="product360-thumb">{row.image_url ? <img src={row.image_url} alt="" onError={e => { e.currentTarget.style.display = 'none' }} /> : <span>{String(row.name || 'P').charAt(0).toUpperCase()}</span>}</div>
          <div className="product360-main"><div className="product360-titleline"><strong>{row.name}</strong><small>{row.sku || 'Sin SKU'}</small></div><p>{row.short_description || row.description || 'Sin descripción comercial'}</p><div className="product360-tags"><span>{row.category || 'Sin categoría'}</span>{row.subcategory && <span>{row.subcategory}</span>}<span>{row.unit || 'unidad'}</span><span className={`product-state ${(row.status || '').toLowerCase()}`}>{statuses.find(([v]) => v === (row.status || (row.active ? 'ACTIVE' : 'INACTIVE')))?.[1] || row.status}</span></div></div>
          <div className="product360-finance"><strong>{money(row.sale_price)}</strong><small>Costo {money(totalCost(row))}</small><small className={marginOf(row) < 25 ? 'danger-text' : ''}>Margen {marginOf(row).toFixed(1)}%</small></div>
        </article>)}</div> : <div className="empty-state"><strong>No hay coincidencias</strong><p>Creá un producto nuevo o cambiá los filtros.</p></div>}
      </section>

      <form className="panel products360-editor" onSubmit={save}>
        <div className="panel-heading products360-editor-head"><div><p className="form-kicker">{form.id ? 'EDITANDO PRODUCTO' : 'NUEVO PRODUCTO'}</p><h3>{form.id ? form.name : 'Ficha comercial completa'}</h3></div><button type="button" className="text-action" onClick={() => setDetailOpen(v => !v)}>{detailOpen ? 'Contraer' : 'Expandir'}</button></div>
        {detailOpen && <>
          <div className="form-section-title">Identificación</div>
          <div className="form-grid three">
            <label className="field form-span-2"><span>Nombre comercial *</span><input required value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej. Camisa personalizada full color" /></label>
            <label className="field"><span>SKU / código</span><input value={form.sku} onChange={e => update('sku', e.target.value.toUpperCase())} placeholder="Automático si se deja vacío" /></label>
            <label className="field"><span>Categoría</span><input list="product-categories" value={form.category} onChange={e => update('category', e.target.value)} placeholder="Sublimación, rótulos..." /><datalist id="product-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></label>
            <label className="field"><span>Subcategoría</span><input value={form.subcategory} onChange={e => update('subcategory', e.target.value)} /></label>
            <label className="field"><span>Estado</span><select value={form.status} onChange={e => update('status', e.target.value)}>{statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="field"><span>Unidad de venta</span><select value={form.unit} onChange={e => update('unit', e.target.value)}>{units.map(u => <option key={u}>{u}</option>)}</select></label>
            <label className="field"><span>Cantidad mínima</span><input type="number" min="0.01" step="0.01" value={form.min_quantity} onChange={e => update('min_quantity', e.target.value)} /></label>
            <label className="field"><span>Etiquetas</span><input value={form.tags_text} onChange={e => update('tags_text', e.target.value)} placeholder="premium, urgente, exterior" /></label>
            <label className="field form-span-3"><span>Descripción corta comercial</span><input value={form.short_description} onChange={e => update('short_description', e.target.value)} placeholder="Texto breve para cotizaciones y búsqueda" /></label>
            <label className="field form-span-3"><span>Descripción / alcance</span><textarea rows="2" value={form.description} onChange={e => update('description', e.target.value)} /></label>
            <label className="field form-span-3"><span>Especificación técnica</span><textarea rows="2" value={form.technical_description} onChange={e => update('technical_description', e.target.value)} placeholder="Materiales, acabados, tolerancias, condiciones..." /></label>
          </div>

          <div className="form-section-title">Precio, costo y rentabilidad</div>
          <div className="form-grid four">
            <label className="field"><span>Precio de venta *</span><input type="number" min="0" step="0.01" required value={form.sale_price} onChange={e => update('sale_price', e.target.value)} /></label>
            <label className="field"><span>Precio mínimo</span><input type="number" min="0" step="0.01" value={form.minimum_price} onChange={e => update('minimum_price', e.target.value)} /></label>
            <label className="field"><span>Costo base</span><input type="number" min="0" step="0.01" value={form.cost_estimate} onChange={e => update('cost_estimate', e.target.value)} /></label>
            <label className="field"><span>Mano de obra</span><input type="number" min="0" step="0.01" value={form.labor_cost} onChange={e => update('labor_cost', e.target.value)} /></label>
            <label className="field"><span>Costo instalación</span><input type="number" min="0" step="0.01" value={form.installation_cost} onChange={e => update('installation_cost', e.target.value)} /></label>
            <label className="field"><span>Precio por m²</span><input type="number" min="0" step="0.01" value={form.price_per_m2} onChange={e => update('price_per_m2', e.target.value)} /></label>
            <label className="field"><span>IVA</span><select value={form.taxable ? 'yes' : 'no'} onChange={e => update('taxable', e.target.value === 'yes')}><option value="yes">Gravado</option><option value="no">No gravado</option></select></label>
            <label className="field"><span>Tasa IVA %</span><input type="number" min="0" step="0.01" disabled={!form.taxable} value={form.tax_rate} onChange={e => update('tax_rate', e.target.value)} /></label>
          </div>
          <div className="product360-profit-strip"><div><span>Costo total</span><strong>{money(formCost)}</strong></div><div><span>Utilidad estimada</span><strong>{money(formProfit)}</strong></div><div><span>Margen</span><strong className={formMargin < 25 ? 'danger-text' : ''}>{formMargin.toFixed(1)}%</strong></div><div><span>Markup sobre costo</span><strong>{formCost > 0 ? `${((formProfit / formCost) * 100).toFixed(1)}%` : '—'}</strong></div></div>

          <div className="form-section-title">Medidas y cálculo por superficie</div>
          <div className="form-grid four">
            <label className="field"><span>Ancho</span><input type="number" min="0" step="0.0001" value={form.width} onChange={e => update('width', e.target.value)} /></label>
            <label className="field"><span>Alto</span><input type="number" min="0" step="0.0001" value={form.height} onChange={e => update('height', e.target.value)} /></label>
            <label className="field"><span>Unidad de medida</span><select value={form.dimension_unit} onChange={e => update('dimension_unit', e.target.value)}><option value="m">Metros</option><option value="cm">Centímetros</option><option value="mm">Milímetros</option></select></label>
            <label className="field"><span>Área calculada</span><input readOnly value={`${calculatedArea.toFixed(4)} m²`} /></label>
          </div>
          {suggestedM2Price > 0 && <div className="product360-calculator"><span>Precio calculado por superficie: <strong>{money(suggestedM2Price)}</strong></span><button type="button" className="secondary-action" onClick={applyM2}>Usar como precio de venta</button></div>}

          <div className="form-section-title">Producción y condiciones</div>
          <div className="form-grid four">
            <label className="field"><span>Tiempo estimado (min)</span><input type="number" min="0" value={form.estimated_minutes} onChange={e => update('estimated_minutes', e.target.value)} /></label>
            <label className="field"><span>Plazo estimado (días)</span><input type="number" min="0" value={form.lead_time_days} onChange={e => update('lead_time_days', e.target.value)} /></label>
            <label className="field"><span>Imagen / referencia URL</span><input type="url" value={form.image_url} onChange={e => update('image_url', e.target.value)} placeholder="https://..." /></label>
            <label className="field form-span-4"><span>Notas internas de producción</span><textarea rows="2" value={form.internal_notes} onChange={e => update('internal_notes', e.target.value)} /></label>
          </div>
          <div className="product360-checks">
            <Toggle label="Diseño incluido" checked={form.design_included} onChange={v => update('design_included', v)} />
            <Toggle label="Instalación incluida" checked={form.installation_included} onChange={v => update('installation_included', v)} />
            <Toggle label="Requiere producción" checked={form.requires_production} onChange={v => update('requires_production', v)} />
            <Toggle label="Afecta inventario" checked={form.affects_inventory} onChange={v => update('affects_inventory', v)} />
          </div>

          {form.image_url && <div className="product360-image-preview"><img src={form.image_url} alt={`Referencia de ${form.name || 'producto'}`} onError={e => { e.currentTarget.style.display = 'none' }} /></div>}
        </>}

        <div className="form-actions products360-savebar"><button type="button" className="secondary-action" onClick={reset}>Limpiar</button>{form.id && <button type="button" className="secondary-action" onClick={() => duplicate(form)} disabled={busy}>Duplicar</button>}{form.id && <button type="button" className="secondary-action" onClick={() => toggleActive(form)} disabled={busy}>{form.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</button>}{form.id && <button type="button" className="danger-action" onClick={() => remove(form)} disabled={busy}>Eliminar</button>}<button disabled={busy}>{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear producto'}</button></div>
      </form>
    </section>

    {form.id && <section className="products360-subgrid">
      <section className="panel">
        <div className="panel-heading"><div><p className="form-kicker">VARIANTES</p><h3>Tamaños, colores, materiales y acabados</h3></div><span>{variants.length}</span></div>
        <div className="form-grid five compact-grid"><label className="field"><span>Nombre *</span><input value={variantForm.name} onChange={e => setVariantForm({ ...variantForm, name: e.target.value })} placeholder="XL / Negro / Mate" /></label><label className="field"><span>SKU</span><input value={variantForm.sku} onChange={e => setVariantForm({ ...variantForm, sku: e.target.value.toUpperCase() })} /></label><label className="field"><span>Atributos</span><input value={variantForm.attributes_text} onChange={e => setVariantForm({ ...variantForm, attributes_text: e.target.value })} placeholder="Talla:XL, Color:Negro" /></label><label className="field"><span>Precio</span><input type="number" step="0.01" value={variantForm.sale_price} onChange={e => setVariantForm({ ...variantForm, sale_price: e.target.value })} /></label><label className="field"><span>Costo</span><input type="number" step="0.01" value={variantForm.cost_estimate} onChange={e => setVariantForm({ ...variantForm, cost_estimate: e.target.value })} /></label></div>
        <div className="form-actions end"><button type="button" onClick={addVariant}>Agregar variante</button></div>
        {variants.length ? <div className="mini-table">{variants.map(v => <div className="mini-table-row" key={v.id}><div><strong>{v.name}</strong><small>{v.sku || 'Sin SKU'} · {Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(' · ') || 'Sin atributos'}</small></div><div><strong>{v.sale_price == null ? 'Precio base' : money(v.sale_price)}</strong><small>{v.cost_estimate == null ? 'Costo base' : `Costo ${money(v.cost_estimate)}`}</small></div><button type="button" className="text-danger-action" onClick={() => deleteVariant(v.id)}>Quitar</button></div>)}</div> : <div className="empty-state compact"><strong>Sin variantes</strong><p>El producto usa una sola configuración.</p></div>}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="form-kicker">PRECIOS POR CANTIDAD</p><h3>Escalas y descuentos comerciales</h3></div><span>{tiers.length}</span></div>
        <div className="form-grid four compact-grid"><label className="field"><span>Desde *</span><input type="number" min="0.01" step="0.01" value={tierForm.min_quantity} onChange={e => setTierForm({ ...tierForm, min_quantity: e.target.value })} /></label><label className="field"><span>Hasta</span><input type="number" min="0.01" step="0.01" value={tierForm.max_quantity} onChange={e => setTierForm({ ...tierForm, max_quantity: e.target.value })} placeholder="Sin límite" /></label><label className="field"><span>Precio unitario *</span><input type="number" min="0" step="0.01" value={tierForm.unit_price} onChange={e => setTierForm({ ...tierForm, unit_price: e.target.value })} /></label><label className="field"><span>Nota</span><input value={tierForm.notes} onChange={e => setTierForm({ ...tierForm, notes: e.target.value })} placeholder="Mayorista, evento..." /></label></div>
        <div className="form-actions end"><button type="button" onClick={addTier}>Agregar escala</button></div>
        {tiers.length ? <div className="mini-table">{tiers.map(t => <div className="mini-table-row" key={t.id}><div><strong>{t.min_quantity} – {t.max_quantity || '∞'} {form.unit}</strong><small>{t.notes || 'Escala automática'}</small></div><div><strong>{money(t.unit_price)}</strong><small>por {form.unit}</small></div><button type="button" className="text-danger-action" onClick={() => deleteTier(t.id)}>Quitar</button></div>)}</div> : <div className="empty-state compact"><strong>Sin escalas</strong><p>Se usará el precio base en todas las cantidades.</p></div>}
      </section>
    </section>}
  </section>
}

function Metric({ label, value, warn }) { return <article className={`product360-kpi ${warn ? 'warn' : ''}`}><span>{label}</span><strong>{value}</strong></article> }
function Toggle({ label, checked, onChange }) { return <label className="product360-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span>{label}</span></label> }
