import { useEffect, useMemo, useState } from 'react'

const money = (value) => `$${Number(value || 0).toFixed(2)}`
const statusLabel = { DRAFT: 'Borrador', SIGNED: 'Firmado', PROCESSED: 'Procesado', REJECTED: 'Rechazado', INVALIDATED: 'Invalidado' }

export default function Billing360Dashboard({ supabase, company }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.from('dte_documents')
      .select('id,dte_type,status,environment,control_number,generation_code,created_at,dte_payload,mh_response,mh_receipt_seal,mh_message')
      .eq('company_id', company.id).order('created_at', { ascending: false }).limit(200)
    if (queryError) setError(queryError.message)
    setRows(data || []); setLoading(false)
  }

  useEffect(() => { load() }, [company.id])

  const stats = useMemo(() => {
    const result = { total: rows.length, processed: 0, draft: 0, rejected: 0, amount: 0, today: 0 }
    const today = new Date().toISOString().slice(0, 10)
    rows.forEach((row) => {
      if (row.status === 'PROCESSED') result.processed += 1
      if (row.status === 'DRAFT') result.draft += 1
      if (row.status === 'REJECTED') result.rejected += 1
      if (String(row.created_at || '').slice(0, 10) === today) result.today += 1
      if (row.status === 'PROCESSED') result.amount += Number(row.dte_payload?.resumen?.totalPagar ?? row.dte_payload?.resumen?.montoTotalOperacion ?? 0)
    })
    return result
  }, [rows])

  if (loading) return <section className="billing360"><p>Cargando centro de facturación…</p></section>

  return <section className="billing360">
    <div className="billing360-head"><div><p className="form-kicker">FACTURACIÓN 360</p><h2>Centro de control fiscal</h2><p>Estado operativo de documentos electrónicos, recepción MH y facturación acumulada.</p></div><button type="button" className="secondary-button" onClick={load}>Actualizar</button></div>
    {error && <p className="feedback error">{error}</p>}
    <div className="billing360-kpis">
      <Kpi label="DTE registrados" value={stats.total}/><Kpi label="Procesados MH" value={stats.processed}/><Kpi label="Borradores" value={stats.draft}/><Kpi label="Rechazados" value={stats.rejected}/><Kpi label="Emitidos hoy" value={stats.today}/><Kpi label="Facturación procesada" value={money(stats.amount)}/>
    </div>
    <div className="billing360-table-wrap"><table className="billing360-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Número de control</th><th>Estado</th><th>MH</th><th>Total</th></tr></thead><tbody>
      {rows.slice(0, 20).map((row) => <tr key={row.id}><td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td><td>DTE-{row.dte_type || '—'}</td><td><strong>{row.control_number || 'Pendiente'}</strong><small>{row.generation_code || ''}</small></td><td><span className={`billing-status ${String(row.status || '').toLowerCase()}`}>{statusLabel[row.status] || row.status || '—'}</span></td><td>{row.mh_message || row.mh_response?.descripcionMsg || (row.mh_receipt_seal ? 'Recibido' : '—')}</td><td>{money(row.dte_payload?.resumen?.totalPagar ?? row.dte_payload?.resumen?.montoTotalOperacion)}</td></tr>)}
      {!rows.length && <tr><td colSpan="6">Todavía no hay DTE registrados.</td></tr>}
    </tbody></table></div>
  </section>
}

function Kpi({ label, value }) { return <article className="billing360-kpi"><small>{label}</small><strong>{value}</strong></article> }
