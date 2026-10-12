import { useEffect, useMemo, useState } from 'react'
import DteCertificationEditor from './DteCertificationEditor.jsx'
import MhAdditionalEventEditor from './MhAdditionalEventEditor.jsx'

/*
 * Metas referenciales del plan de pruebas del Sistema de Transmisión DTE.
 * El contador OFICIAL lo determina únicamente el portal de Hacienda.
 * Este componente cuenta respuestas PROCESSED registradas por IDEALO SV en TEST;
 * nunca presume que esas respuestas coinciden con el tablero oficial.
 */
export const MH_CERTIFICATION_REQUIREMENTS = [
  { key: 'DTE:01', name: 'Factura de consumidor final', goal: 90, action: 'invoice', implemented: true },
  { key: 'DTE:03', name: 'Comprobante de Crédito Fiscal', goal: 75, action: 'invoice', implemented: true },
  { key: 'DTE:04', name: 'Nota de Remisión', goal: 50, action: 'advanced', implemented: true },
  { key: 'DTE:05', name: 'Nota de Crédito', goal: 50, action: 'advanced', implemented: true },
  { key: 'DTE:06', name: 'Nota de Débito', goal: 25, action: 'advanced', implemented: true },
  { key: 'DTE:07', name: 'Comprobante de Retención', goal: 50, action: 'advanced', implemented: true },
  { key: 'DTE:08', name: 'Comprobante de Liquidación', goal: 75, action: 'advanced', implemented: true },
  { key: 'DTE:09', name: 'Documento Contable de Liquidación', goal: 50, action: 'advanced', implemented: true },
  { key: 'DTE:11', name: 'Factura de Exportación', goal: 90, action: 'advanced', implemented: true },
  { key: 'DTE:14', name: 'Factura de Sujeto Excluido', goal: 25, action: 'advanced', implemented: true },
  { key: 'DTE:15', name: 'Comprobante de Donación', goal: 25, action: 'advanced', implemented: true },
  { key: 'EVENT:CONTINGENCY', name: 'Evento de Contingencia', goal: 5, action: 'documents', implemented: true },
  { key: 'EVENT:INVALIDATION', name: 'Evento de Invalidación', goal: 5, action: 'documents', implemented: true },
  { key: 'EVENT:RETURN', name: 'Evento de Retorno', goal: 5, action:'event_draft', implemented: true },
  { key: 'EVENT:SPECIAL_OPERATIONS', name: 'Evento de Operaciones Especiales', goal: 5, action:'event_draft', implemented: true },
]

const card = { border: '1px solid #d3dbe5', borderRadius: 14, padding: 14, background: '#fff' }
const muted = { display: 'block', color: '#64748b', fontSize: 12, lineHeight: 1.5 }
const buttonStyle = { padding: '8px 12px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: 700 }

function createCountRequest(supabase, companyId, requirement) {
  const isEvent = requirement.key.startsWith('EVENT:')
  const [kind, code] = requirement.key.split(':')
  const table = isEvent ? 'dte_fiscal_events' : 'dte_documents'
  let query = supabase.from(table).select('id', { head: true, count: 'exact' })
    .eq('company_id', companyId)
    .eq('environment', 'test')
    .not('mh_response', 'is', null)
  // Un DTE previamente procesado sigue teniendo evidencia aunque haya sido invalidado después.
  query = isEvent ? query.eq('status', 'PROCESSED').eq('event_type', code)
    : query.in('status', ['PROCESSED', 'INVALIDATED']).eq('dte_type', code)
  return query
}

export default function MhCertificationCenter({ supabase, company, session, onPrepareInvoice, onOpenDocuments }) {
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [editorType, setEditorType] = useState('')
  const [eventEditorType, setEventEditorType] = useState('')

  useEffect(() => {
    if (!supabase || !company?.id) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    async function load() {
      try {
        const results = await Promise.all(MH_CERTIFICATION_REQUIREMENTS.map(async (requirement) => {
          const { count, error: countError } = await createCountRequest(supabase, company.id, requirement)
          if (countError) throw new Error(requirement.name + ': ' + countError.message)
          return [requirement.key, Number(count || 0)]
        }))
        if (!cancelled) setCounts(Object.fromEntries(results))
      } catch (cause) {
        if (!cancelled) { setCounts({}); setError(cause.message || 'No se pudo consultar el historial de pruebas.') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, company?.id, refresh])

  const stats = useMemo(() => {
    const completed = MH_CERTIFICATION_REQUIREMENTS.filter((row) => counts[row.key] >= row.goal).length
    const supportedPending = MH_CERTIFICATION_REQUIREMENTS.filter((row) => row.implemented && (counts[row.key] || 0) < row.goal).length
    return { completed, supportedPending }
  }, [counts])

  function act(requirement) {
    if (!requirement.implemented) return
    if (requirement.action === 'invoice') onPrepareInvoice?.(requirement.key.slice(4))
    if (requirement.action === 'documents') onOpenDocuments?.()
    if (requirement.action === 'advanced') { setEditorType(requirement.key.slice(4)); setEventEditorType('') }
    if (requirement.action === 'event_draft') { setEventEditorType(requirement.key.slice(6)); setEditorType('') }
  }

  return <section style={{ marginBottom: 20, color: '#0f172a' }} aria-label="Centro de certificación Hacienda TEST">
    <div style={{ ...card, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <strong style={{ display: 'block', fontSize: 19 }}>Certificación Hacienda · desde IDEALO SV</strong>
          <span style={muted}>Historial de documentos y eventos aceptados por Hacienda TEST (ambiente 00).</span>
        </div>
        <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} style={buttonStyle}>
          {loading ? 'Consultando…' : 'Actualizar evidencia'}
        </button>
      </div>
      <p style={{ padding: 12, borderLeft: '4px solid #f97316', background: '#fff7ed', color: '#9a3412', lineHeight: 1.5, margin: '14px 0' }}>
        <strong>Importante:</strong> estos conteos provienen exclusivamente de la base de datos del ERP, no del panel oficial de Hacienda. Los DTE enviados fuera de IDEALO no aparecen aquí. No todas las categorías son obligatorias para cada emisor. La autorización, las metas aplicables y el cumplimiento oficial se comprueban en el portal de Hacienda.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <div style={card}><span style={muted}>Categorías con meta local alcanzada</span><strong style={{ fontSize: 22 }}>{stats.completed}/{MH_CERTIFICATION_REQUIREMENTS.length}</strong></div>
        <div style={card}><span style={muted}>Flujos disponibles con trabajo pendiente</span><strong style={{ fontSize: 22 }}>{stats.supportedPending}</strong></div>
        <div style={card}><span style={muted}>Entorno de transmisión</span><strong style={{ fontSize: 22 }}>TEST 00</strong></div>
      </div>
      {error && <p role="alert" style={{ color: '#b91c1c', fontWeight: 700 }}>No se pudieron cargar los datos: {error}</p>}
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {MH_CERTIFICATION_REQUIREMENTS.map((requirement) => {
          const count = counts[requirement.key] ?? null
          const goal = requirement.goal
          const met = count !== null && count >= goal
          const percent = count === null ? 0 : Math.min(100, Math.round(100 * count / goal))
          const code = requirement.key.split(':')[1]
          return <article key={requirement.key} style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <strong>{requirement.name}</strong>
                <small style={muted}>{requirement.key.startsWith('DTE:') ? 'DTE-' + code : 'Evento'} · {requirement.action === 'event_draft' ? 'Solo borrador: envío pendiente MH' : requirement.implemented ? 'Herramientas TEST disponibles en IDEALO' : 'Evento pendiente de implementar'}</small>
              </div>
              <strong style={{ color: met ? '#047857' : '#334155' }}>{count === null ? '—' : count} / {goal}</strong>
            </div>
            <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }} role="progressbar" aria-label={requirement.name} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, count || 0)}>
              <div style={{ width: percent + '%', height: '100%', background: met ? '#059669' : '#ea580c' }} />
            </div>
            {requirement.implemented
              ? <div><button type="button" style={buttonStyle} onClick={() => act(requirement)}>{requirement.action === 'invoice' ? 'Preparar DTE-' + code + ' desde ERP' : requirement.action === 'advanced' ? 'Preparar DTE-' + code + ' · TEST' : requirement.action==='event_draft' ? 'Preparar borrador TEST (sin envío)' : 'Abrir documentos y eventos'}</button></div>
              : <small style={{ ...muted, color: '#92400e' }}>No se habilita el envío hasta implementar y validar el constructor, el esquema y la firma de este tipo.</small>}
          </article>
        })}
      </div>
      {editorType && <DteCertificationEditor key={editorType} company={company} supabase={supabase} session={session} initialType={editorType} />}
      {eventEditorType && <MhAdditionalEventEditor key={eventEditorType} company={company} supabase={supabase} session={session} initialType={eventEditorType} />}
      <p style={{ ...muted, margin: '14px 0 0' }}>
        Un DTE creado o firmado todavía NO suma: la evidencia se registra únicamente tras una respuesta PROCESSED de Hacienda. Una invalidación contabiliza su propio evento por separado. Ningún botón de este panel transmite automáticamente.
      </p>
      <a href="https://admin.factura.gob.sv/dashboard" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 12, fontWeight: 700, color: '#1d4ed8' }}>Verificar contadores oficiales en Hacienda ↗</a>
    </div>
  </section>
}
