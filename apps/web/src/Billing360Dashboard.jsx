import { useEffect, useMemo, useState } from 'react'
import { billingComplianceMetrics, inspectDte, mhEnvironmentLabel } from './billingCompliance.js'

const money=(value)=>`$${Number(value||0).toFixed(2)}`
const statusLabel={DRAFT:'Borrador',SIGNED:'Firmado',PROCESSED:'Procesado',REJECTED:'Rechazado',INVALIDATED:'Invalidado'}

export default function Billing360Dashboard({supabase,company,onOpenNewInvoice}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('ALL')
  const load=async()=>{setLoading(true);setError('');const {data,error:queryError}=await supabase.from('dte_documents').select('id,dte_type,status,environment,control_number,generation_code,created_at,dte_payload,mh_response,mh_receipt_seal,mh_message').eq('company_id',company.id).order('created_at',{ascending:false}).limit(300);if(queryError)setError(queryError.message);setRows(data||[]);setLoading(false)}
  useEffect(()=>{load()},[company.id])
  const stats=useMemo(()=>billingComplianceMetrics(rows),[rows])
  const visible=useMemo(()=>rows.filter(row=>{const c=inspectDte(row);if(filter==='CRITICAL')return c.issues.length>0;if(filter==='PROD')return c.environment==='01';if(filter==='TEST')return c.environment==='00';if(filter==='REJECTED')return row.status==='REJECTED';if(filter==='ACCEPTED')return c.accepted;return true}),[rows,filter])
  if(loading)return <section className="billing360"><p>Cargando centro de facturación…</p></section>
  return <section className="billing360">
    <div className="billing360-head"><div><p className="form-kicker">FACTURACIÓN 360 · CONTROL MH</p><h2>Centro de control fiscal</h2><p>Supervisa identidad DTE, ambiente, respuesta de Hacienda, sello de recepción y coherencia del documento sin alterar las conexiones MH existentes.</p></div><div className="billing360-head-actions"><button type="button" onClick={onOpenNewInvoice}>+ Nueva factura</button><button type="button" className="secondary-button" onClick={load}>Actualizar</button></div></div>
    {error&&<p className="feedback error">{error}</p>}
    <div className="billing360-kpis"><Kpi label="DTE registrados" value={stats.total}/><Kpi label="Aceptados con sello" value={stats.accepted}/><Kpi label="Rechazados" value={stats.rejected}/><Kpi label="Pruebas" value={stats.test}/><Kpi label="Producción" value={stats.production}/><Kpi label="Alertas críticas" value={stats.critical}/><Kpi label="Con sello MH" value={stats.withSeal}/><Kpi label="Facturación aceptada" value={money(stats.amountAccepted)}/></div>
    <div className="dte-note"><strong>Regla fiscal:</strong> IDEALO SV no considera un documento fiscalmente aceptado solo porque esté generado o firmado. Para el tablero, un DTE aceptado debe estar <strong>PROCESSED</strong> y conservar su <strong>sello de recepción MH</strong>. Los documentos aceptados se consideran inmutables.</div>
    <div className="form-actions" style={{justifyContent:'flex-start',flexWrap:'wrap'}}>{[['ALL','Todos'],['CRITICAL','Alertas'],['ACCEPTED','Aceptados'],['REJECTED','Rechazados'],['TEST','TEST'],['PROD','PRODUCCIÓN']].map(([key,label])=><button type="button" key={key} className={filter===key?'':'secondary-button'} onClick={()=>setFilter(key)}>{label}</button>)}</div>
    <div className="billing360-table-wrap"><table className="billing360-table"><thead><tr><th>Fecha</th><th>Tipo / ambiente</th><th>Identidad DTE</th><th>Estado</th><th>MH</th><th>Cumplimiento</th><th>Total</th></tr></thead><tbody>
      {visible.slice(0,50).map(row=>{const check=inspectDte(row);return <tr key={row.id}><td>{row.created_at?new Date(row.created_at).toLocaleString('es-SV'):'—'}</td><td><strong>DTE-{check.type||'—'}</strong><small>{mhEnvironmentLabel(check.environment)}</small></td><td><strong>{row.control_number||'Pendiente'}</strong><small>{check.generation||'Sin código de generación'}</small></td><td><span className={`billing-status ${String(row.status||'').toLowerCase()}`}>{statusLabel[row.status]||row.status||'—'}</span><small>{check.immutable?'Documento fiscal protegido':'Editable según estado'}</small></td><td>{row.mh_message||row.mh_response?.descripcionMsg||(row.mh_receipt_seal?'Sello recibido':'Sin confirmación MH')}<small>{row.mh_receipt_seal?`Sello: ${row.mh_receipt_seal}`:''}</small></td><td>{check.issues.length?<><strong>⚠ {check.issues.length} alerta(s)</strong><small>{check.issues[0]}</small></>:check.warnings.length?<><strong>Revisar</strong><small>{check.warnings[0]}</small></>:<><strong>Consistente</strong><small>{check.accepted?'Aceptado con evidencia MH':'Sin inconsistencias locales'}</small></>}</td><td>{money(check.total)}</td></tr>})}
      {!visible.length&&<tr><td colSpan="7">No hay DTE para este filtro.</td></tr>}
    </tbody></table></div>
  </section>
}
function Kpi({label,value}){return <article className="billing360-kpi"><small>{label}</small><strong>{value}</strong></article>}
