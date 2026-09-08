import { useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function MhAuthDiagnostic({ session, company }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const check = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${apiUrl}/api/dte/mh-auth-diagnostic?companyId=${encodeURIComponent(company.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `Autenticación HTTP ${response.status}`)
      setResult(payload)
    } catch (cause) {
      if (cause.name === 'AbortError') setError('La comprobación superó 15 segundos. No se transmitió ningún DTE.')
      else setError(cause.message === 'Failed to fetch' ? 'No se pudo contactar el backend para comprobar Hacienda.' : cause.message)
    } finally {
      window.clearTimeout(timer)
      setLoading(false)
    }
  }

  const tone = result?.ok ? styles.ok : result ? styles.danger : styles.neutral
  return <section style={{ ...styles.card, ...tone }}>
    <div style={styles.head}>
      <div>
        <strong>Autenticación con Hacienda</strong>
        <p style={styles.subtitle}>Comprueba usuario/NIT y contraseña API únicamente contra <strong>/seguridad/auth</strong>. No firma, no prepara y no transmite ningún DTE.</p>
      </div>
      <button type="button" onClick={check} disabled={loading}>{loading ? 'Comprobando…' : 'Comprobar autenticación'}</button>
    </div>

    {error && <div style={styles.error}><strong>Comprobación no completada.</strong> {error}</div>}
    {result && <div style={styles.grid}>
      <Metric label="Ambiente" value={String(result.environment || '—').toUpperCase()} good={result.environment === 'production'} neutral={result.environment !== 'production'} />
      <Metric label="Endpoint MH" value={result.endpoint || '—'} good={Boolean(result.endpoint)} />
      <Metric label="Credenciales" value={result.authenticated ? 'ACEPTADAS' : 'RECHAZADAS'} good={result.authenticated} />
      <Metric label="Token MH" value={result.tokenReceived ? 'RECIBIDO' : 'NO RECIBIDO'} good={result.tokenReceived} />
      <Metric label="DTE transmitidos" value={result.transmittedDocument ? 'SÍ' : 'NINGUNO'} good={!result.transmittedDocument} />
    </div>}

    {result?.ok && <div style={styles.success}><strong>AUTENTICACIÓN VÁLIDA.</strong> Hacienda aceptó las credenciales del ambiente configurado. El token no se muestra ni se guarda en esta pantalla y no se transmitió ningún documento.</div>}
    {result && !result.ok && <div style={styles.error}><strong>AUTENTICACIÓN NO VÁLIDA.</strong> {result.message || 'Hacienda no aceptó la autenticación.'} Código técnico: {result.failureKind || 'UNKNOWN'}.</div>}
    {!result && !error && <p style={styles.note}>La comprobación es manual para evitar llamadas repetidas a Hacienda cada vez que se abre Facturación.</p>}
  </section>
}

function Metric({ label, value, good, neutral = false }) {
  const color = neutral ? '#475569' : good ? '#166534' : '#991b1b'
  return <div style={styles.metric}><small>{label}</small><strong style={{ color }}>{value}</strong></div>
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff', color: '#1f2937' },
  neutral: { borderColor: '#cbd5e1', background: '#f8fafc' },
  ok: { borderColor: '#86efac', background: '#f0fdf4' },
  danger: { borderColor: '#fca5a5', background: '#fff7f7' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  subtitle: { margin: '4px 0 0', color: '#64748b', lineHeight: 1.45 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 14 },
  metric: { padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.85)', border: '1px solid #e5e7eb', display: 'grid', gap: 4 },
  success: { marginTop: 12, padding: 12, borderRadius: 10, background: '#dcfce7', color: '#14532d', lineHeight: 1.45 },
  error: { marginTop: 12, padding: 12, borderRadius: 10, background: '#fee2e2', color: '#7f1d1d', lineHeight: 1.45 },
  note: { margin: '12px 0 0', fontSize: 13, color: '#64748b' },
}
