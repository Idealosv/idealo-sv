import { useEffect, useMemo, useState } from 'react'

const DEFAULT_SCENARIOS = [
  { code: 'consumer_no_id', label: 'Consumidor final sin identificación', description: 'Factura DTE-01 con receptor omitido cuando legalmente corresponda.' },
  { code: 'consumer_identified', label: 'Receptor identificado', description: 'Factura con datos de receptor tomados del módulo Clientes.' },
  { code: 'cash', label: 'Operación al contado', description: 'Factura con condición de operación al contado.' },
  { code: 'credit', label: 'Operación a crédito', description: 'Factura con plazo y período informados.' },
  { code: 'transfer', label: 'Pago por transferencia', description: 'Factura con forma de pago transferencia bancaria.' },
  { code: 'electronic_payment', label: 'Pago electrónico', description: 'Factura con dinero/pago electrónico informado.' },
  { code: 'discount', label: 'Factura con descuento', description: 'Una o más partidas con descuento mayor que cero.' },
  { code: 'multi_item', label: 'Factura con varias partidas', description: 'DTE con dos o más líneas de detalle.' },
  { code: 'goods', label: 'Venta de bienes', description: 'Partida clasificada como bien.' },
  { code: 'services', label: 'Venta de servicios', description: 'Partida clasificada como servicio.' },
  { code: 'exempt', label: 'Venta exenta', description: 'Solo cuando la operación sea legalmente exenta.' },
  { code: 'non_subject', label: 'Venta no sujeta', description: 'Solo cuando la operación sea legalmente no sujeta.' },
]

function bodyItems(payload) {
  return Array.isArray(payload?.cuerpoDocumento) ? payload.cuerpoDocumento : []
}

function payments(payload) {
  return Array.isArray(payload?.resumen?.pagos) ? payload.resumen.pagos : []
}

function autoMatches(code, doc) {
  const payload = doc.dte_payload || {}
  const items = bodyItems(payload)
  const pagos = payments(payload)
  const receptor = payload.receptor
  switch (code) {
    case 'consumer_no_id': return !receptor || !receptor.nombre
    case 'consumer_identified': return Boolean(receptor?.nombre)
    case 'cash': return Number(payload?.resumen?.condicionOperacion) === 1
    case 'credit': return Number(payload?.resumen?.condicionOperacion) === 2
    case 'transfer': return pagos.some((p) => String(p.codigo) === '05')
    case 'electronic_payment': return Boolean(payload?.resumen?.numPagoElectronico) || pagos.some((p) => String(p.codigo) === '08')
    case 'discount': return items.some((item) => Number(item.montoDescu || 0) > 0)
    case 'multi_item': return items.length >= 2
    case 'goods': return items.some((item) => Number(item.tipoItem) === 1)
    case 'services': return items.some((item) => Number(item.tipoItem) === 2)
    case 'exempt': return items.some((item) => Number(item.ventaExenta || 0) > 0)
    case 'non_subject': return items.some((item) => Number(item.ventaNoSuj || 0) > 0)
    default: return false
  }
}

export default function DteTestPlan({ supabase, company }) {
  const [rows, setRows] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const seedRows = DEFAULT_SCENARIOS.map((scenario, index) => ({
        company_id: company.id,
        code: scenario.code,
        label: scenario.label,
        description: scenario.description,
        sort_order: index + 1,
      }))
      const { error: seedError } = await supabase.from('dte_test_scenarios').upsert(seedRows, { onConflict: 'company_id,code', ignoreDuplicates: true })
      if (seedError) throw seedError

      const [{ data: scenarioRows, error: scenarioError }, { data: processedDocs, error: docsError }] = await Promise.all([
        supabase.from('dte_test_scenarios').select('*').eq('company_id', company.id).order('sort_order'),
        supabase.from('dte_documents').select('id, control_number, dte_payload, mh_processed_at, created_at').eq('company_id', company.id).eq('dte_type', '01').eq('status', 'PROCESSED').order('created_at', { ascending: false }).limit(100),
      ])
      if (scenarioError || docsError) throw scenarioError || docsError
      setRows(scenarioRows || []); setDocs(processedDocs || [])
    } catch (cause) { setError(cause.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company.id])

  const enriched = useMemo(() => rows.map((row) => {
    const matched = docs.find((doc) => autoMatches(row.code, doc))
    return { ...row, autoCompleted: Boolean(matched), matchedDocument: matched || null, effectiveCompleted: row.completed || Boolean(matched) }
  }), [rows, docs])

  const completed = enriched.filter((row) => row.effectiveCompleted).length
  const next = enriched.find((row) => !row.effectiveCompleted)

  const toggleManual = async (row) => {
    const nextValue = !row.completed
    const { error: updateError } = await supabase.from('dte_test_scenarios').update({
      completed: nextValue,
      completed_at: nextValue ? new Date().toISOString() : null,
      completed_document_id: nextValue ? row.matchedDocument?.id || null : null,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (updateError) return setError(updateError.message)
    await load()
  }

  return (
    <section style={styles.card}>
      <div style={styles.head}>
        <div>
          <strong>Plan interno de pruebas DTE-01</strong>
          <p style={styles.subtitle}>Cobertura técnica de IDEALO SV. No sustituye el contador ni los casos oficiales del portal de Hacienda.</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? 'Revisando…' : 'Actualizar plan'}</button>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.summary}>
        <div><small>Cobertura interna</small><strong>{completed}/{enriched.length}</strong></div>
        <div><small>DTE aceptados por MH desde IDEALO</small><strong>{docs.length}</strong></div>
        <div><small>Siguiente caso recomendado</small><strong>{next?.label || 'Cobertura base completa'}</strong></div>
      </div>
      <div style={styles.progress}><span style={{ width: `${enriched.length ? Math.round((completed / enriched.length) * 100) : 0}%` }} /></div>
      <div style={styles.list}>
        {enriched.map((row) => (
          <article key={row.id} style={styles.row}>
            <span style={{ ...styles.status, ...(row.effectiveCompleted ? styles.done : styles.pending) }}>{row.effectiveCompleted ? '✓' : '○'}</span>
            <div style={{ flex: 1 }}><strong>{row.label}</strong><p>{row.description}</p>{row.matchedDocument && <small>Detectado en {row.matchedDocument.control_number}</small>}</div>
            <button type="button" style={styles.manual} onClick={() => toggleManual(row)}>{row.completed ? 'Desmarcar manual' : 'Marcar manual'}</button>
          </article>
        ))}
      </div>
      {next && <div style={styles.next}><strong>Próxima prueba sugerida:</strong> {next.label}. Prepará únicamente un caso real y válido para esa condición; no uses operaciones exentas o no sujetas si no corresponden legalmente.</div>}
    </section>
  )
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #bfdbfe', borderRadius: 14, background: '#eff6ff', color: '#1e293b' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  subtitle: { margin: '4px 0 0', color: '#64748b' },
  error: { padding: 10, borderRadius: 8, background: '#fee2e2', color: '#991b1b' },
  summary: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginTop: 14 },
  progress: { height: 8, background: '#dbeafe', borderRadius: 999, overflow: 'hidden', margin: '12px 0' },
  list: { display: 'grid', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: 10, borderRadius: 10, border: '1px solid #dbeafe' },
  status: { width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', fontWeight: 900 },
  done: { background: '#dcfce7', color: '#166534' },
  pending: { background: '#f1f5f9', color: '#64748b' },
  manual: { fontSize: 12, padding: '7px 9px' },
  next: { marginTop: 12, padding: 12, borderRadius: 10, background: '#dbeafe', color: '#1e3a8a' },
}
