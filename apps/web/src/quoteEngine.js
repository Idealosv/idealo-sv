export const QUOTE_STATUSES = ['DRAFT','PREPARED','SENT','VIEWED','NEGOTIATION','PENDING','APPROVED','REJECTED','EXPIRED','PARTIALLY_CONVERTED','CONVERTED','CANCELLED','ARCHIVED']

export const STATUS_LABELS = {
  DRAFT:'Borrador', PREPARED:'Preparada', SENT:'Enviada', VIEWED:'Vista', NEGOTIATION:'Negociación', PENDING:'Pendiente',
  APPROVED:'Aprobada', REJECTED:'Rechazada', EXPIRED:'Vencida', PARTIALLY_CONVERTED:'Parcialmente convertida',
  CONVERTED:'Convertida', CANCELLED:'Anulada', ARCHIVED:'Archivada'
}

export const ALLOWED_TRANSITIONS = {
  DRAFT:['PREPARED','SENT','CANCELLED','ARCHIVED'],
  PREPARED:['DRAFT','SENT','CANCELLED','ARCHIVED'],
  SENT:['VIEWED','NEGOTIATION','PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED'],
  VIEWED:['NEGOTIATION','PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED'],
  NEGOTIATION:['SENT','PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED'],
  PENDING:['NEGOTIATION','APPROVED','REJECTED','EXPIRED','CANCELLED'],
  APPROVED:['NEGOTIATION','PARTIALLY_CONVERTED','CONVERTED','CANCELLED'],
  REJECTED:['NEGOTIATION','ARCHIVED'],
  EXPIRED:['NEGOTIATION','ARCHIVED'],
  PARTIALLY_CONVERTED:['CONVERTED','CANCELLED'],
  CONVERTED:['ARCHIVED'], CANCELLED:['DRAFT','ARCHIVED'], ARCHIVED:['DRAFT']
}

export const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
export const round2 = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100
export const normalizeText = (value) => String(value ?? '').trim()

export function netPriceFromTaxIncluded(value, taxRate = 13) {
  const gross = Math.max(0, number(value))
  const rate = Math.max(0, number(taxRate, 13))
  return rate > 0 ? gross / (1 + rate / 100) : gross
}

export function itemForTaxMode(item, taxMode = 'ADDED') {
  if (taxMode !== 'INCLUDED' || item?.taxable === false) return item
  const rate = Math.max(0, number(item?.tax_rate, 13))
  return {
    ...item,
    unit_price: netPriceFromTaxIncluded(item?.unit_price, rate),
    price_per_m2: number(item?.price_per_m2) > 0 ? netPriceFromTaxIncluded(item?.price_per_m2, rate) : item?.price_per_m2,
  }
}

export function areaM2(item) {
  const width = number(item.width), height = number(item.height)
  if (width <= 0 || height <= 0) return 0
  const unit = item.dimension_unit || 'm'
  const factor = unit === 'cm' ? 0.01 : unit === 'mm' ? 0.001 : 1
  return round2(width * factor * height * factor)
}

export function tierPrice(tiers = [], quantity, fallbackPrice = 0) {
  const qty = number(quantity)
  const eligible = tiers
    .filter(t => t.active !== false && qty >= number(t.min_quantity) && (t.max_quantity == null || qty <= number(t.max_quantity)))
    .sort((a,b) => number(b.min_quantity)-number(a.min_quantity))
  return eligible.length ? number(eligible[0].unit_price) : number(fallbackPrice)
}

export function itemBaseUnitPrice(item) {
  if (number(item.price_per_m2) > 0 && areaM2(item) > 0) return round2(number(item.price_per_m2) * areaM2(item))
  return number(item.unit_price)
}

export function calculateItem(item) {
  const quantity = Math.max(0, number(item.quantity))
  const unitPrice = Math.max(0, itemBaseUnitPrice(item))
  const gross = round2(quantity * unitPrice)
  const discountPercent = Math.min(100, Math.max(0, number(item.discount_percent)))
  const discountFixed = Math.max(0, number(item.discount_fixed ?? item.discount))
  const percentageDiscount = round2(gross * discountPercent / 100)
  const discount = Math.min(gross, round2(percentageDiscount + discountFixed))
  const surchargePercent = Math.max(0, number(item.surcharge_percent))
  const surchargeFixed = Math.max(0, number(item.surcharge_fixed))
  const surcharge = round2((gross - discount) * surchargePercent / 100 + surchargeFixed)
  const taxableBase = round2(Math.max(0, gross - discount + surcharge))
  const taxRate = item.taxable === false ? 0 : Math.max(0, number(item.tax_rate, 13))
  const tax = round2(taxableBase * taxRate / 100)
  const total = round2(taxableBase + tax)
  const unitCost = Math.max(0, number(item.unit_cost ?? item.cost_estimate) + number(item.labor_unit_cost) + number(item.installation_unit_cost))
  const totalCost = round2(unitCost * quantity)
  const profit = round2(taxableBase - totalCost)
  const margin = taxableBase > 0 ? round2(profit / taxableBase * 100) : 0
  const markup = totalCost > 0 ? round2(profit / totalCost * 100) : 0
  return { quantity, unitPrice, gross, discount, surcharge, subtotal: taxableBase, tax, total, unitCost, totalCost, profit, margin, markup, area: areaM2(item) }
}

export function calculateQuote(items = [], options = {}) {
  const calculated = items.map(calculateItem)
  const gross = round2(calculated.reduce((s,x)=>s+x.gross,0))
  const lineDiscount = round2(calculated.reduce((s,x)=>s+x.discount,0))
  const lineSurcharge = round2(calculated.reduce((s,x)=>s+x.surcharge,0))
  const subtotalBeforeGlobal = round2(calculated.reduce((s,x)=>s+x.subtotal,0))
  const globalDiscountPercent = Math.min(100, Math.max(0, number(options.discount_percent)))
  const globalDiscountFixed = Math.max(0, number(options.discount_fixed))
  const globalDiscount = Math.min(subtotalBeforeGlobal, round2(subtotalBeforeGlobal * globalDiscountPercent / 100 + globalDiscountFixed))
  const globalSurchargePercent = Math.max(0, number(options.surcharge_percent))
  const globalSurchargeFixed = Math.max(0, number(options.surcharge_fixed))
  const globalSurcharge = round2((subtotalBeforeGlobal - globalDiscount) * globalSurchargePercent / 100 + globalSurchargeFixed)
  const taxableSubtotal = round2(Math.max(0, subtotalBeforeGlobal - globalDiscount + globalSurcharge))
  const taxBeforeGlobal = round2(calculated.reduce((s,x)=>s+x.tax,0))
  const taxRatio = subtotalBeforeGlobal > 0 ? taxBeforeGlobal / subtotalBeforeGlobal : 0
  const tax = round2(taxableSubtotal * taxRatio)
  const total = round2(taxableSubtotal + tax)
  const cost = round2(calculated.reduce((s,x)=>s+x.totalCost,0))
  const profit = round2(taxableSubtotal - cost)
  const margin = taxableSubtotal > 0 ? round2(profit / taxableSubtotal * 100) : 0
  const markup = cost > 0 ? round2(profit / cost * 100) : 0
  return { items: calculated, gross, lineDiscount, lineSurcharge, subtotal: taxableSubtotal, globalDiscount, globalSurcharge, tax, total, cost, profit, margin, markup }
}

export function canTransition(from, to) {
  if (from === to) return true
  return (ALLOWED_TRANSITIONS[from] || []).includes(to)
}

export function validateQuote({ client_id, items = [], valid_until, minimum_margin = 0 }, totals = calculateQuote(items)) {
  const errors = [], warnings = []
  if (!client_id) errors.push('Seleccioná un cliente.')
  if (!items.length) errors.push('Agregá al menos una partida.')
  items.forEach((item,index) => {
    if (!normalizeText(item.description)) errors.push(`La partida ${index+1} necesita descripción.`)
    if (number(item.quantity) <= 0) errors.push(`La partida ${index+1} necesita cantidad mayor que cero.`)
    if (number(item.unit_price) < 0) errors.push(`La partida ${index+1} tiene precio inválido.`)
    const calc = calculateItem(item)
    if (number(item.minimum_price) > 0 && calc.unitPrice < number(item.minimum_price)) warnings.push(`Partida ${index+1}: precio debajo del mínimo.`)
    if (calc.margin < number(minimum_margin)) warnings.push(`Partida ${index+1}: margen ${calc.margin}% debajo del objetivo.`)
  })
  if (valid_until && new Date(valid_until+'T23:59:59') < new Date()) warnings.push('La vigencia ya venció.')
  if (totals.total <= 0) warnings.push('El total de la cotización es cero.')
  if (totals.margin < number(minimum_margin)) warnings.push(`Margen global ${totals.margin}% debajo del objetivo ${number(minimum_margin)}%.`)
  return { valid: errors.length === 0, errors, warnings }
}

export function quoteCode(numberValue, prefix='COT', createdAt=new Date()) {
  const year = new Date(createdAt).getFullYear()
  return `${prefix}-${year}-${String(numberValue || 0).padStart(5,'0')}`
}

export function weightedForecast(quotes = []) {
  const probability = { DRAFT:.05, PREPARED:.1, SENT:.2, VIEWED:.3, NEGOTIATION:.5, PENDING:.65, APPROVED:1, PARTIALLY_CONVERTED:1, CONVERTED:1, REJECTED:0, EXPIRED:0, CANCELLED:0, ARCHIVED:0 }
  return round2(quotes.reduce((sum,q)=>sum + number(q.total) * (number(q.close_probability, probability[q.status] ?? 0)),0))
}

export function quoteStats(quotes = []) {
  const total = quotes.reduce((s,q)=>s+number(q.total),0)
  const approved = quotes.filter(q=>['APPROVED','PARTIALLY_CONVERTED','CONVERTED'].includes(q.status))
  const rejected = quotes.filter(q=>q.status==='REJECTED')
  const open = quotes.filter(q=>!['REJECTED','CONVERTED','CANCELLED','ARCHIVED','EXPIRED'].includes(q.status))
  return {
    count: quotes.length,
    value: round2(total),
    approvedValue: round2(approved.reduce((s,q)=>s+number(q.total),0)),
    openValue: round2(open.reduce((s,q)=>s+number(q.total),0)),
    approvalRate: quotes.length ? round2(approved.length/quotes.length*100) : 0,
    rejectionRate: quotes.length ? round2(rejected.length/quotes.length*100) : 0,
    averageTicket: quotes.length ? round2(total/quotes.length) : 0,
    forecast: weightedForecast(quotes)
  }
}

export function cloneItem(item) {
  const copy = { ...item }
  delete copy.id; delete copy.quote_id; delete copy.created_at; delete copy.updated_at
  return copy
}
