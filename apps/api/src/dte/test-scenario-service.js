function bodyItems(payload) {
  return Array.isArray(payload?.cuerpoDocumento) ? payload.cuerpoDocumento : []
}

function payments(payload) {
  return Array.isArray(payload?.resumen?.pagos) ? payload.resumen.pagos : []
}

export function matchingDte01ScenarioCodes(payload = {}) {
  const items = bodyItems(payload)
  const pagos = payments(payload)
  const receptor = payload.receptor
  const codes = []

  if (!receptor || !receptor.nombre) codes.push('consumer_no_id')
  if (receptor?.nombre) codes.push('consumer_identified')
  if (Number(payload?.resumen?.condicionOperacion) === 1) codes.push('cash')
  if (Number(payload?.resumen?.condicionOperacion) === 2) codes.push('credit')
  if (pagos.some((payment) => String(payment.codigo) === '05')) codes.push('transfer')
  if (Boolean(payload?.resumen?.numPagoElectronico) || pagos.some((payment) => String(payment.codigo) === '08')) codes.push('electronic_payment')
  if (items.some((item) => Number(item.montoDescu || 0) > 0)) codes.push('discount')
  if (items.length >= 2) codes.push('multi_item')
  if (items.some((item) => Number(item.tipoItem) === 1)) codes.push('goods')
  if (items.some((item) => Number(item.tipoItem) === 2)) codes.push('services')
  if (items.some((item) => Number(item.ventaExenta || 0) > 0)) codes.push('exempt')
  if (items.some((item) => Number(item.ventaNoSuj || 0) > 0)) codes.push('non_subject')

  return [...new Set(codes)]
}

export async function registerProcessedTestEvidence({ supabase, document }) {
  if (!document?.id || !document?.company_id) return []
  if (String(document.dte_type) !== '01') return []
  if (String(document.environment) !== 'test') return []

  const codes = matchingDte01ScenarioCodes(document.dte_payload || {})
  if (codes.length === 0) return []

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('dte_test_scenarios')
    .update({
      completed: true,
      completed_document_id: document.id,
      completed_at: now,
      updated_at: now,
    })
    .eq('company_id', document.company_id)
    .in('code', codes)
    .select('code')

  if (error) throw error
  return (data || []).map((row) => row.code)
}
