import { useEffect, useMemo, useState } from 'react'
import {
  QUOTE_STATUSES,
  STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  number,
  round2,
  normalizeText,
  calculateItem,
  calculateQuote,
  tierPrice,
  validateQuote,
  quoteCode,
  quoteStats,
  canTransition,
  cloneItem,
} from './quoteEngine.js'

const money = (value) =>
  new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(number(value))

const today = () => new Date().toISOString().slice(0, 10)
const futureDate = (days) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const emptyItem = () => ({
  product_id: '', variant_id: '', sku: '', category: '', description: '', quantity: 1,
  unit: 'unidad', unit_price: 0, minimum_price: 0, width: '', height: '', dimension_unit: 'm',
  price_per_m2: 0, discount_percent: 0, discount_fixed: 0, surcharge_percent: 0,
  surcharge_fixed: 0, taxable: true, tax_rate: 13, unit_cost: 0, labor_unit_cost: 0,
  installation_unit_cost: 0, design_included: false, installation_included: false,
  requires_production: true, estimated_minutes: '', lead_time_days: '', specifications: '',
  internal_notes: '', image_url: '', group_name: '',
})

const emptyQuote = (initialClientId) => ({
  id: '', client_id: initialClientId || '', number: null, code: '', revision: 1, status: 'DRAFT',
  prefix: 'COT', title: '', reference: '', project_name: '', branch_name: '', sales_channel: 'DIRECTO',
  source: '', priority: 'NORMAL', contact_name: '', contact_phone: '', contact_email: '',
  delivery_address: '', valid_until: futureDate(15), payment_terms: 'Contado',
  payment_method: 'TRANSFERENCIA', credit_days: 0, deposit_percent: 0, discount_percent: 0,
  discount_fixed: 0, surcharge_percent: 0, surcharge_fixed: 0, minimum_margin: 25,
  close_probability: '', expected_close_date: '', requested_delivery_date: '', promised_delivery_date: '',
  installation_required: false, installation_address: '', internal_notes: '', customer_notes: '',
  terms_and_conditions: 'Precios expresados en dólares de los Estados Unidos. Vigencia según fecha indicada. Producción inicia después de aprobación y anticipo cuando aplique.',
  warranty_text: '', exclusions: '', tags_text: '', follow_up_at: '', rejection_reason: '', public_token: '',
})

function Field({ label, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>
}

function StatusBadge({ status }) {
  return <span className={`q360-status st-${String(status || '').toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>
}

function MiniKpi({ label, value }) {
  return <div className="qs-kpi"><small>{label}</small><strong>{value}</strong></div>
}

export default function QuotesSimpleModule({ company, supabase, initialClientId = '' }) {
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [quotes, setQuotes] = useState([])
  const [variants, setVariants] = useState([])
  const [tiers, setTiers] = useState([])
  const [items, setItems] = useState([emptyItem()])
  const [form, setForm] = useState(() => emptyQuote(initialClientId))
  const [view, setView] = useState(initialClientId ? 'EDITOR' : 'LIST')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState([])
  const [communications, setCommunications] = useState([])
  const [followups, setFollowups] = useState([])
  const [versions, setVersions] = useState([])
  const [followForm, setFollowForm] = useState({ due_at: '', type: 'FOLLOW_UP', note: '' })
  const [commForm, setCommForm] = useState({ channel: 'WHATSAPP', recipient: '', subject: '', message: '' })

  const load = async () => {
    const [clientResult, productResult, quoteResult, variantResult, tierResult] = await Promise.all([
      supabase.from('clients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('finished_products').select('*').eq('company_id', company.id).eq('active', true).order('name'),
      supabase.from('quotes').select('*, clients(name,phone,whatsapp,email,nit,nrc,dui,giro,address)').eq('company_id', company.id).is('soft_deleted_at', null).order('created_at', { ascending: false }).limit(500),
      supabase.from('product_variants').select('*').eq('company_id', company.id).eq('active', true),
      supabase.from('product_price_tiers').select('*').eq('company_id', company.id).eq('active', true),
    ])

    if (quoteResult.error) {
      setMessage({
        type: 'error',
        text: quoteResult.error.message.includes('soft_deleted_at')
          ? 'Falta aplicar la migración de Cotizaciones 360 en Supabase.'
          : quoteResult.error.message,
      })
    }

    setClients(clientResult.data || [])
    setProducts(productResult.data || [])
    setQuotes(quoteResult.data || [])
    setVariants(variantResult.data || [])
    setTiers(tierResult.data || [])
  }

  useEffect(() => { load() }, [company.id])
  useEffect(() => {
    if (initialClientId) setForm((current) => ({ ...current, client_id: initialClientId }))
  }, [initialClientId])

  const totals = useMemo(
    () => calculateQuote(items, form),
    [items, form.discount_percent, form.discount_fixed, form.surcharge_percent, form.surcharge_fixed],
  )
  const validation = useMemo(() => validateQuote({ ...form, items }, totals), [form, items, totals])
  const stats = useMemo(() => quoteStats(quotes), [quotes])
  const client = useMemo(() => clients.find((row) => row.id === form.client_id), [clients, form.client_id])
  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim()
    return quotes
      .filter((row) => statusFilter === 'ALL' || row.status === statusFilter)
      .filter((row) => !needle || [row.code, row.title, row.project_name, row.clients?.name]
        .filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [quotes, query, statusFilter])

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }))
  const updateItem = (index, name, value) => setItems((rows) => rows.map((row, rowIndex) => (
    rowIndex === index ? { ...row, [name]: value } : row
  )))

  const reset = () => {
    setForm(emptyQuote(initialClientId))
    setItems([emptyItem()])
    setHistory([])
    setCommunications([])
    setFollowups([])
    setVersions([])
    setMessage({ type: '', text: '' })
    setView('EDITOR')
  }

  const chooseClient = (id) => {
    const selected = clients.find((row) => row.id === id)
    setForm((current) => ({
      ...current,
      client_id: id,
      contact_name: selected?.contact_name || selected?.name || '',
      contact_phone: selected?.whatsapp || selected?.phone || '',
      contact_email: selected?.email || '',
      delivery_address: selected?.address || '',
    }))
  }

  const chooseProduct = (index, id) => {
    const product = products.find((row) => row.id === id)
    if (!product) {
      updateItem(index, 'product_id', '')
      return
    }

    const current = items[index]
    const price = tierPrice(tiers.filter((tier) => tier.product_id === id), current?.quantity || 1, product.sale_price)
    const next = {
      ...current,
      product_id: id,
      variant_id: '',
      sku: product.sku || '',
      category: product.category || '',
      description: product.short_description || product.name,
      unit: product.unit || 'unidad',
      unit_price: price,
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
      design_included: !!product.design_included,
      installation_included: !!product.installation_included,
      requires_production: product.requires_production !== false,
      estimated_minutes: product.estimated_minutes ?? '',
      lead_time_days: product.lead_time_days ?? '',
      image_url: product.image_url || '',
      specifications: product.technical_description || '',
    }
    setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? next : row))
  }

  const chooseVariant = (index, id) => {
    const variant = variants.find((row) => row.id === id)
    const current = items[index]
    if (!variant) {
      updateItem(index, 'variant_id', '')
      return
    }
    setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? {
      ...current,
      variant_id: id,
      sku: variant.sku || current.sku,
      unit_price: variant.sale_price == null ? current.unit_price : number(variant.sale_price),
      unit_cost: variant.cost_estimate == null ? current.unit_cost : number(variant.cost_estimate),
      specifications: [
        current.specifications,
        Object.entries(variant.attributes || {}).map(([key, value]) => `${key}: ${value}`).join(' · '),
      ].filter(Boolean).join(' · '),
    } : row))
  }

  const quantityChanged = (index, value) => {
    const item = items[index]
    const product = products.find((row) => row.id === item.product_id)
    const price = item.product_id
      ? tierPrice(tiers.filter((tier) => tier.product_id === item.product_id), value, product?.sale_price ?? item.unit_price)
      : item.unit_price
    setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: value, unit_price: price } : row))
  }

  const quotePayload = () => ({
    company_id: company.id,
    client_id: form.client_id,
    prefix: normalizeText(form.prefix) || 'COT',
    code: form.code || null,
    revision: number(form.revision, 1),
    status: form.status,
    title: normalizeText(form.title) || null,
    reference: normalizeText(form.reference) || null,
    project_name: normalizeText(form.project_name) || null,
    branch_name: normalizeText(form.branch_name) || null,
    sales_channel: form.sales_channel || null,
    source: normalizeText(form.source) || null,
    priority: form.priority,
    contact_name: normalizeText(form.contact_name) || null,
    contact_phone: normalizeText(form.contact_phone) || null,
    contact_email: normalizeText(form.contact_email) || null,
    delivery_address: normalizeText(form.delivery_address) || null,
    valid_until: form.valid_until || null,
    payment_terms: normalizeText(form.payment_terms) || null,
    payment_method: form.payment_method || null,
    credit_days: Math.max(0, number(form.credit_days)),
    deposit_percent: Math.min(100, Math.max(0, number(form.deposit_percent))),
    deposit_amount: round2(totals.total * number(form.deposit_percent) / 100),
    balance_amount: round2(totals.total - totals.total * number(form.deposit_percent) / 100),
    discount_percent: number(form.discount_percent),
    discount_fixed: number(form.discount_fixed),
    surcharge_percent: number(form.surcharge_percent),
    surcharge_fixed: number(form.surcharge_fixed),
    subtotal: totals.subtotal,
    discount: round2(totals.lineDiscount + totals.globalDiscount),
    tax_total: totals.tax,
    total: totals.total,
    cost_total: totals.cost,
    profit_total: totals.profit,
    margin_percent: totals.margin,
    markup_percent: totals.markup,
    minimum_margin: number(form.minimum_margin),
    close_probability: form.close_probability === '' ? null : Math.max(0, Math.min(1, number(form.close_probability) / 100)),
    expected_close_date: form.expected_close_date || null,
    requested_delivery_date: form.requested_delivery_date || null,
    promised_delivery_date: form.promised_delivery_date || null,
    installation_required: !!form.installation_required,
    installation_address: normalizeText(form.installation_address) || null,
    internal_notes: normalizeText(form.internal_notes) || null,
    customer_notes: normalizeText(form.customer_notes) || null,
    notes: normalizeText(form.customer_notes) || null,
    terms_and_conditions: normalizeText(form.terms_and_conditions) || null,
    warranty_text: normalizeText(form.warranty_text) || null,
    exclusions: normalizeText(form.exclusions) || null,
    tags: form.tags_text.split(',').map((tag) => tag.trim()).filter(Boolean),
    follow_up_at: form.follow_up_at || null,
    rejected_reason: normalizeText(form.rejection_reason) || null,
  })

  const itemPayload = (item, index, quoteId) => {
    const calculated = calculateItem(item)
    return {
      quote_id: quoteId,
      product_id: item.product_id || null,
      variant_id: item.variant_id || null,
      sku: item.sku || null,
      category: item.category || null,
      description: normalizeText(item.description),
      quantity: number(item.quantity),
      unit: item.unit || 'unidad',
      unit_price: calculated.unitPrice,
      discount: calculated.discount,
      discount_percent: number(item.discount_percent),
      discount_fixed: number(item.discount_fixed),
      surcharge_percent: number(item.surcharge_percent),
      surcharge_fixed: number(item.surcharge_fixed),
      line_total: calculated.total,
      sort_order: index,
      width: item.width === '' ? null : number(item.width),
      height: item.height === '' ? null : number(item.height),
      dimension_unit: item.dimension_unit || 'm',
      area_m2: calculated.area,
      price_per_m2: number(item.price_per_m2),
      minimum_price: number(item.minimum_price),
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
      design_included: !!item.design_included,
      installation_included: !!item.installation_included,
      requires_production: item.requires_production !== false,
      estimated_minutes: item.estimated_minutes === '' ? null : number(item.estimated_minutes),
      lead_time_days: item.lead_time_days === '' ? null : number(item.lead_time_days),
      image_url: item.image_url || null,
      specifications: normalizeText(item.specifications) || null,
      internal_notes: normalizeText(item.internal_notes) || null,
      group_name: normalizeText(item.group_name) || null,
    }
  }

  const loadRelated = async (quoteId) => {
    const [historyResult, communicationResult, followupResult, versionResult] = await Promise.all([
      supabase.from('quote_status_history').select('*').eq('quote_id', quoteId).order('changed_at', { ascending: false }),
      supabase.from('quote_communications').select('*').eq('quote_id', quoteId).order('created_at', { ascending: false }),
      supabase.from('quote_followups').select('*').eq('quote_id', quoteId).order('due_at'),
      supabase.from('quote_versions').select('id,revision,reason,created_at,created_by').eq('quote_id', quoteId).order('revision', { ascending: false }),
    ])
    setHistory(historyResult.data || [])
    setCommunications(communicationResult.data || [])
    setFollowups(followupResult.data || [])
    setVersions(versionResult.data || [])
  }

  const editQuote = async (row) => {
    const { data: quoteItems, error } = await supabase.from('quote_items').select('*').eq('quote_id', row.id).order('sort_order')
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setForm({
      ...emptyQuote(row.client_id),
      ...row,
      tags_text: (row.tags || []).join(', '),
      close_probability: row.close_probability == null ? '' : round2(number(row.close_probability) * 100),
      follow_up_at: row.follow_up_at ? String(row.follow_up_at).slice(0, 16) : '',
      rejection_reason: row.rejected_reason || '',
    })
    setItems((quoteItems || []).map((item) => ({ ...emptyItem(), ...item, discount_fixed: item.discount_fixed ?? item.discount ?? 0 })))
    await loadRelated(row.id)
    setView('EDITOR')
  }

  const duplicate = async (row) => {
    const { data: quoteItems, error } = await supabase.from('quote_items').select('*').eq('quote_id', row.id).order('sort_order')
    if (error) return setMessage({ type: 'error', text: error.message })
    setForm({
      ...emptyQuote(row.client_id),
      ...row,
      id: '', number: null, code: '', revision: 1, status: 'DRAFT',
      title: `${row.title || row.code || 'Cotización'} (copia)`,
      tags_text: (row.tags || []).join(', '),
      sent_at: null, approved_at: null, rejected_at: null, converted_at: null,
    })
    setItems((quoteItems || []).map((item) => cloneItem({ ...emptyItem(), ...item })))
    setView('EDITOR')
    setMessage({ type: 'success', text: 'Copia preparada. Revisala y guardala como una cotización nueva.' })
  }

  const save = async ({ newRevision = false } = {}) => {
    if (!validation.valid) {
      setMessage({ type: 'error', text: validation.errors.join(' ') })
      return null
    }
    if (form.id && ['APPROVED', 'CONVERTED', 'PARTIALLY_CONVERTED'].includes(form.status) && !newRevision) {
      setMessage({ type: 'error', text: 'Esta cotización está aprobada o convertida. Creá una nueva revisión para modificarla.' })
      return null
    }

    setBusy(true)
    setMessage({ type: '', text: '' })
    let quoteId = form.id
    let saved = null
    const createdNew = !form.id

    try {
      const payload = quotePayload()
      if (form.id) {
        const revision = newRevision ? number(form.revision, 1) + 1 : number(form.revision, 1)
        const result = await supabase.from('quotes')
          .update({ ...payload, revision, status: newRevision ? 'NEGOTIATION' : form.status })
          .eq('id', form.id).eq('company_id', company.id).select().single()
        if (result.error) throw result.error
        saved = result.data
      } else {
        const result = await supabase.from('quotes').insert(payload).select().single()
        if (result.error) throw result.error
        saved = result.data
        quoteId = result.data.id
        const code = quoteCode(result.data.number, result.data.prefix || 'COT', result.data.created_at)
        const coded = await supabase.from('quotes').update({ code }).eq('id', quoteId).select().single()
        if (coded.error) throw coded.error
        saved = coded.data || { ...saved, code }
      }

      const existing = form.id
        ? await supabase.from('quote_items').select('id').eq('quote_id', quoteId)
        : { data: [], error: null }
      if (existing.error) throw existing.error

      const retainedIds = new Set()
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        const payloadItem = itemPayload(item, index, quoteId)
        if (item.id) {
          const updated = await supabase.from('quote_items').update(payloadItem).eq('id', item.id).eq('quote_id', quoteId)
          if (updated.error) throw updated.error
          retainedIds.add(item.id)
        } else {
          const inserted = await supabase.from('quote_items').insert(payloadItem)
          if (inserted.error) throw inserted.error
        }
      }

      const removedIds = (existing.data || []).map((row) => row.id).filter((id) => !retainedIds.has(id))
      if (removedIds.length) {
        const removed = await supabase.from('quote_items').delete().in('id', removedIds).eq('quote_id', quoteId)
        if (removed.error) throw removed.error
      }

      const revision = number(saved.revision, 1)
      const version = await supabase.from('quote_versions').upsert({
        company_id: company.id,
        quote_id: quoteId,
        revision,
        snapshot: {
          quote: { ...form, id: quoteId, totals },
          items: items.map((item, index) => ({ ...item, calculated: calculateItem(item), sort_order: index })),
          client: client ? { id: client.id, name: client.name, nit: client.nit, nrc: client.nrc, email: client.email } : null,
          generated_at: new Date().toISOString(),
        },
        reason: newRevision ? 'Nueva revisión comercial' : 'Guardado del documento',
      }, { onConflict: 'quote_id,revision' })
      if (version.error) throw version.error

      await load()
      await editQuote({ ...saved, clients: client })
      setMessage({ type: 'success', text: newRevision ? `Revisión ${revision} creada.` : 'Cotización guardada correctamente.' })
      return quoteId
    } catch (error) {
      if (createdNew && quoteId) {
        await supabase.from('quote_items').delete().eq('quote_id', quoteId)
        await supabase.from('quotes').delete().eq('id', quoteId).eq('company_id', company.id)
      }
      setMessage({ type: 'error', text: error?.message || 'No se pudo guardar la cotización.' })
      return null
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (row, to, comment = '') => {
    if (!row.id || !canTransition(row.status, to)) {
      setMessage({ type: 'error', text: 'Ese cambio de estado no está permitido.' })
      return
    }
    setBusy(true)
    try {
      const stamp = {}
      if (to === 'SENT') stamp.sent_at = new Date().toISOString()
      if (to === 'VIEWED') stamp.viewed_at = new Date().toISOString()
      if (to === 'APPROVED') stamp.approved_at = new Date().toISOString()
      if (to === 'REJECTED') stamp.rejected_at = new Date().toISOString()
      if (to === 'CONVERTED') stamp.converted_at = new Date().toISOString()
      if (to === 'ARCHIVED') stamp.archived_at = new Date().toISOString()

      const changed = await supabase.from('quotes').update({ status: to, ...stamp }).eq('id', row.id).eq('company_id', company.id)
      if (changed.error) throw changed.error

      const { data: { user } } = await supabase.auth.getUser()
      const audited = await supabase.from('quote_status_history').insert({
        company_id: company.id,
        quote_id: row.id,
        from_status: row.status,
        to_status: to,
        comment: comment || null,
        changed_by: user?.id || null,
      })
      if (audited.error) throw audited.error

      if (to === 'APPROVED') {
        const approved = await supabase.from('quote_approvals').insert({
          company_id: company.id,
          quote_id: row.id,
          approval_type: 'INTERNAL',
          status: 'APPROVED',
          approver_name: user?.email || 'Usuario IDEALO',
          decision_at: new Date().toISOString(),
          comments: comment || 'Aprobación registrada desde Cotizaciones',
        })
        if (approved.error) throw approved.error
      }

      await load()
      if (form.id === row.id) {
        setForm((current) => ({ ...current, status: to, ...stamp }))
        await loadRelated(row.id)
      }
      setMessage({ type: 'success', text: `Estado actualizado a ${STATUS_LABELS[to]}.` })
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo actualizar el estado.' })
    } finally {
      setBusy(false)
    }
  }

  const convertToWorkOrder = async (row) => {
    if (!['APPROVED', 'PARTIALLY_CONVERTED'].includes(row.status)) {
      setMessage({ type: 'error', text: 'La cotización debe estar aprobada antes de crear una orden.' })
      return
    }
    setBusy(true)
    try {
      const quoteItems = await supabase.from('quote_items').select('*').eq('quote_id', row.id).order('sort_order')
      if (quoteItems.error) throw quoteItems.error
      const pending = (quoteItems.data || []).filter((item) => number(item.converted_quantity) < number(item.quantity))
      if (!pending.length) {
        setMessage({ type: 'error', text: 'Todas las partidas ya fueron convertidas.' })
        return
      }

      const workOrder = await supabase.from('work_orders').insert({
        company_id: company.id,
        quote_id: row.id,
        client_id: row.client_id,
        title: row.project_name || row.title || `Trabajo ${row.code}`,
        total: row.total,
        status: 'PENDING',
        due_at: row.promised_delivery_date ? `${row.promised_delivery_date}T17:00:00` : null,
        production_notes: row.internal_notes,
      }).select().single()
      if (workOrder.error) throw workOrder.error

      const orderItems = pending.map((item) => ({
        work_order_id: workOrder.data.id,
        product_id: item.product_id,
        description: item.description,
        quantity: number(item.quantity) - number(item.converted_quantity),
        unit: item.unit,
        unit_price: item.unit_price,
        line_total: round2((number(item.quantity) - number(item.converted_quantity)) * number(item.unit_price)),
        specifications: item.specifications,
        sort_order: item.sort_order,
      }))
      const inserted = await supabase.from('work_order_items').insert(orderItems)
      if (inserted.error) throw inserted.error

      for (const item of pending) {
        const updated = await supabase.from('quote_items').update({ converted_quantity: item.quantity }).eq('id', item.id)
        if (updated.error) throw updated.error
      }

      await changeStatus(row, 'CONVERTED', `Convertida a orden OT-${String(workOrder.data.number).padStart(5, '0')}`)
      setMessage({ type: 'success', text: `Orden OT-${String(workOrder.data.number).padStart(5, '0')} creada correctamente.` })
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo crear la orden de trabajo.' })
    } finally {
      setBusy(false)
    }
  }

  const archiveQuote = async (row) => {
    if (!window.confirm(`¿Archivar ${row.code || 'esta cotización'}?`)) return
    const { data: { user } } = await supabase.auth.getUser()
    const archivedAt = new Date().toISOString()
    const changed = await supabase.from('quotes').update({ status: 'ARCHIVED', soft_deleted_at: archivedAt, archived_at: archivedAt }).eq('id', row.id).eq('company_id', company.id)
    if (changed.error) return setMessage({ type: 'error', text: changed.error.message })
    await supabase.from('quote_status_history').insert({ company_id: company.id, quote_id: row.id, from_status: row.status, to_status: 'ARCHIVED', comment: 'Archivada desde Cotizaciones', changed_by: user?.id || null })
    await load()
    if (form.id === row.id) reset()
    setMessage({ type: 'success', text: 'Cotización archivada.' })
  }

  const addFollowup = async () => {
    if (!form.id) return setMessage({ type: 'error', text: 'Guardá primero la cotización.' })
    if (!followForm.due_at) return setMessage({ type: 'error', text: 'Indicá fecha y hora.' })
    const { data: { user } } = await supabase.auth.getUser()
    const result = await supabase.from('quote_followups').insert({ company_id: company.id, quote_id: form.id, due_at: followForm.due_at, type: followForm.type, note: followForm.note || null, owner_user_id: user?.id || null })
    if (result.error) return setMessage({ type: 'error', text: result.error.message })
    setFollowForm({ due_at: '', type: 'FOLLOW_UP', note: '' })
    await loadRelated(form.id)
    setMessage({ type: 'success', text: 'Seguimiento programado.' })
  }

  const completeFollowup = async (followup) => {
    await supabase.from('quote_followups').update({ status: 'DONE', completed_at: new Date().toISOString(), result: 'Completado desde Cotizaciones' }).eq('id', followup.id)
    await loadRelated(form.id)
  }

  const recordCommunication = async () => {
    if (!form.id) return setMessage({ type: 'error', text: 'Guardá primero la cotización.' })
    if (!commForm.message.trim()) return setMessage({ type: 'error', text: 'Escribí el mensaje.' })
    const { data: { user } } = await supabase.auth.getUser()
    const result = await supabase.from('quote_communications').insert({ company_id: company.id, quote_id: form.id, channel: commForm.channel, direction: 'OUTBOUND', recipient: commForm.recipient || form.contact_phone || form.contact_email || null, subject: commForm.subject || null, message: commForm.message, status: 'RECORDED', sent_at: new Date().toISOString(), created_by: user?.id || null })
    if (result.error) return setMessage({ type: 'error', text: result.error.message })
    setCommForm({ channel: 'WHATSAPP', recipient: '', subject: '', message: '' })
    await loadRelated(form.id)
    setMessage({ type: 'success', text: 'Comunicación registrada.' })
  }

  const copyPublicLink = async () => {
    if (!form.id) return setMessage({ type: 'error', text: 'Guardá primero la cotización.' })
    let token = form.public_token
    if (!token) {
      const result = await supabase.from('quotes').select('public_token').eq('id', form.id).single()
      if (result.error) return setMessage({ type: 'error', text: result.error.message })
      token = result.data?.public_token
    }
    if (!token) return setMessage({ type: 'error', text: 'Esta cotización todavía no tiene enlace público.' })
    await navigator.clipboard?.writeText(`${window.location.origin}/?quote=${token}`)
    setMessage({ type: 'success', text: 'Enlace copiado.' })
  }

  const exportCsv = () => {
    const rows = [['Código', 'Cliente', 'Estado', 'Vigencia', 'Total'], ...filtered.map((quote) => [quote.code, quote.clients?.name || '', STATUS_LABELS[quote.status] || quote.status, quote.valid_until || '', quote.total])]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cotizaciones-${today()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const transitions = form.id ? (ALLOWED_TRANSITIONS[form.status] || []) : []

  return <section className="q360 qs-module">
    <header className="q360-hero qs-hero">
      <div><p className="form-kicker">VENTAS</p><h2>Cotizaciones</h2><p>Creá una propuesta clara y agregá detalles solo cuando los necesités.</p></div>
      <div className="q360-hero-actions"><button onClick={reset}>+ Nueva cotización</button>{view === 'LIST' && <button className="secondary" onClick={exportCsv}>Exportar</button>}</div>
    </header>

    {message.text && <p className={`feedback ${message.type}`}>{message.text}</p>}

    <nav className="q360-tabs qs-tabs">
      <button className={view === 'LIST' ? 'active' : ''} onClick={() => setView('LIST')}>Cotizaciones</button>
      <button className={view === 'EDITOR' ? 'active' : ''} onClick={() => setView('EDITOR')}>{form.id ? 'Editar' : 'Nueva'}</button>
      <button className={view === 'FOLLOW' ? 'active' : ''} onClick={() => setView('FOLLOW')}>Seguimiento</button>
      <button className={view === 'SUMMARY' ? 'active' : ''} onClick={() => setView('SUMMARY')}>Resumen</button>
    </nav>

    {view === 'LIST' && <section className="panel q360-card qs-list">
      <div className="qs-kpis"><MiniKpi label="Cotizaciones" value={stats.count}/><MiniKpi label="Valor abierto" value={money(stats.openValue)}/><MiniKpi label="Conversión" value={`${stats.approvalRate}%`}/></div>
      <div className="q360-filters qs-filters"><input placeholder="Buscar cliente, código o proyecto" value={query} onChange={(event) => setQuery(event.target.value)}/><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Todos los estados</option>{QUOTE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></div>
      <div className="q360-table-wrap"><table className="q360-table qs-table"><thead><tr><th>Cotización</th><th>Cliente</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>{filtered.map((quote) => <tr key={quote.id}><td><button className="link-button" onClick={() => editQuote(quote)}>{quote.code || `COT-${quote.number}`}</button><small>{quote.title || quote.project_name || 'Sin título'}</small></td><td>{quote.clients?.name || 'Cliente'}</td><td><StatusBadge status={quote.status}/></td><td><strong>{money(quote.total)}</strong><small>Vigencia: {quote.valid_until || '—'}</small></td><td><div className="table-actions"><button onClick={() => editQuote(quote)}>Abrir</button><details className="qs-more"><summary>Más</summary><div><button className="secondary" onClick={() => duplicate(quote)}>Duplicar</button>{quote.status === 'DRAFT' && <button onClick={() => changeStatus(quote, 'SENT')}>Marcar enviada</button>}{['SENT', 'VIEWED', 'NEGOTIATION', 'PENDING'].includes(quote.status) && <button onClick={() => changeStatus(quote, 'APPROVED')}>Aprobar</button>}{quote.status === 'APPROVED' && <button onClick={() => convertToWorkOrder(quote)}>Crear orden</button>}<button className="danger ghost" onClick={() => archiveQuote(quote)}>Archivar</button></div></details></div></td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="empty-state"><strong>No hay cotizaciones con esos filtros.</strong></div>}
    </section>}

    {view === 'EDITOR' && <div className="q360-editor qs-editor">
      <section className="panel q360-card qs-card">
        <div className="panel-heading qs-heading"><div><p className="form-kicker">{form.id ? 'COTIZACIÓN' : 'NUEVA COTIZACIÓN'}</p><h3>{form.id ? `${form.code || 'Cotización'} · Revisión ${form.revision}` : 'Datos básicos'}</h3></div><div className="qs-status-control">{form.id && <StatusBadge status={form.status}/>} {form.id && transitions.length > 0 && <select aria-label="Cambiar estado" value="" disabled={busy} onChange={(event) => { if (event.target.value) changeStatus(form, event.target.value) }}><option value="">Cambiar estado…</option>{transitions.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>}</div></div>
        <div className="form-grid three qs-basic-grid"><Field label="Cliente *" className="form-span-2"><select value={form.client_id} onChange={(event) => chooseClient(event.target.value)}><option value="">Seleccionar cliente</option>{clients.map((row) => <option key={row.id} value={row.id}>{row.name}{row.nit ? ` · ${row.nit}` : ''}</option>)}</select></Field><Field label="Vigencia"><input type="date" value={form.valid_until || ''} onChange={(event) => update('valid_until', event.target.value)}/></Field><Field label="Título / proyecto" className="form-span-2"><input value={form.title || ''} onChange={(event) => update('title', event.target.value)} placeholder="Ej. 50 camisas personalizadas"/></Field><Field label="Prioridad"><select value={form.priority} onChange={(event) => update('priority', event.target.value)}><option>NORMAL</option><option>ALTA</option><option>URGENTE</option><option>BAJA</option></select></Field></div>
        <details className="qs-details"><summary>Datos comerciales y contacto</summary><div className="form-grid three"><Field label="Referencia"><input value={form.reference || ''} onChange={(event) => update('reference', event.target.value)}/></Field><Field label="Canal"><select value={form.sales_channel || 'DIRECTO'} onChange={(event) => update('sales_channel', event.target.value)}><option>DIRECTO</option><option>WHATSAPP</option><option>FACEBOOK</option><option>INSTAGRAM</option><option>WEB</option><option>REFERIDO</option><option>VISITA</option></select></Field><Field label="Cierre esperado"><input type="date" value={form.expected_close_date || ''} onChange={(event) => update('expected_close_date', event.target.value)}/></Field><Field label="Probabilidad %"><input type="number" min="0" max="100" value={form.close_probability ?? ''} onChange={(event) => update('close_probability', event.target.value)}/></Field><Field label="Contacto"><input value={form.contact_name || ''} onChange={(event) => update('contact_name', event.target.value)}/></Field><Field label="WhatsApp / teléfono"><input value={form.contact_phone || ''} onChange={(event) => update('contact_phone', event.target.value)}/></Field><Field label="Correo"><input type="email" value={form.contact_email || ''} onChange={(event) => update('contact_email', event.target.value)}/></Field><Field label="Etiquetas" className="form-span-2"><input value={form.tags_text || ''} onChange={(event) => update('tags_text', event.target.value)} placeholder="corporativo, urgente, recurrente"/></Field></div></details>
      </section>

      <section className="panel q360-card q360-items qs-card"><div className="panel-heading"><div><p className="form-kicker">PRODUCTOS / TRABAJOS</p><h3>¿Qué le vas a cotizar?</h3></div><button onClick={() => setItems((rows) => [...rows, emptyItem()])}>+ Agregar</button></div>{items.map((item, index) => { const calculated = calculateItem(item); const itemVariants = variants.filter((variant) => variant.product_id === item.product_id); return <article className="q360-item qs-item" key={item.id || index}><div className="q360-item-head"><strong>{index + 1}. {item.description || 'Nueva partida'}</strong><span>{money(calculated.total)}</span><div><button className="secondary" onClick={() => setItems((rows) => [...rows.slice(0, index + 1), cloneItem(item), ...rows.slice(index + 1)])}>Duplicar</button>{items.length > 1 && <button className="danger ghost" onClick={() => setItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Quitar</button>}</div></div><div className="form-grid qs-item-basic"><Field label="Producto"><select value={item.product_id || ''} onChange={(event) => chooseProduct(index, event.target.value)}><option value="">Personalizado / manual</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku ? `${product.sku} · ` : ''}{product.name}</option>)}</select></Field><Field label="Descripción *" className="form-span-2"><input value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)}/></Field><Field label="Cantidad"><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => quantityChanged(index, event.target.value)}/></Field><Field label="Precio unitario"><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)}/></Field><div className="qs-line-total"><span>Total partida</span><strong>{money(calculated.total)}</strong></div></div><details className="qs-details qs-item-details"><summary>Opciones avanzadas de esta partida</summary><div className="form-grid four"><Field label="Variante"><select value={item.variant_id || ''} onChange={(event) => chooseVariant(index, event.target.value)} disabled={!itemVariants.length}><option value="">Estándar</option>{itemVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></Field><Field label="Unidad"><input value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)}/></Field><Field label="Precio mínimo"><input type="number" step="0.01" value={item.minimum_price} onChange={(event) => updateItem(index, 'minimum_price', event.target.value)}/></Field><Field label="IVA %"><input type="number" min="0" value={item.tax_rate} onChange={(event) => updateItem(index, 'tax_rate', event.target.value)} disabled={!item.taxable}/></Field><Field label="Ancho"><input type="number" step="0.001" value={item.width} onChange={(event) => updateItem(index, 'width', event.target.value)}/></Field><Field label="Alto"><input type="number" step="0.001" value={item.height} onChange={(event) => updateItem(index, 'height', event.target.value)}/></Field><Field label="Unidad medida"><select value={item.dimension_unit} onChange={(event) => updateItem(index, 'dimension_unit', event.target.value)}><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></select></Field><Field label="Precio por m²"><input type="number" step="0.01" value={item.price_per_m2} onChange={(event) => updateItem(index, 'price_per_m2', event.target.value)}/></Field><Field label="Descuento %"><input type="number" min="0" max="100" value={item.discount_percent} onChange={(event) => updateItem(index, 'discount_percent', event.target.value)}/></Field><Field label="Descuento $"><input type="number" min="0" step="0.01" value={item.discount_fixed} onChange={(event) => updateItem(index, 'discount_fixed', event.target.value)}/></Field><Field label="Recargo %"><input type="number" min="0" value={item.surcharge_percent} onChange={(event) => updateItem(index, 'surcharge_percent', event.target.value)}/></Field><Field label="Grupo"><input value={item.group_name || ''} onChange={(event) => updateItem(index, 'group_name', event.target.value)}/></Field><Field label="Costo base"><input type="number" step="0.01" value={item.unit_cost} onChange={(event) => updateItem(index, 'unit_cost', event.target.value)}/></Field><Field label="Mano de obra"><input type="number" step="0.01" value={item.labor_unit_cost} onChange={(event) => updateItem(index, 'labor_unit_cost', event.target.value)}/></Field><Field label="Instalación"><input type="number" step="0.01" value={item.installation_unit_cost} onChange={(event) => updateItem(index, 'installation_unit_cost', event.target.value)}/></Field><Field label="Margen objetivo %"><input type="number" min="0" value={form.minimum_margin ?? 0} onChange={(event) => update('minimum_margin', event.target.value)}/></Field><Field label="Especificaciones" className="form-span-2"><textarea rows="2" value={item.specifications || ''} onChange={(event) => updateItem(index, 'specifications', event.target.value)}/></Field><Field label="Notas internas" className="form-span-2"><textarea rows="2" value={item.internal_notes || ''} onChange={(event) => updateItem(index, 'internal_notes', event.target.value)}/></Field></div><div className="q360-item-metrics"><span>Área <b>{calculated.area} m²</b></span><span>IVA <b>{money(calculated.tax)}</b></span><span>Costo <b>{money(calculated.totalCost)}</b></span><span>Utilidad <b>{money(calculated.profit)}</b></span><span>Margen <b className={calculated.margin < number(form.minimum_margin) ? 'danger-text' : 'good-text'}>{calculated.margin}%</b></span></div></details></article> })}</section>

      <div className="q360-bottom-grid qs-bottom"><section className="panel q360-card qs-card"><div className="panel-heading"><h3>Pago y entrega</h3></div><div className="form-grid three"><Field label="Forma de pago"><select value={form.payment_method || ''} onChange={(event) => update('payment_method', event.target.value)}><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>TARJETA</option><option>CHEQUE</option><option>DEPÓSITO</option><option>MIXTO</option></select></Field><Field label="Condición"><input value={form.payment_terms || ''} onChange={(event) => update('payment_terms', event.target.value)}/></Field><Field label="Anticipo %"><input type="number" min="0" max="100" value={form.deposit_percent} onChange={(event) => update('deposit_percent', event.target.value)}/></Field><Field label="Entrega prometida"><input type="date" value={form.promised_delivery_date || ''} onChange={(event) => update('promised_delivery_date', event.target.value)}/></Field><Field label="Notas para cliente" className="form-span-2"><textarea rows="2" value={form.customer_notes || ''} onChange={(event) => update('customer_notes', event.target.value)}/></Field></div><details className="qs-details"><summary>Condiciones avanzadas</summary><div className="form-grid two"><Field label="Descuento global %"><input type="number" value={form.discount_percent} onChange={(event) => update('discount_percent', event.target.value)}/></Field><Field label="Descuento global $"><input type="number" value={form.discount_fixed} onChange={(event) => update('discount_fixed', event.target.value)}/></Field><Field label="Recargo global %"><input type="number" value={form.surcharge_percent} onChange={(event) => update('surcharge_percent', event.target.value)}/></Field><Field label="Recargo global $"><input type="number" value={form.surcharge_fixed} onChange={(event) => update('surcharge_fixed', event.target.value)}/></Field><Field label="Días de crédito"><input type="number" min="0" value={form.credit_days} onChange={(event) => update('credit_days', event.target.value)}/></Field><Field label="Entrega solicitada"><input type="date" value={form.requested_delivery_date || ''} onChange={(event) => update('requested_delivery_date', event.target.value)}/></Field><Field label="Notas internas" className="form-span-2"><textarea rows="2" value={form.internal_notes || ''} onChange={(event) => update('internal_notes', event.target.value)}/></Field><Field label="Términos y condiciones" className="form-span-2"><textarea rows="3" value={form.terms_and_conditions || ''} onChange={(event) => update('terms_and_conditions', event.target.value)}/></Field></div></details></section><aside className="panel q360-summary qs-summary"><p className="form-kicker">TOTAL</p><div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div><span>IVA</span><b>{money(totals.tax)}</b></div><div className="grand"><span>Total</span><b>{money(totals.total)}</b></div>{number(form.deposit_percent) > 0 && <><div><span>Anticipo</span><b>{money(totals.total * number(form.deposit_percent) / 100)}</b></div><div><span>Saldo</span><b>{money(totals.total - totals.total * number(form.deposit_percent) / 100)}</b></div></>}<details className="qs-profit"><summary>Rentabilidad interna</summary><div><span>Costo estimado</span><b>{money(totals.cost)}</b></div><div><span>Utilidad</span><b>{money(totals.profit)}</b></div><div><span>Margen</span><b className={totals.margin < number(form.minimum_margin) ? 'danger-text' : 'good-text'}>{totals.margin}%</b></div></details>{validation.warnings.length > 0 && <div className="q360-warnings">{validation.warnings.map((warning, index) => <small key={index}>⚠ {warning}</small>)}</div>}</aside></div>

      <div className="q360-actions qs-actions"><button disabled={busy} onClick={() => save()}>{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear cotización'}</button>{form.id && <button className="secondary" onClick={() => window.print()}>Imprimir / PDF</button>}{form.id && <details className="qs-more qs-actions-more"><summary>Más acciones</summary><div><button className="secondary" onClick={() => save({ newRevision: true })}>Nueva revisión</button><button className="secondary" onClick={copyPublicLink}>Copiar enlace</button>{form.status === 'APPROVED' && <button onClick={() => convertToWorkOrder(form)}>Crear orden de trabajo</button>}</div></details>}</div>
    </div>}

    {view === 'FOLLOW' && <div className="q360-follow-grid"><section className="panel q360-card qs-card"><div className="panel-heading"><h3>Próximo seguimiento</h3></div>{form.id ? <><div className="form-grid two"><Field label="Fecha y hora"><input type="datetime-local" value={followForm.due_at} onChange={(event) => setFollowForm({ ...followForm, due_at: event.target.value })}/></Field><Field label="Tipo"><select value={followForm.type} onChange={(event) => setFollowForm({ ...followForm, type: event.target.value })}><option>FOLLOW_UP</option><option>CALL</option><option>MEETING</option><option>WHATSAPP</option><option>EMAIL</option><option>PAYMENT</option></select></Field><Field label="Nota" className="form-span-2"><textarea value={followForm.note} onChange={(event) => setFollowForm({ ...followForm, note: event.target.value })}/></Field></div><button onClick={addFollowup}>Programar</button><div className="q360-timeline">{followups.map((followup) => <div key={followup.id}><span>{new Date(followup.due_at).toLocaleString('es-SV')}</span><strong>{followup.type} · {followup.status}</strong><p>{followup.note || 'Sin nota'}</p>{followup.status === 'PENDING' && <button className="secondary" onClick={() => completeFollowup(followup)}>Completar</button>}</div>)}</div></> : <div className="empty-state">Abrí una cotización primero.</div>}</section><section className="panel q360-card qs-card"><div className="panel-heading"><h3>Comunicaciones</h3></div>{form.id ? <><div className="form-grid two"><Field label="Canal"><select value={commForm.channel} onChange={(event) => setCommForm({ ...commForm, channel: event.target.value })}><option>WHATSAPP</option><option>EMAIL</option><option>CALL</option><option>MEETING</option><option>INTERNAL</option></select></Field><Field label="Destinatario"><input value={commForm.recipient} onChange={(event) => setCommForm({ ...commForm, recipient: event.target.value })}/></Field><Field label="Asunto" className="form-span-2"><input value={commForm.subject} onChange={(event) => setCommForm({ ...commForm, subject: event.target.value })}/></Field><Field label="Mensaje" className="form-span-2"><textarea rows="3" value={commForm.message} onChange={(event) => setCommForm({ ...commForm, message: event.target.value })}/></Field></div><button onClick={recordCommunication}>Registrar</button><div className="q360-timeline">{communications.map((communication) => <div key={communication.id}><span>{new Date(communication.created_at).toLocaleString('es-SV')}</span><strong>{communication.channel} · {communication.recipient || 'Interno'}</strong><p>{communication.message}</p></div>)}</div></> : <div className="empty-state">Abrí una cotización primero.</div>}</section></div>}

    {view === 'SUMMARY' && <div className="q360-analytics"><section className="panel q360-card qs-card"><div className="panel-heading"><h3>Resumen comercial</h3></div><div className="q360-kpis"><MiniKpi label="Cotizaciones" value={stats.count}/><MiniKpi label="Valor cotizado" value={money(stats.value)}/><MiniKpi label="Conversión" value={`${stats.approvalRate}%`}/><MiniKpi label="Pipeline" value={money(stats.openValue)}/><MiniKpi label="Forecast" value={money(stats.forecast)}/><MiniKpi label="Ticket promedio" value={money(stats.averageTicket)}/></div></section><section className="panel q360-card qs-card"><div className="panel-heading"><h3>Trazabilidad</h3></div>{form.id ? <><div className="q360-audit"><p><b>Versiones:</b> {versions.length}</p><p><b>Cambios de estado:</b> {history.length}</p><p><b>Comunicaciones:</b> {communications.length}</p><p><b>Seguimientos:</b> {followups.length}</p></div><div className="q360-timeline">{history.map((entry) => <div key={entry.id}><span>{new Date(entry.changed_at).toLocaleString('es-SV')}</span><strong>{STATUS_LABELS[entry.from_status] || entry.from_status || 'Inicio'} → {STATUS_LABELS[entry.to_status] || entry.to_status}</strong><p>{entry.comment || 'Cambio registrado'}</p></div>)}</div></> : <div className="empty-state">Abrí una cotización para ver su trazabilidad.</div>}</section></div>}
  </section>
}
