import { useEffect, useMemo, useRef, useState } from 'react'
import { calculateItem, calculateQuote, cloneItem, itemForTaxMode, number, round2, STATUS_LABELS } from './quoteEngine.js'
import { createQuotePdfBlob } from './quotePdf.js'

const money = (value) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(number(value))
const svDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offsetDays * 86400000))
const emptyItem = () => ({ product_id: '', description: '', quantity: 1, unit: 'unidad', unit_price: 0, minimum_price: 0, width: '', height: '', dimension_unit: 'm', price_per_m2: 0, discount_percent: 0, discount_fixed: 0, surcharge_percent: 0, surcharge_fixed: 0, taxable: true, tax_rate: 13, unit_cost: 0, labor_unit_cost: 0, installation_unit_cost: 0, requires_production: true, specifications: '', internal_notes: '' })
const emptyQuote = (clientId) => ({ id: '', client_id: clientId || '', code: '', number: null, status: 'DRAFT', title: '', valid_until: svDate(15), payment_method: 'TRANSFERENCIA', payment_terms: 'Contado', customer_notes: '', internal_notes: '', discount_percent: 0, discount_fixed: 0, surcharge_percent: 0, surcharge_fixed: 0, minimum_margin: 25, promised_delivery_date: '', include_tax: true, tax_mode: 'INCLUDED' })
const editableStatus = (status) => ['DRAFT', 'PREPARED', 'NEGOTIATION'].includes(status || 'DRAFT')
function Field({ label, children, wide = false }) { return <label className={`qq-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label> }
function Status({ value }) { return <span className={`q360-status st-${String(value || '').toLowerCase()}`}>{STATUS_LABELS[value] || value}</span> }
const storedItemToEditor = (item, taxMode) => {
  const base = { ...emptyItem(), ...item, discount_fixed: item.discount_fixed ?? item.discount ?? 0 }
  if (taxMode !== 'INCLUDED' || base.taxable === false) return base
  const factor = 1 + Math.max(0, number(base.tax_rate, 13)) / 100
  return { ...base, unit_price: round2(number(base.unit_price) * factor), price_per_m2: number(base.price_per_m2) > 0 ? round2(number(base.price_per_m2) * factor) : base.price_per_m2 }
}

export default function QuotesQuickModule({ company, supabase, initialClientId = '' }) {
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [quotes, setQuotes] = useState([])
  const [form, setForm] = useState(() => emptyQuote(initialClientId))
  const [items, setItems] = useState([emptyItem()])
  const [view, setView] = useState(initialClientId ? 'EDITOR' : 'LIST')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [catalogWarning, setCatalogWarning] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [pdfUrl, setPdfUrl] = useState('')
  const loadSequence = useRef(0)

  const load = async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setLoadError('')
    setCatalogWarning('')

    const [quoteResult, clientResult, productResult] = await Promise.all([
      supabase.from('quotes').select('*').eq('company_id', company.id).is('soft_deleted_at', null).order('created_at', { ascending: false }).limit(500),
      supabase.from('clients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('finished_products').select('*').eq('company_id', company.id).eq('active', true).order('name'),
    ])

    if (sequence !== loadSequence.current) return

    if (quoteResult.error) {
      setQuotes([])
      setLoadError('No se pudieron cargar las cotizaciones de la empresa activa. Reintentá la consulta.')
    } else {
      setQuotes(quoteResult.data || [])
    }

    if (clientResult.error) setClients([])
    else setClients(clientResult.data || [])

    if (productResult.error) setProducts([])
    else setProducts(productResult.data || [])

    const warnings = []
    if (clientResult.error) warnings.push('clientes')
    if (productResult.error) warnings.push('catálogo')
    if (warnings.length) setCatalogWarning(`Las cotizaciones se cargaron, pero no pudimos actualizar ${warnings.join(' y ')}. Podés reintentar sin perder información.`)

    setLoading(false)
  }

  useEffect(() => {
    setQuotes([])
    setClients([])
    setProducts([])
    setQuery('')
    setView(initialClientId ? 'EDITOR' : 'LIST')
    setForm(emptyQuote(initialClientId))
    setItems([emptyItem()])
    load()
  }, [company.id])

  useEffect(() => {
    if (initialClientId) setForm((current) => ({ ...current, client_id: initialClientId }))
  }, [initialClientId])

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  const client = useMemo(() => clients.find((row) => row.id === form.client_id), [clients, form.client_id])
  const clientById = useMemo(() => new Map(clients.map((row) => [row.id, row])), [clients])
  const quoteClientName = (row) => clientById.get(row.client_id)?.name || 'Cliente'
  const clientOptions = useMemo(() => clients.filter((row) => row.status === 'active' || row.id === form.client_id), [clients, form.client_id])
  const calculatedItems = useMemo(() => items.map((item) => itemForTaxMode(item, form.tax_mode || 'INCLUDED')), [items, form.tax_mode])
  const totals = useMemo(() => calculateQuote(calculatedItems, form), [calculatedItems, form.discount_percent, form.discount_fixed, form.surcharge_percent, form.surcharge_fixed])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return quotes.filter((row) => !needle || [row.code, row.title, quoteClientName(row)].filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [quotes, query, clientById])

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }))
  const updateItem = (index, name, value) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [name]: value } : row))
  const reset = () => {
    if (actionBusy || busy) return
    setForm(emptyQuote(initialClientId))
    setItems([emptyItem()])
    setView('EDITOR')
    setMessage({ type: '', text: '' })
  }

  const chooseProduct = (index, id) => {
    const product = products.find((row) => row.id === id)
    if (!product) return updateItem(index, 'product_id', '')
    setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      product_id: id,
      description: product.short_description || product.name,
      unit: product.unit || 'unidad',
      unit_price: number(product.sale_price),
      minimum_price: number(product.minimum_price),
      width: product.width ?? '',
      height: product.height ?? '',
      dimension_unit: product.dimension_unit || 'm',
      price_per_m2: number(product.price_per_m2),
      taxable: product.taxable !== false,
      tax_rate: number(product.tax_rate, 13),
      unit_cost: number(product.cost_estimate),
      labor_unit_cost: number(product.labor_cost),
      installation_unit_cost: number(product.installation_cost),
      requires_production: product.requires_production !== false,
      specifications: product.technical_description || '',
    } : row))
  }

  const openQuote = async (row) => {
    if (actionBusy || busy) return
    setActionBusy('open')
    setMessage({ type: '', text: '' })
    try {
      const { data, error } = await supabase.from('quote_items').select('*').eq('quote_id', row.id).order('sort_order')
      if (error) throw error
      const taxMode = row.tax_mode || (row.include_tax === false ? 'ADDED' : 'INCLUDED')
      setForm({ ...emptyQuote(row.client_id), ...row, include_tax: true, tax_mode: taxMode })
      setItems((data || []).length ? data.map((item) => storedItemToEditor(item, taxMode)) : [emptyItem()])
      setView('EDITOR')
      if (!(data || []).length) setMessage({ type: 'error', text: 'Esta cotización no tiene partidas. Revisá el expediente antes de continuar.' })
    } catch (_error) {
      setMessage({ type: 'error', text: 'No se pudo abrir la cotización. Reintentá nuevamente.' })
    } finally {
      setActionBusy('')
    }
  }

  const itemPayload = (item, index) => {
    const effective = itemForTaxMode(item, form.tax_mode || 'INCLUDED')
    const calculated = calculateItem(effective)
    return {
      product_id: item.product_id || null,
      description: String(item.description || '').trim(),
      quantity: number(item.quantity),
      unit: item.unit || 'unidad',
      unit_price: calculated.unitPrice,
      line_total: calculated.total,
      sort_order: index,
      minimum_price: number(item.minimum_price),
      width: item.width === '' ? null : number(item.width),
      height: item.height === '' ? null : number(item.height),
      dimension_unit: item.dimension_unit || 'm',
      area_m2: calculated.area,
      price_per_m2: number(effective.price_per_m2),
      discount_percent: number(item.discount_percent),
      discount_fixed: number(item.discount_fixed),
      discount: calculated.discount,
      surcharge_percent: number(item.surcharge_percent),
      surcharge_fixed: number(item.surcharge_fixed),
      taxable: item.taxable !== false,
      tax_rate: number(item.tax_rate, 13),
      tax_amount: calculated.tax,
      unit_cost: number(item.unit_cost),
      labor_unit_cost: number(item.labor_unit_cost),
      installation_unit_cost: number(item.installation_unit_cost),
      cost_total: calculated.totalCost,
      profit_total: calculated.profit,
      margin_percent: calculated.margin,
      markup_percent: calculated.markup,
      requires_production: item.requires_production !== false,
      specifications: item.specifications || null,
      internal_notes: item.internal_notes || null,
    }
  }

  const save = async () => {
    if (busy || actionBusy) return
    if (form.id && !editableStatus(form.status)) return setMessage({ type: 'error', text: 'Esta cotización ya fue enviada o aprobada. Su contenido quedó protegido.' })
    if (!form.client_id) return setMessage({ type: 'error', text: 'Seleccioná el cliente.' })
    if (client && client.status !== 'active') return setMessage({ type: 'error', text: 'El cliente está inactivo. Reactivalo o seleccioná otro cliente antes de guardar.' })
    if (!items.length || items.some((item) => !String(item.description || '').trim() || number(item.quantity) <= 0 || number(item.unit_price) < 0)) return setMessage({ type: 'error', text: 'Revisá descripción, cantidad y precio de cada producto.' })

    setBusy(true)
    setMessage({ type: '', text: '' })
    try {
      const payload = {
        client_id: form.client_id,
        title: form.title || null,
        valid_until: form.valid_until || null,
        payment_method: form.payment_method || null,
        payment_terms: form.payment_terms || null,
        promised_delivery_date: form.promised_delivery_date || null,
        customer_notes: form.customer_notes || null,
        internal_notes: form.internal_notes || null,
        tax_mode: form.tax_mode || 'INCLUDED',
        subtotal: totals.subtotal,
        tax_total: totals.tax,
        total: totals.total,
        cost_total: totals.cost,
        profit_total: totals.profit,
        margin_percent: totals.margin,
        discount_percent: number(form.discount_percent),
        discount_fixed: number(form.discount_fixed),
        surcharge_percent: number(form.surcharge_percent),
        surcharge_fixed: number(form.surcharge_fixed),
        minimum_margin: number(form.minimum_margin),
      }
      const { data, error } = await supabase.rpc('save_quote_quick', {
        p_company_id: company.id,
        p_quote_id: form.id || null,
        p_payload: payload,
        p_items: items.map(itemPayload),
      })
      if (error) throw error

      setForm((current) => ({ ...current, ...data, id: data.id, include_tax: true, tax_mode: data.tax_mode || current.tax_mode || 'INCLUDED' }))
      setView('EDITOR')
      await load()
      setMessage({ type: 'success', text: 'Cotización guardada completa y correctamente.' })
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo guardar la cotización.' })
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (to) => {
    if (actionBusy || busy) return
    if (!form.id) return setMessage({ type: 'error', text: 'Guardá primero la cotización.' })
    setActionBusy(`status-${to}`)
    setMessage({ type: '', text: '' })
    try {
      const { data, error } = await supabase.rpc('transition_quote_status', { p_quote_id: form.id, p_to_status: to, p_comment: 'Cambio desde Cotización rápida' })
      if (error) throw error
      setForm((current) => ({ ...current, ...data, status: to }))
      await load()
      setMessage({ type: 'success', text: `Cotización actualizada: ${STATUS_LABELS[to] || to}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo actualizar el estado.' })
    } finally {
      setActionBusy('')
    }
  }

  const createWorkOrder = async () => {
    if (actionBusy || busy) return
    if (form.status !== 'APPROVED') return setMessage({ type: 'error', text: 'Primero aprobá la cotización.' })
    setActionBusy('work-order')
    setMessage({ type: '', text: '' })
    try {
      const due = form.promised_delivery_date ? `${form.promised_delivery_date}T17:00:00-06:00` : null
      const { data, error } = await supabase.rpc('convert_quote_to_work_order', { p_quote_id: form.id, p_due_at: due, p_priority: 'NORMAL' })
      if (error) throw error
      setForm((current) => ({ ...current, status: 'CONVERTED', converted_at: new Date().toISOString() }))
      await load()
      setMessage({ type: 'success', text: data?.existing ? `La orden OT-${String(data.number || '').padStart(5, '0')} ya estaba vinculada. No se creó un duplicado.` : `Orden OT-${String(data?.number || '').padStart(5, '0')} creada completa y enviada a producción.` })
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('idealo-commercial-flow-next', { detail: { step: 'work-order', workOrderId: data?.id || '', workOrderNumber: data?.number || '', quoteId: form.id } })), 250)
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo crear la orden de trabajo.' })
    } finally {
      setActionBusy('')
    }
  }

  const previewPdf = () => {
    if (busy || actionBusy) return
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    const blob = createQuotePdfBlob({ company, client, quote: form, items: calculatedItems, totals })
    setPdfUrl(URL.createObjectURL(blob))
  }

  const locked = Boolean(busy || actionBusy)
  const contentLocked = Boolean(form.id && !editableStatus(form.status))
  const fieldLocked = locked || contentLocked

  return <section className="qq-shell">
    <header className="qq-head">
      <div>
        <p className="form-kicker">COTIZACIONES</p>
        <h2>{view === 'LIST' ? 'Cotizaciones' : form.id ? (form.code || 'Cotización') : 'Nueva cotización'}</h2>
        <p>{view === 'LIST' ? `${quotes.length} cotización${quotes.length === 1 ? '' : 'es'} registrada${quotes.length === 1 ? '' : 's'} en ${company.name}.` : contentLocked ? 'El contenido está protegido porque la cotización ya avanzó en el flujo comercial.' : 'Solo tres pasos: cliente, productos y total.'}</p>
      </div>
      <div className="qq-head-actions">
        {view === 'EDITOR' && <button type="button" className="secondary" disabled={locked} onClick={() => setView('LIST')}>← Volver</button>}
        <button type="button" disabled={locked} onClick={reset}>+ Nueva cotización</button>
      </div>
    </header>

    {message.text && <p className={`feedback ${message.type}`} role="status">{message.text}</p>}
    {catalogWarning && <p className="feedback error" role="status">{catalogWarning}</p>}

    {view === 'LIST' && <section className="qq-list-card">
      <div className="qq-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, código o proyecto…" /></div>
      <div className="qq-list">
        {loading && <div className="empty-state"><strong>Cargando cotizaciones…</strong><small>Consultando la empresa activa.</small></div>}
        {!loading && loadError && <div className="empty-state"><strong>No pudimos cargar las cotizaciones.</strong><small>{loadError}</small><button type="button" onClick={load}>Reintentar</button></div>}
        {!loading && !loadError && filtered.map((row) => <button type="button" className="qq-list-row" key={row.id} disabled={locked} onClick={() => openQuote(row)}><div><strong>{row.code || `COT-${row.number || ''}`}</strong><span>{quoteClientName(row)} · {row.title || 'Sin proyecto'}</span></div><Status value={row.status} /><b>{money(row.total)}</b></button>)}
        {!loading && !loadError && !filtered.length && <div className="empty-state"><strong>{quotes.length ? 'No encontramos coincidencias.' : 'Todavía no hay cotizaciones.'}</strong><small>{quotes.length ? 'Probá con otro cliente, código o proyecto.' : 'Usá “Nueva cotización” para iniciar el recorrido comercial.'}</small>{query && <button type="button" className="secondary" onClick={() => setQuery('')}>Limpiar búsqueda</button>}</div>}
      </div>
    </section>}

    {view === 'EDITOR' && <div className="qq-editor">
      <section className="qq-step">
        <div className="qq-step-number">1</div>
        <div className="qq-step-body">
          <div className="qq-step-title"><h3>Cliente</h3>{form.id && <Status value={form.status} />}</div>
          <div className="qq-grid">
            <Field label="Cliente" wide><select disabled={fieldLocked} value={form.client_id} onChange={(event) => update('client_id', event.target.value)}><option value="">Seleccionar cliente</option>{clientOptions.map((row) => <option key={row.id} value={row.id} disabled={row.status !== 'active'}>{row.name}{row.status !== 'active' ? ' · Inactivo' : ''}</option>)}</select></Field>
            <Field label="Proyecto"><input disabled={fieldLocked} value={form.title || ''} onChange={(event) => update('title', event.target.value)} placeholder="Ej. 25 camisas bordadas" /></Field>
            <Field label="Válida hasta"><input disabled={fieldLocked} type="date" value={form.valid_until || ''} onChange={(event) => update('valid_until', event.target.value)} /></Field>
          </div>
        </div>
      </section>

      <section className="qq-step">
        <div className="qq-step-number">2</div>
        <div className="qq-step-body">
          <div className="qq-step-title"><h3>Productos o trabajos</h3><button type="button" disabled={fieldLocked} className="secondary" onClick={() => setItems((rows) => [...rows, emptyItem()])}>+ Agregar</button></div>
          <div className="qq-items">
            {items.map((item, index) => {
              const calculated = calculateItem(itemForTaxMode(item, form.tax_mode || 'INCLUDED'))
              return <article className="qq-item" key={item.id || index}>
                <div className="qq-item-main">
                  <Field label="Producto"><select disabled={fieldLocked} value={item.product_id || ''} onChange={(event) => chooseProduct(index, event.target.value)}><option value="">Personalizado</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
                  <Field label="Descripción" wide><input disabled={fieldLocked} value={item.description || ''} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder="Qué se le cotiza al cliente" /></Field>
                  <Field label="Cantidad"><input disabled={fieldLocked} type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></Field>
                  <Field label="Precio unitario"><input disabled={fieldLocked} type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} /></Field>
                  <div className="qq-line-total"><span>Total</span><strong>{money(calculated.total)}</strong></div>
                </div>
                <div className="qq-item-actions"><button type="button" disabled={fieldLocked} className="secondary" onClick={() => setItems((rows) => [...rows.slice(0, index + 1), cloneItem(item), ...rows.slice(index + 1)])}>Duplicar</button>{items.length > 1 && <button type="button" disabled={fieldLocked} className="danger ghost" onClick={() => setItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Quitar</button>}</div>
              </article>
            })}
          </div>
        </div>
      </section>

      <section className="qq-step">
        <div className="qq-step-number">3</div>
        <div className="qq-step-body">
          <div className="qq-step-title"><h3>Pago y total</h3></div>
          <div className="qq-final">
            <div className="qq-grid">
              <Field label="Forma de pago"><select disabled={fieldLocked} value={form.payment_method || ''} onChange={(event) => update('payment_method', event.target.value)}><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>TARJETA</option><option>CHEQUE</option><option>MIXTO</option></select></Field>
              <Field label="IVA"><select disabled={fieldLocked} value={form.tax_mode || 'INCLUDED'} onChange={(event) => update('tax_mode', event.target.value)}><option value="INCLUDED">IVA incluido en el precio (mantener total)</option><option value="ADDED">Agregar IVA al precio (13%)</option></select></Field>
              <Field label="Fecha de entrega"><input disabled={fieldLocked} type="date" value={form.promised_delivery_date || ''} onChange={(event) => update('promised_delivery_date', event.target.value)} /></Field>
              <Field label="Nota para el cliente" wide><textarea disabled={fieldLocked} rows="3" value={form.customer_notes || ''} onChange={(event) => update('customer_notes', event.target.value)} placeholder="Opcional" /></Field>
            </div>
            <aside className="qq-total"><div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div><span>{form.tax_mode === 'ADDED' ? 'IVA agregado (13%)' : 'IVA incluido (13%)'}</span><b>{money(totals.tax)}</b></div><div className="grand"><span>Total</span><b>{money(totals.total)}</b></div></aside>
          </div>
        </div>
      </section>

      <div className="qq-actions">
        <button type="button" disabled={locked} className="secondary qq-preview" onClick={previewPdf}>Vista previa PDF</button>
        {!contentLocked && <button type="button" disabled={locked} onClick={save}>{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Guardar cotización'}</button>}
        {form.id && form.status === 'DRAFT' && <button type="button" disabled={locked} className="secondary" onClick={() => changeStatus('SENT')}>{actionBusy === 'status-SENT' ? 'Actualizando…' : 'Marcar enviada'}</button>}
        {form.id && ['SENT', 'VIEWED', 'NEGOTIATION', 'PENDING'].includes(form.status) && <button type="button" disabled={locked} className="secondary" onClick={() => changeStatus('APPROVED')}>{actionBusy === 'status-APPROVED' ? 'Aprobando…' : 'Aprobar'}</button>}
        {form.id && form.status === 'APPROVED' && <button type="button" disabled={locked} onClick={createWorkOrder}>{actionBusy === 'work-order' ? 'Creando orden…' : 'Crear orden'}</button>}
      </div>
    </div>}

    {pdfUrl && <div className="qq-pdf-backdrop" onMouseDown={() => setPdfUrl('')}><section className="qq-pdf-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><strong>Vista previa PDF</strong><small>Así verá el cliente la cotización.</small></div><div><a href={pdfUrl} download={`${form.code || 'cotizacion'}.pdf`}>Descargar PDF</a><button type="button" onClick={() => setPdfUrl('')}>×</button></div></header><iframe src={pdfUrl} title="Vista previa PDF de cotización" /></section></div>}
  </section>
}
