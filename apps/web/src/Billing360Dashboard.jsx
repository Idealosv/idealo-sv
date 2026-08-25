import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { billingComplianceMetrics, inspectDte, mhEnvironmentLabel } from './billingCompliance.js'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const mhConsultUrl='https://portaldgii.mh.gob.sv/ssc/consulta/fe'
const money=(value)=>`$${Number(value||0).toFixed(2)}`
const safe=(value)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))
const statusLabel={DRAFT:'Borrador',SIGNING:'Firmando',SIGNED:'Firmado',TRANSMITTING:'Transmitiendo',PROCESSED:'Procesado',REJECTED:'Rechazado',INVALIDATED:'Invalidado'}

function mhBody(row){return row.mh_response?.body||row.mh_response||{}}
function receiptSeal(row){const mh=mhBody(row);return row.mh_receipt_seal||mh.selloRecibido||mh.sello||''}
function isAccepted(row){return row.status==='PROCESSED'&&Boolean(receiptSeal(row))}
function downloadEvidence(row){
  if(!isAccepted(row))return
  const evidence={
    schema:'IDEALO-SV-DTE-EVIDENCE-1',
    exportedAt:new Date().toISOString(),
    fiscalState:'PROCESSED',
    environment:row.environment,
    dteType:row.dte_type,
    controlNumber:row.control_number,
    generationCode:String(row.generation_code||'').toUpperCase(),
    mhReceiptSeal:receiptSeal(row),
    mhProcessedAt:row.mh_processed_at||mhBody(row).fhProcesamiento||null,
    dte:row.dte_payload,
    signedDocument:row.signed_document||null,
    mhResponse:row.mh_response||null,
  }
  const blob=new Blob([JSON.stringify(evidence,null,2)],{type:'application/json;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url
  link.download=`${String(row.generation_code||row.control_number||'DTE').toUpperCase()}.json`
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)
}

async function openReadableVersion(row,company){
  if(!isAccepted(row))return
  const payload=row.dte_payload||{},id=payload.identificacion||{},emisor=payload.emisor||{},receptor=payload.receptor||{},resumen=payload.resumen||{},mh=mhBody(row)
  const qr=await QRCode.toDataURL(mhConsultUrl,{errorCorrectionLevel:'M',margin:1,width:190})
  const items=Array.isArray(payload.cuerpoDocumento)?payload.cuerpoDocumento:[]
  const itemRows=items.map(item=>{const total=Number(item.ventaGravada||0)+Number(item.ventaExenta||0)+Number(item.ventaNoSuj||0);return `<tr><td>${safe(item.numItem)}</td><td>${safe(item.descripcion)}</td><td class="num">${safe(item.cantidad)}</td><td class="num">${money(item.precioUni)}</td><td class="num">${money(total)}</td></tr>`}).join('')
  const popup=window.open('','_blank','width=980,height=900')
  if(!popup)return
  const dteName=row.dte_type==='03'?'Comprobante de Crédito Fiscal DTE-03':'Factura Consumidor Final DTE-01'
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(row.control_number)}</title><style>
  @page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:11px}.sheet{max-width:820px;margin:auto}.head{display:flex;justify-content:space-between;gap:18px;border-bottom:3px solid #111827;padding-bottom:12px}.brand{font-size:22px;font-weight:800}.accepted{font-weight:800;border:1px solid #166534;padding:7px 10px;border-radius:8px}.meta,.parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.box{border:1px solid #cbd5e1;border-radius:8px;padding:10px}.label{color:#64748b}.value{font-weight:700;word-break:break-word}.fiscal{display:grid;grid-template-columns:1fr 205px;gap:14px;margin-top:12px}.qr{text-align:center;border:1px solid #cbd5e1;border-radius:8px;padding:7px}.qr img{width:150px;height:150px}.qr small{display:block;color:#64748b}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border-bottom:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}.num{text-align:right}.totals{width:320px;margin:14px 0 0 auto}.r{display:flex;justify-content:space-between;padding:4px 0}.grand{border-top:2px solid #111827;font-size:14px;font-weight:800;padding-top:7px}.mh{margin-top:14px;border:1px solid #86a789;background:#f0fdf4;border-radius:8px;padding:10px}.seal{font-family:monospace;word-break:break-all}.foot{margin-top:14px;color:#64748b;font-size:9px}.actions{text-align:right;margin-top:14px}@media print{.actions{display:none}}
  </style></head><body><div class="sheet">
  <div class="head"><div><div class="brand">IDEALO SV</div><div>${safe(dteName)}</div></div><div class="accepted">ACEPTADO MH</div></div>
  <div class="fiscal"><div class="box"><div><span class="label">Código de generación</span><div class="value">${safe(String(row.generation_code||id.codigoGeneracion||'').toUpperCase())}</div></div><br><div><span class="label">Número de control</span><div class="value">${safe(row.control_number||id.numeroControl)}</div></div><br><div><span class="label">Sello de recepción</span><div class="value seal">${safe(receiptSeal(row))}</div></div><br><div><span class="label">Modelo / transmisión</span><div class="value">${safe(id.tipoModelo)} / ${safe(id.tipoOperacion)}</div></div><div><span class="label">Fecha y hora</span><div class="value">${safe(id.fecEmi)} ${safe(id.horEmi)}</div></div></div>
  <div class="qr"><img src="${qr}" alt="QR consulta DTE"><strong>Consultar DTE en MH</strong><small>La consulta oficial solicita los datos del documento y validación CAPTCHA.</small></div></div>
  <div class="parties"><div class="box"><strong>EMISOR</strong><p><span class="value">${safe(emisor.nombre||company.name)}</span><br>NIT ${safe(emisor.nit||company.nit)} · NRC ${safe(emisor.nrc||company.nrc)}<br>${safe(emisor.descActividad||company.business_activity||'')}<br>${safe(emisor.direccion?.complemento||company.address||'')}</p></div><div class="box"><strong>RECEPTOR</strong><p><span class="value">${safe(receptor.nombre||'Consumidor final')}</span><br>${safe(receptor.numDocumento||receptor.nit||'')} ${safe(receptor.nrc||'')}<br>${safe(receptor.direccion?.complemento||'')}<br>${safe(receptor.correo||'')}</p></div></div>
  <table><thead><tr><th>#</th><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
  <div class="totals"><div class="r"><span>Gravadas</span><strong>${money(resumen.totalGravada)}</strong></div><div class="r"><span>Exentas</span><strong>${money(resumen.totalExenta)}</strong></div><div class="r"><span>No sujetas</span><strong>${money(resumen.totalNoSuj)}</strong></div>${row.dte_type==='03'?`<div class="r"><span>IVA</span><strong>${money((resumen.tributos||[]).reduce((s,t)=>s+Number(t.valor||0),0))}</strong></div>`:`<div class="r"><span>IVA incluido</span><strong>${money(resumen.totalIva)}</strong></div>`}<div class="r grand"><span>Total</span><strong>${money(resumen.totalPagar??resumen.montoTotalOperacion)}</strong></div></div>
  <div class="mh"><strong>Ministerio de Hacienda · evidencia de recepción</strong><p>Estado: <b>${safe(mh.estado||'PROCESADO')}</b> · Procesado: ${safe(row.mh_processed_at||mh.fhProcesamiento||'—')}<br>Mensaje: ${safe(row.mh_message||mh.descripcionMsg||mh.mensaje||'—')}<br>Sello: <span class="seal">${safe(receiptSeal(row))}</span></p></div>
  <div class="foot">Versión legible generada a partir del DTE almacenado, el documento firmado y la evidencia de recepción de Hacienda. El código QR enlaza a la consulta oficial de documentos electrónicos del Ministerio de Hacienda.</div>
  <div class="actions"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  </div></body></html>`)
  popup.document.close()
}

export default function Billing360Dashboard({supabase,company,onOpenNewInvoice}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('ALL')
  const [actionId,setActionId]=useState(''),[actionMessage,setActionMessage]=useState('')
  const load=async()=>{setLoading(true);setError('');const {data,error:queryError}=await supabase.from('dte_documents').select('id,dte_type,status,environment,control_number,generation_code,created_at,dte_payload,signed_document,mh_response,mh_receipt_seal,mh_processed_at,mh_message_code,mh_message').eq('company_id',company.id).order('created_at',{ascending:false}).limit(300);if(queryError)setError(queryError.message);setRows(data||[]);setLoading(false)}
  useEffect(()=>{load()},[company.id])
  const stats=useMemo(()=>billingComplianceMetrics(rows),[rows])
  const visible=useMemo(()=>rows.filter(row=>{const c=inspectDte(row);if(filter==='CRITICAL')return c.issues.length>0;if(filter==='PROD')return c.environment==='01';if(filter==='TEST')return c.environment==='00';if(filter==='REJECTED')return row.status==='REJECTED';if(filter==='ACCEPTED')return c.accepted;return true}),[rows,filter])
  const controlled=rows.find(row=>inspectDte(row).environment==='00'&&!['PROCESSED','REJECTED','INVALIDATED'].includes(row.status))

  const apiAction=async(path,documentId)=>{const {data}=await supabase.auth.getSession();const token=data.session?.access_token;if(!token)throw new Error('La sesión venció. Volvé a iniciar sesión.');const response=await fetch(`${apiUrl}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({documentId})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||`La operación respondió HTTP ${response.status}.`);return payload}
  const signControlled=async(row)=>{if(actionId)return;setActionId(row.id);setActionMessage('Comprobando firmador antes de firmar…');try{const {data}=await supabase.auth.getSession();const token=data.session?.access_token;const diagnosticResponse=await fetch(`${apiUrl}/api/dte/signer-diagnostic?companyId=${encodeURIComponent(company.id)}`,{headers:{Authorization:`Bearer ${token}`}});const diagnostic=await diagnosticResponse.json().catch(()=>({}));if(!diagnosticResponse.ok)throw new Error(diagnostic.message||'No se pudo validar el firmador.');if(!['READY','READY_FOR_SINGLE_RETRY'].includes(diagnostic.overall)||!diagnostic.cryptoSelfTest?.valid)throw new Error('El firmador no está validado. Abrí Hacienda y comprobá certificado/RS512 antes de firmar.');setActionMessage('Firmando DTE en TEST…');const result=await apiAction('/api/dte/sign-test',row.id);setActionMessage(`✓ ${result.control_number} firmado con JWS. Todavía no se ha enviado a Hacienda.`);await load()}catch(cause){setActionMessage(`No se firmó: ${cause.message}`)}finally{setActionId('')}}
  const transmitControlled=async(row)=>{if(actionId)return;const confirmed=window.confirm(`PRUEBA CONTROLADA MH TEST\n\nSe enviará UNA VEZ ${row.control_number} al ambiente 00 de Hacienda. Producción permanece bloqueada.\n\n¿Continuar?`);if(!confirmed)return;setActionId(row.id);setActionMessage('Transmitiendo una sola vez a Hacienda TEST…');try{const result=await apiAction('/api/dte/transmit-test',row.id);if(result.status==='PROCESSED')setActionMessage(`✓ PROCESADO por Hacienda TEST: ${result.control_number}. Revisá el sello de recepción en el tablero.`);else setActionMessage(`Hacienda respondió ${result.status}. No se hará reenvío automático; revisá el mensaje guardado.`);await load()}catch(cause){setActionMessage(`Transmisión detenida: ${cause.message}`);await load()}finally{setActionId('')}}

  if(loading)return <section className="billing360"><p>Cargando centro de facturación…</p></section>
  return <section className="billing360">
    <div className="billing360-head"><div><p className="form-kicker">FACTURACIÓN 360 · CONTROL MH</p><h2>Centro de control fiscal</h2><p>Supervisa identidad DTE, ambiente, respuesta de Hacienda, sello de recepción y coherencia del documento.</p></div><div className="billing360-head-actions"><button type="button" onClick={onOpenNewInvoice}>+ Nueva factura</button><button type="button" className="secondary-button" onClick={load}>Actualizar</button></div></div>
    {error&&<p className="feedback error">{error}</p>}{actionMessage&&<p className="feedback success" role="status">{actionMessage}</p>}
    <div className="billing360-kpis"><Kpi label="DTE registrados" value={stats.total}/><Kpi label="Aceptados con sello" value={stats.accepted}/><Kpi label="Rechazados" value={stats.rejected}/><Kpi label="Pruebas" value={stats.test}/><Kpi label="Producción" value={stats.production}/><Kpi label="Alertas críticas" value={stats.critical}/><Kpi label="Con sello MH" value={stats.withSeal}/><Kpi label="Facturación aceptada" value={money(stats.amountAccepted)}/></div>
    <div className="dte-note"><strong>Hardening preproducción:</strong> los DTE aceptados quedan tratados como inmutables; su versión legible incluye QR hacia la consulta oficial de MH y puede descargarse un paquete JSON con DTE, JWS, respuesta y sello. Los rechazados no se reenvían automáticamente. <strong>Producción permanece bloqueada.</strong></div>
    <div className="form-actions" style={{justifyContent:'flex-start',flexWrap:'wrap'}}>{[['ALL','Todos'],['CRITICAL','Alertas'],['ACCEPTED','Aceptados'],['REJECTED','Rechazados'],['TEST','TEST'],['PROD','PRODUCCIÓN']].map(([key,label])=><button type="button" key={key} className={filter===key?'':'secondary-button'} onClick={()=>setFilter(key)}>{label}</button>)}</div>
    <div className="billing360-table-wrap"><table className="billing360-table"><thead><tr><th>Fecha</th><th>Tipo / ambiente</th><th>Identidad DTE</th><th>Estado</th><th>MH</th><th>Cumplimiento</th><th>Total</th><th>Control</th></tr></thead><tbody>
      {visible.slice(0,50).map(row=>{const check=inspectDte(row);const isControlled=controlled?.id===row.id;const accepted=isAccepted(row);return <tr key={row.id}><td>{row.created_at?new Date(row.created_at).toLocaleString('es-SV'):'—'}</td><td><strong>DTE-{check.type||'—'}</strong><small>{mhEnvironmentLabel(check.environment)}</small></td><td><strong>{row.control_number||'Pendiente'}</strong><small>{check.generation||'Sin código de generación'}</small></td><td><span className={`billing-status ${String(row.status||'').toLowerCase()}`}>{statusLabel[row.status]||row.status||'—'}</span><small>{check.immutable?'Documento fiscal protegido':'Editable según estado'}</small></td><td>{row.mh_message||row.mh_response?.descripcionMsg||(row.mh_receipt_seal?'Sello recibido':'Sin confirmación MH')}<small>{row.mh_receipt_seal?`Sello: ${row.mh_receipt_seal}`:''}</small></td><td>{check.issues.length?<><strong>⚠ {check.issues.length} alerta(s)</strong><small>{check.issues[0]}</small></>:check.warnings.length?<><strong>Revisar</strong><small>{check.warnings[0]}</small></>:<><strong>Consistente</strong><small>{check.accepted?'Aceptado con evidencia MH':'Sin inconsistencias locales'}</small></>}</td><td>{money(check.total)}</td><td>{accepted?<div className="form-actions" style={{gap:6,flexWrap:'wrap'}}><button type="button" className="secondary-button" onClick={()=>openReadableVersion(row,company)}>Versión legible + QR</button><button type="button" className="secondary-button" onClick={()=>downloadEvidence(row)}>Evidencia JSON</button></div>:isControlled&&row.status==='DRAFT'?<button type="button" onClick={()=>signControlled(row)} disabled={Boolean(actionId)}>Validar y firmar TEST</button>:isControlled&&row.status==='SIGNED'?<button type="button" onClick={()=>transmitControlled(row)} disabled={Boolean(actionId)}>Enviar 1 vez a MH TEST</button>:row.status==='PROCESSED'?<strong>✓ Finalizado</strong>:<small>{isControlled?'Esperando estado':'—'}</small>}</td></tr>})}
      {!visible.length&&<tr><td colSpan="8">No hay DTE para este filtro.</td></tr>}
    </tbody></table></div>
  </section>
}
function Kpi({label,value}){return <article className="billing360-kpi"><small>{label}</small><strong>{value}</strong></article>}
