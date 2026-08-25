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

function bodyItems(payload) { return Array.isArray(payload?.cuerpoDocumento) ? payload.cuerpoDocumento : [] }
function payments(payload) { return Array.isArray(payload?.resumen?.pagos) ? payload.resumen.pagos : [] }
function autoMatches(code, doc) {
  const payload = doc.dte_payload || {}; const items = bodyItems(payload); const pagos = payments(payload); const receptor = payload.receptor
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
  const [rows, setRows] = useState([]); const [docs, setDocs] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const seedRows = DEFAULT_SCENARIOS.map((scenario, index) => ({ company_id: company.id, code: scenario.code, label: scenario.label, description: scenario.description, sort_order: index + 1 }))
      const { error: seedError } = await supabase.from('dte_test_scenarios').upsert(seedRows, { onConflict: 'company_id,code', ignoreDuplicates: true }); if (seedError) throw seedError
      const [{ data: scenarioRows, error: scenarioError }, { data: processedDocs, error: docsError }] = await Promise.all([
        supabase.from('dte_test_scenarios').select('*').eq('company_id', company.id).order('sort_order'),
        supabase.from('dte_documents').select('id, control_number, dte_payload, mh_processed_at, created_at').eq('company_id', company.id).eq('dte_type', '01').eq('status', 'PROCESSED').order('created_at', { ascending: false }).limit(100),
      ])
      if (scenarioError || docsError) throw scenarioError || docsError; setRows(scenarioRows || []); setDocs(processedDocs || [])
    } catch (cause) { setError(cause.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [company.id])
  const enriched = useMemo(() => rows.map((row) => { const matched = docs.find((doc) => autoMatches(row.code, doc)); return { ...row, matchedDocument: matched || null, effectiveCompleted: row.completed || Boolean(matched) } }), [rows, docs])
  const completed = enriched.filter((row) => row.effectiveCompleted).length; const next = enriched.find((row) => !row.effectiveCompleted); const progress = enriched.length ? Math.round((completed / enriched.length) * 100) : 0
  const toggleManual = async (row) => { const nextValue = !row.completed; const { error: updateError } = await supabase.from('dte_test_scenarios').update({ completed: nextValue, completed_at: nextValue ? new Date().toISOString() : null, completed_document_id: nextValue ? row.matchedDocument?.id || null : null, updated_at: new Date().toISOString() }).eq('id', row.id); if (updateError) return setError(updateError.message); await load() }
  const prepare = (row) => window.dispatchEvent(new CustomEvent('idealo:navigate-module', { detail: { module: 'Facturación', action: 'new-invoice', dteTestScenario: row.code } }))

  return <section style={styles.card}>
    <div style={styles.head}><div><strong style={styles.title}>Centro de Pruebas MH · DTE-01</strong><p style={styles.subtitle}>Preparación y evidencia desde IDEALO SV para trabajar los casos de prueba en ambiente TEST.</p></div><button type="button" onClick={load} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
    <div style={styles.notice}><strong>Importante:</strong> Hacienda mantiene el contador oficial. IDEALO SV no puede afirmar ni modificar ese contador sin una fuente oficial disponible; aquí se separa claramente el avance interno de la evidencia aceptada por MH.</div>
    {error && <p style={styles.error}>{error}</p>}
    <div style={styles.summary}>
      <div><small>Casos internos cubiertos</small><strong>{completed}/{enriched.length}</strong></div>
      <div><small>DTE-01 procesados por MH desde ERP</small><strong>{docs.length}</strong></div>
      <div><small>Avance oficial portal MH</small><strong>Consultar portal</strong></div>
      <div><small>Siguiente caso a preparar</small><strong>{next?.label || 'Cobertura interna completa'}</strong></div>
    </div>
    <div style={styles.progress}><span style={{ display: 'block', height: '100%', width: `${progress}%`, background: '#f97316', transition: 'width .2s ease' }} /></div>
    <div style={styles.legend}><span>✓ Evidencia detectada/registrada</span><span>○ Pendiente interno</span><span>El contador oficial solo lo confirma Hacienda</span></div>
    <div style={styles.list}>{enriched.map((row) => <article key={row.id} style={styles.row}>
      <span style={{ ...styles.status, ...(row.effectiveCompleted ? styles.done : styles.pending) }}>{row.effectiveCompleted ? '✓' : '○'}</span>
      <div style={{ flex: 1 }}><strong>{row.label}</strong><p>{row.description}</p>{row.matchedDocument && <small>Evidencia MH: {row.matchedDocument.control_number}</small>}</div>
      <div style={styles.actions}>{!row.effectiveCompleted && <button type="button" onClick={() => prepare(row)}>Preparar caso</button>}<button type="button" style={styles.manual} onClick={() => toggleManual(row)}>{row.completed ? 'Quitar registro manual' : 'Registrar manual'}</button></div>
    </article>)}</div>
    {next && <div style={styles.next}><strong>Siguiente paso:</strong> preparar “{next.label}”, validar el DTE, firmarlo y enviarlo únicamente a TEST. Una respuesta PROCESSED con sello queda como evidencia del ERP, pero no se presenta como incremento del contador oficial hasta que Hacienda lo refleje.</div>}
  </section>
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #cbd5e1', borderRadius: 14, background: '#f8fafc', color: '#1e293b' }, head: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }, title: { fontSize: 17 }, subtitle: { margin: '4px 0 0', color: '#64748b' }, notice: { marginTop: 14, padding: 12, borderLeft: '4px solid #f97316', background: '#fff7ed', color: '#9a3412' }, error: { padding: 10, borderRadius: 8, background: '#fee2e2', color: '#991b1b' }, summary: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 14 }, progress: { height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', margin: '12px 0' }, legend: { display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#64748b', marginBottom: 10 }, list: { display: 'grid', gap: 8 }, row: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }, status: { width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', fontWeight: 900 }, done: { background: '#dcfce7', color: '#166534' }, pending: { background: '#f1f5f9', color: '#64748b' }, actions: { display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }, manual: { fontSize: 12, padding: '7px 9px' }, next: { marginTop: 12, padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412' },
}
