import { useEffect, useMemo, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function ProductionPreflightPanel({ session, company }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const request = async (path, options = {}) => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`)
    return payload
  }

  const load = async () => {
    if (!session?.access_token || !company?.id) return
    setLoading(true); setError('')
    try { setStatus(await request(`/api/dte/runtime-settings?companyId=${encodeURIComponent(company.id)}`)) }
    catch (cause) { setError(cause.message === 'Failed to fetch' ? 'No se pudo consultar la configuración DTE. El backend puede estar reiniciando.' : cause.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [session?.access_token, company?.id])

  const save = async (environment) => {
    setSaving(true); setError('')
    try {
      const production = environment === 'production'
      const next = await request('/api/dte/runtime-settings', {
        method: 'PUT',
        body: JSON.stringify({ companyId: company.id, environment, productionEnabled: production, productionApproved: production, confirmation: production ? confirmation : '' }),
      })
      setStatus(next); setConfirmation('')
    } catch (cause) { setError(cause.message) }
    finally { setSaving(false) }
  }

  const preflight = status?.preflight || null
  const checks = useMemo(() => preflight ? [
    { label: 'Ambiente del ERP', ok: status.environment === 'production', detail: String(status.environment || 'test').toUpperCase() },
    { label: 'Producción habilitada', ok: Boolean(status.productionEnabled), detail: status.productionEnabled ? 'Sí' : 'No' },
    { label: 'Aprobación explícita', ok: Boolean(status.productionApproved), detail: status.productionApproved ? 'Confirmada' : 'Pendiente' },
    { label: 'Credenciales privadas', ok: Boolean(preflight.credentialsConfigured), detail: preflight.credentialsConfigured ? 'Configuradas en backend' : 'Incompletas' },
    { label: 'Endpoint oficial MH', ok: Boolean(preflight.usingOfficialProductionUrl), detail: preflight.usingOfficialProductionUrl ? 'Correcto' : 'Revisar' },
    { label: 'Ruta protegida de transmisión', ok: Boolean(preflight.transmissionEndpointAvailable), detail: preflight.transmissionEndpointAvailable ? 'Disponible con barreras' : 'No disponible' },
  ] : [], [preflight, status])

  if (!status && !error) return <section style={{ ...styles.card, ...styles.warning }}><strong>Control de ambiente DTE</strong><p style={styles.subtitle}>{loading ? 'Cargando configuración…' : 'Pendiente de consulta.'}</p></section>

  const ready = Boolean(preflight?.configurationReady && preflight?.transmissionEndpointAvailable)
  return <section style={{ ...styles.card, ...(ready ? styles.ok : styles.locked) }}>
    <div style={styles.head}>
      <div><strong>Control de ambiente DTE desde el ERP</strong><p style={styles.subtitle}>Aquí cambiás TEST/PRODUCCIÓN. Las contraseñas, token del firmador y claves MH nunca se muestran ni se guardan en el navegador.</p></div>
      <button type="button" onClick={load} disabled={loading || saving}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
    </div>

    {error && <div style={styles.error}>{error}</div>}
    {status && <>
      <div style={styles.environmentBar}>
        <div><small>Ambiente activo</small><strong>{String(status.environment).toUpperCase()}</strong></div>
        <div style={styles.actions}>
          <button type="button" onClick={() => save('test')} disabled={saving || status.environment === 'test'}>Usar TEST</button>
          <button type="button" onClick={() => save('production')} disabled={saving || confirmation !== 'ACTIVAR PRODUCCION DTE'} style={styles.productionButton}>Activar PRODUCCIÓN</button>
        </div>
      </div>

      {status.environment !== 'production' && <div style={styles.confirmBox}>
        <strong>Activación protegida</strong>
        <p>Para pasar a PRODUCCIÓN escribí exactamente <b>ACTIVAR PRODUCCION DTE</b>. Esto cambia la configuración del ERP; no transmite una factura por sí solo.</p>
        <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="ACTIVAR PRODUCCION DTE" autoComplete="off" />
      </div>}

      <div style={styles.banner}><strong>{ready ? 'PRODUCCIÓN CONFIGURADA' : 'PRODUCCIÓN BLOQUEADA'}</strong><span>{ready ? 'La ruta existe, pero cada DTE aún requiere confirmación individual antes de transmitirse.' : 'El ERP impedirá cualquier transmisión real mientras falte un requisito.'}</span></div>
      <div style={styles.grid}>{checks.map((item) => <div key={item.label} style={styles.check}><span style={{ ...styles.dot, background: item.ok ? '#16a34a' : '#dc2626' }} /><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>)}</div>
      {Array.isArray(preflight?.blockers) && preflight.blockers.length > 0 && <div style={styles.blockers}><strong>Bloqueos actuales</strong><ul>{preflight.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
      <p style={styles.note}>Las credenciales sensibles continúan protegidas en el backend. Desde esta pantalla solo se administran el ambiente, la habilitación y la aprobación operativa por empresa.</p>
    </>}
  </section>
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff', color: '#1f2937' },
  ok: { borderColor: '#86efac', background: '#f0fdf4' }, locked: { borderColor: '#fdba74', background: '#fff7ed' }, warning: { borderColor: '#fdba74', background: '#fff7ed' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }, subtitle: { margin: '4px 0 0', color: '#64748b' },
  environmentBar: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 12, marginTop: 14, border: '1px solid #d1d5db', borderRadius: 10, background: '#fff' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' }, productionButton: { background: '#111827', color: '#fff' },
  confirmBox: { marginTop: 12, padding: 12, border: '1px solid #fdba74', borderRadius: 10, background: '#fff' },
  banner: { marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.86)', border: '1px solid #fed7aa', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', color: '#7c2d12' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 14 }, check: { padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.86)', border: '1px solid #e5e7eb', display: 'flex', gap: 9, alignItems: 'flex-start' }, dot: { width: 10, height: 10, borderRadius: '50%', marginTop: 5, flex: '0 0 auto' },
  blockers: { marginTop: 14, padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #fecaca', color: '#7f1d1d' }, note: { margin: '12px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.45 }, error: { marginTop: 12, padding: 10, borderRadius: 8, background: '#fee2e2', color: '#991b1b' },
}
