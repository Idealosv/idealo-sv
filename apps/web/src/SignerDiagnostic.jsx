import { useEffect, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function SignerDiagnostic({ session, company }) {
  const [diagnostic, setDiagnostic] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    setDiagnostic(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 95000)
    try {
      const response = await fetch(`${apiUrl}/api/dte/signer-diagnostic?companyId=${encodeURIComponent(company.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `Diagnóstico HTTP ${response.status}`)
      setDiagnostic(payload)
    } catch (cause) {
      if (cause.name === 'AbortError') setError('El diagnóstico completo superó 95 segundos. El firmador continúa sin responder; no se intentará firmar ni transmitir hasta comprobarlo.')
      else setError(cause.message === 'Failed to fetch'
        ? 'No se pudo consultar el diagnóstico. El backend o el firmador pueden estar reiniciando; vuelve a intentar en un momento.'
        : cause.message)
    } finally {
      window.clearTimeout(timer)
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [company.id])

  if (error) {
    return <section style={{ ...styles.card, ...styles.warning }}><strong>Diagnóstico de firma pendiente</strong><p>{error}</p><button type="button" onClick={load}>Reintentar diagnóstico</button></section>
  }

  if (!diagnostic) {
    return <section style={{ ...styles.card, ...styles.warning }}><strong>{loading ? 'Despertando y comprobando el firmador…' : 'Diagnóstico del firmador'}</strong><p>{loading ? 'IDEALO SV hará varios sondeos controlados para distinguir un servicio dormido de un error real de certificado. No se enviará ningún DTE durante esta comprobación.' : 'Sin diagnóstico todavía.'}</p></section>
  }

  const healthyConfig = diagnostic.signerReachable
    && diagnostic.certificate?.present
    && diagnostic.certificate?.active
    && diagnostic.certificate?.inValidity
    && diagnostic.nit?.companyMatchesConfigured
    && diagnostic.nit?.mountedCertificateMatchesConfigured
    && diagnostic.cryptoSelfTest?.valid
  const readyForRetry = diagnostic.overall === 'READY_FOR_SINGLE_RETRY'
  const signerOffline = diagnostic.overall === 'SIGNER_UNAVAILABLE' || !diagnostic.signerReachable
  const tone = healthyConfig ? styles.ok : signerOffline ? styles.warning : styles.danger
  const failureLabel = failureText(diagnostic.signerFailureKind)

  return (
    <section style={{ ...styles.card, ...tone }}>
      <div style={styles.head}>
        <div>
          <strong>Diagnóstico del firmador DTE</strong>
          <p style={styles.subtitle}>{healthyConfig ? 'Firmador, certificado y firma criptográfica verificados.' : signerOffline ? 'El servicio firmador no está disponible. El certificado todavía no ha sido declarado defectuoso.' : 'El firmador respondió, pero existe una inconsistencia que debe corregirse antes de enviar a MH.'}</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? 'Comprobando…' : 'Volver a comprobar'}</button>
      </div>
      <div style={styles.grid}>
        <Metric label="Servicio firmador" value={diagnostic.signerReachable ? 'EN LÍNEA' : 'NO DISPONIBLE'} good={diagnostic.signerReachable} pending={signerOffline} />
        <Metric label="Certificado montado" value={signerOffline ? 'PENDIENTE' : diagnostic.certificate?.present ? 'SÍ' : 'NO'} good={diagnostic.certificate?.present} pending={signerOffline} />
        <Metric label="Certificado activo" value={signerOffline ? 'PENDIENTE' : diagnostic.certificate?.active ? 'SÍ' : 'NO'} good={diagnostic.certificate?.active} pending={signerOffline} />
        <Metric label="Certificado vigente" value={signerOffline ? 'PENDIENTE' : diagnostic.certificate?.inValidity ? 'SÍ' : 'NO'} good={diagnostic.certificate?.inValidity} pending={signerOffline} />
        <Metric label="NIT empresa = configuración" value={diagnostic.nit?.companyMatchesConfigured ? 'COINCIDE' : 'NO COINCIDE'} good={diagnostic.nit?.companyMatchesConfigured} />
        <Metric label="NIT archivo = configuración" value={signerOffline ? 'PENDIENTE' : diagnostic.nit?.mountedCertificateMatchesConfigured ? 'COINCIDE' : 'NO COINCIDE'} good={diagnostic.nit?.mountedCertificateMatchesConfigured} pending={signerOffline} />
        <Metric label="Autoprueba JWS" value={signerOffline ? 'PENDIENTE' : diagnostic.cryptoSelfTest?.valid ? `${diagnostic.cryptoSelfTest.algorithm || 'RS512'} VÁLIDA` : 'FALLÓ'} good={diagnostic.cryptoSelfTest?.valid} pending={signerOffline} />
      </div>
      {diagnostic.certificate?.present && <p style={styles.detail}>Archivo detectado para NIT terminado en {String(diagnostic.certificate.mountedNit || '').slice(-4)} · huella técnica {diagnostic.certificate.fingerprint || '—'}… · {diagnostic.certificate.sizeBytes || 0} bytes. Vigencia: {formatDate(diagnostic.certificate.notBefore)} → {formatDate(diagnostic.certificate.notAfter)}.</p>}
      {signerOffline && <div style={styles.wait}><strong>FIRMADOR NO DISPONIBLE; ENVÍO BLOQUEADO.</strong> {failureLabel}{diagnostic.signerError ? ` ${diagnostic.signerError}` : ''} Se realizaron {diagnostic.probeAttempts || 1} sondeo(s). Esto no demuestra que el certificado o su contraseña sean incorrectos.</div>}
      {!signerOffline && !diagnostic.cryptoSelfTest?.valid && <div style={styles.stop}><strong>NO ENVIAR A MH.</strong> La autoverificación RS512 falló: {diagnostic.cryptoSelfTest?.reason || 'sin detalle'}.</div>}
      {readyForRetry && <div style={styles.ready}><strong>LISTO PARA UNA SOLA PRUEBA NUEVA.</strong> El rechazo 802 registrado pertenece a una firma anterior. El certificado actual está activo, vigente y el JWS generado por el firmador verifica matemáticamente con su clave pública.</div>}
      {diagnostic.overall === 'READY' && <div style={styles.ready}><strong>FIRMADOR VALIDADO.</strong> La firma RS512 del firmador coincide con la clave pública del certificado montado.</div>}
    </section>
  )
}

function failureText(kind) {
  if (kind === 'TIMEOUT') return 'Causa detectada: tiempo de espera agotado.'
  if (kind === 'NETWORK') return 'Causa detectada: no se pudo establecer conexión.'
  if (kind === 'AUTH') return 'Causa detectada: el firmador rechazó la credencial interna.'
  if (kind === 'HTTP') return 'Causa detectada: el firmador respondió con un error HTTP.'
  return 'Causa técnica todavía no determinada.'
}

function Metric({ label, value, good, pending = false }) {
  const color = pending ? '#92400e' : good ? '#166534' : '#991b1b'
  return <div style={styles.metric}><small>{label}</small><strong style={{ color }}>{value}</strong></div>
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-SV')
}

const styles = {
  card: { marginBottom: 16, padding: 16, border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff', color: '#1f2937' },
  ok: { borderColor: '#86efac', background: '#f0fdf4' },
  danger: { borderColor: '#fca5a5', background: '#fff7f7' },
  warning: { borderColor: '#fdba74', background: '#fff7ed' },
  head: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' },
  subtitle: { margin: '4px 0 0', color: '#64748b' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 14 },
  metric: { padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.8)', border: '1px solid #e5e7eb' },
  detail: { margin: '12px 0 0', fontSize: 13, color: '#64748b' },
  stop: { marginTop: 12, padding: 12, borderRadius: 10, background: '#fee2e2', color: '#7f1d1d', lineHeight: 1.45 },
  wait: { marginTop: 12, padding: 12, borderRadius: 10, background: '#fef3c7', color: '#78350f', lineHeight: 1.45 },
  ready: { marginTop: 12, padding: 12, borderRadius: 10, background: '#dcfce7', color: '#14532d', lineHeight: 1.45 },
}
