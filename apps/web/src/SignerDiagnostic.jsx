import { useEffect, useState } from 'react'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function SignerDiagnostic({ session, company }) {
  const [diagnostic, setDiagnostic] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/dte/signer-diagnostic?companyId=${encodeURIComponent(company.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `Diagnóstico HTTP ${response.status}`)
      setDiagnostic(payload)
    } catch (cause) {
      setError(cause.message === 'Failed to fetch'
        ? 'No se pudo consultar el diagnóstico. Espera a que API y firmador terminen de desplegar en Render.'
        : cause.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [company.id])

  if (error) {
    return <section style={{ ...styles.card, ...styles.warning }}><strong>Diagnóstico de firma pendiente</strong><p>{error}</p><button type="button" onClick={load}>Reintentar diagnóstico</button></section>
  }

  if (!diagnostic) {
    return <section style={styles.card}><strong>Diagnóstico del firmador</strong><p>{loading ? 'Comprobando firmador y certificado…' : 'Sin diagnóstico todavía.'}</p></section>
  }

  const healthyConfig = diagnostic.signerReachable && diagnostic.certificate?.present && diagnostic.nit?.companyMatchesConfigured && diagnostic.nit?.mountedCertificateMatchesConfigured
  const rejected802 = diagnostic.overall === 'MH_SIGNATURE_REJECTED'
  const tone = !healthyConfig || rejected802 ? styles.danger : styles.ok

  return (
    <section style={{ ...styles.card, ...tone }}>
      <div style={styles.head}>
        <div>
          <strong>Diagnóstico del firmador DTE</strong>
          <p style={styles.subtitle}>{healthyConfig ? 'Firmador y archivo de certificado detectados.' : 'Hay una inconsistencia en la configuración del firmador.'}</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? 'Comprobando…' : 'Volver a comprobar'}</button>
      </div>
      <div style={styles.grid}>
        <Metric label="Servicio firmador" value={diagnostic.signerReachable ? 'EN LÍNEA' : 'SIN CONEXIÓN'} good={diagnostic.signerReachable} />
        <Metric label="Certificado montado" value={diagnostic.certificate?.present ? 'SÍ' : 'NO'} good={diagnostic.certificate?.present} />
        <Metric label="NIT empresa = configuración" value={diagnostic.nit?.companyMatchesConfigured ? 'COINCIDE' : 'NO COINCIDE'} good={diagnostic.nit?.companyMatchesConfigured} />
        <Metric label="NIT archivo = configuración" value={diagnostic.nit?.mountedCertificateMatchesConfigured ? 'COINCIDE' : 'NO COINCIDE'} good={diagnostic.nit?.mountedCertificateMatchesConfigured} />
      </div>
      {diagnostic.certificate?.present && <p style={styles.detail}>Archivo detectado para NIT terminado en {String(diagnostic.certificate.mountedNit || '').slice(-4)} · huella técnica {diagnostic.certificate.fingerprint || '—'}… · {diagnostic.certificate.sizeBytes || 0} bytes.</p>}
      {rejected802 && <div style={styles.stop}><strong>NO ENVIAR MÁS PRUEBAS TODAVÍA.</strong> MH rechazó la última firma con código 802: “{diagnostic.lastMhRejection?.description || 'Firma no válida'}”. Que el archivo y el NIT coincidan no demuestra que MH tenga ese certificado habilitado para TEST; debemos revisar el certificado cargado en Render antes del próximo envío.</div>}
    </section>
  )
}

function Metric({ label, value, good }) {
  return <div style={styles.metric}><small>{label}</small><strong style={{ color: good ? '#166534' : '#991b1b' }}>{value}</strong></div>
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
}
