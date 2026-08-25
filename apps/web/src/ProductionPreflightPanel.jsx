import { useEffect, useMemo, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function ProductionPreflightPanel() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/production-preflight`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `Preflight HTTP ${response.status}`)
      setStatus(payload)
    } catch (cause) {
      setError(cause.message === 'Failed to fetch'
        ? 'No se pudo consultar el preflight. El backend puede estar reiniciando.'
        : cause.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const checks = useMemo(() => status ? [
    { label: 'Ambiente configurado', ok: status.environment === 'production', detail: status.environment === 'production' ? 'PRODUCCIÓN' : `Actual: ${String(status.environment || 'test').toUpperCase()}` },
    { label: 'Habilitación deliberada', ok: Boolean(status.productionEnabled), detail: status.productionEnabled ? 'DTE_ENABLE_PRODUCTION activo' : 'Permanece bloqueada' },
    { label: 'Aprobación explícita', ok: Boolean(status.explicitApproval), detail: status.explicitApproval ? 'Confirmada' : 'Pendiente' },
    { label: 'Credenciales privadas', ok: Boolean(status.credentialsConfigured), detail: status.credentialsConfigured ? 'Configuradas' : 'Incompletas' },
    { label: 'Endpoint oficial MH', ok: Boolean(status.usingOfficialProductionUrl), detail: status.usingOfficialProductionUrl ? 'Coincide' : 'No coincide' },
    { label: 'Endpoint de transmisión real', ok: Boolean(status.transmissionEndpointAvailable), detail: status.transmissionEndpointAvailable ? 'Disponible' : 'NO EXISTE / BLOQUEADO' },
  ] : [], [status])

  if (error) return <section style={{ ...styles.card, ...styles.warning }}><div style={styles.head}><div><strong>Preflight de PRODUCCIÓN</strong><p style={styles.subtitle}>{error}</p></div><button type="button" onClick={load}>Reintentar</button></div></section>
  if (!status) return <section style={{ ...styles.card, ...styles.warning }}><strong>Preflight de PRODUCCIÓN</strong><p style={styles.subtitle}>{loading ? 'Comprobando barreras de seguridad…' : 'Pendiente de consulta.'}</p></section>

  const ready = status.configurationReady && status.transmissionEndpointAvailable
  return <section style={{ ...styles.card, ...(ready ? styles.ok : styles.locked) }}>
    <div style={styles.head}>
      <div>
        <strong>Preflight de PRODUCCIÓN</strong>
        <p style={styles.subtitle}>Verifica configuración y barreras antes de permitir cualquier DTE real. Este panel no activa ni transmite nada.</p>
      </div>
      <button type="button" onClick={load} disabled={loading}>{loading ? 'Comprobando…' : 'Actualizar'}</button>
    </div>

    <div style={styles.banner}>
      <strong>{ready ? 'PRODUCCIÓN LISTA' : 'PRODUCCIÓN BLOQUEADA'}</strong>
      <span>{ready ? 'Todos los controles técnicos están habilitados.' : 'No existe un camino de transmisión real habilitado desde el ERP.'}</span>
    </div>

    <div style={styles.grid}>
      {checks.map((item) => <div key={item.label} style={styles.check}>
        <span style={{ ...styles.dot, background: item.ok ? '#16a34a' : '#dc2626' }} aria-hidden="true" />
        <div><strong>{item.label}</strong><small>{item.detail}</small></div>
      </div>)}
    </div>

    {Array.isArray(status.blockers) && status.blockers.length > 0 && <div style={styles.blockers}>
      <strong>Bloqueos actuales</strong>
      <ul>{status.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
    </div>}

    <p style={styles.note}>Seguridad activa: aunque la configuración llegara a marcarse como lista, el sistema seguirá sin transmitir a PRODUCCIÓN mientras <strong>transmissionEndpointAvailable</strong> permanezca en falso.</p>
  </section>
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff', color: '#1f2937' },
  ok: { borderColor: '#86efac', background: '#f0fdf4' },
  locked: { borderColor: '#fdba74', background: '#fff7ed' },
  warning: { borderColor: '#fdba74', background: '#fff7ed' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' },
  subtitle: { margin: '4px 0 0', color: '#64748b' },
  banner: { marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.86)', border: '1px solid #fed7aa', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', color: '#7c2d12' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 14 },
  check: { padding: 11, borderRadius: 10, background: 'rgba(255,255,255,.86)', border: '1px solid #e5e7eb', display: 'flex', gap: 9, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: '50%', marginTop: 5, flex: '0 0 auto' },
  blockers: { marginTop: 14, padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #fecaca', color: '#7f1d1d' },
  note: { margin: '12px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.45 },
}
