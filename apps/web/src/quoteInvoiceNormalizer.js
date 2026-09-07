export const roundMoney = value => Number(Number(value || 0).toFixed(2))

const TAX_RATE = 0.13

export function normalizeQuoteItemsToTotal(items, priceMode, targetTotal) {
  const target = roundMoney(targetTotal)
  if (!Array.isArray(items) || !items.length || target <= 0) return items || []

  const itemTotal = item => {
    const qty = Math.max(0, Number(item.cantidad || 0))
    const price = Math.max(0, Number(item.precioUni || 0))
    const gross = qty * price
    const discount = Math.min(Math.max(0, Number(item.montoDescu || 0)), gross)
    const net = Math.max(0, gross - discount)
    if (item.tipoVenta !== 'gravada' || priceMode === 'con_iva') return roundMoney(net)
    return roundMoney(net * (1 + TAX_RATE))
  }

  const sum = rows => roundMoney(rows.reduce((total, item) => total + itemTotal(item), 0))
  const current = sum(items)
  if (current <= 0 || Math.abs(current - target) <= 0.01) return items

  const factor = target / current
  let normalized = items.map(item => ({
    ...item,
    precioUni: roundMoney(Number(item.precioUni || 0) * factor).toFixed(2),
    montoDescu: roundMoney(Number(item.montoDescu || 0) * factor).toFixed(2),
  }))

  const residual = roundMoney(target - sum(normalized))
  if (Math.abs(residual) > 0.001) {
    const index = [...normalized].map((item, i) => ({ item, i })).reverse().find(({ item }) => Number(item.cantidad || 0) > 0)?.i
    if (index !== undefined) {
      const item = normalized[index]
      const qty = Number(item.cantidad || 1)
      const taxFactor = item.tipoVenta === 'gravada' && priceMode === 'sin_iva' ? 1 + TAX_RATE : 1
      const nextPrice = Math.max(0, Number(item.precioUni || 0) + residual / (qty * taxFactor))
      normalized = normalized.map((row, i) => i === index ? { ...row, precioUni: roundMoney(nextPrice).toFixed(2) } : row)
    }
  }

  return normalized
}
