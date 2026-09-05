import { useEffect, useMemo, useState } from 'react'

const labelStatus=(value)=>({DRAFT:'Borrador',SIGNING:'Firmando',SIGNED:'Firmado',TRANSMITTING:'Enviando',PROCESSED:'Aceptado MH',REJECTED:'Rechazado MH',TRANSMISSION_UNKNOWN:'Transmisión por conciliar',INVALIDATED:'Invalidado'}[String(value||'').toUpperCase()]||String(value||'Sin estado'))
const dateTime=(value)=>value?new Date(value).toLocaleString('es-SV',{dateStyle:'short',timeStyle:'short'}):'—'
const short=(value,n=52)=>{const text=String(value||'');return text.length>n?`${text.slice(0,n)}…`:text||'—'}
const eventLabel=(value)=>({INVALIDATION:'Invalidación',CONTINGENCY:'Contingencia'}[String(value||'').toUpperCase()]||String(value||'Evento fiscal'))
const financialLabel=(value)=>({PERCEIVED:'Cobrado / percibido',RECEIVABLE:'Cuenta por cobrar',PENDING_CASH_ACCOUNT:'Pendiente cuenta de caja/banco',PENDING_CASH_SHIFT:'Pendiente apertura de caja',REVERSING:'Reversión en proceso',REVERSED:'Revertido'}[String(value||'').toUpperCase()]||String(value||'Sin contabilizar'))

export default function DteTraceabilityPanel({supabase,company,controlNumber}){
  const [document,setDocument]=useState(null)
  const [history,setHistory]=useState([])
  const [emails,setEmails]=useState([])
  const [events,setEvents]=useState([])
  const [reissue,setReissue]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  useEffect(()=>{
    let live=true
    if(!controlNumber||!company?.id){setDocument(null);setHistory([]);setEmails([]);setEvents([]);setReissue(null);return undefined}
    ;(async()=>{
      setLoading(true);setError('')
      const {data:doc,error:docError}=await supabase.from('dte_documents').select('id,company_id,dte_type,control_number,generation_code,environment,status,mh_receipt_seal,mh_processed_at,mh_message_code,mh_message,financial_state,financial_posted_at,financial_note,reissued_from_id,source_quote_id,source_work_order_id,created_at,updated_at').eq('company_id',company.id).eq('control_number',controlNumber).maybeSingle()
      if(docError){if(live){setError(docError.message);setLoading(false)};return}
      if(!doc){if(live){setDocument(null);setLoading(false)};return}
      const [historyResult,emailResult,eventResult,reissueResult]=await Promise.all([
        supabase.from('dte_status_history').select('id,from_status,to_status,source,detail,created_at').eq('company_id',company.id).eq('dte_document_id',doc.id).order('created_at',{ascending:false}).limit(30),
        supabase.from('invoice_email_deliveries').select('id,recipient_email,delivery_kind,status,provider_message_id,error_message,sent_at,created_at,updated_at').eq('company_id',company.id).eq('dte_document_id',doc.id).order('created_at',{ascending:false}).limit(10),
        supabase.from('dte_fiscal_events').select('id,event_type,status,environment,generation_code,mh_message,processed_at,created_at,updated_at').eq('company_id',company.id).eq('dte_document_id',doc.id).order('created_at',{ascending:false}).limit(20),
        doc.reissued_from_id?supabase.from('dte_documents').select('id,control_number,status,environment,created_at').eq('id',doc.reissued_from_id).maybeSingle():Promise.resolve({data:null,error:null}),
      ])
      const firstError=[historyResult,emailResult,eventResult,reissueResult].find(r=>r.error)?.error
      if(!live)return
      if(firstError)setError(firstError.message)
      setDocument(doc);setHistory(historyResult.data||[]);setEmails(emailResult.data||[]);setEvents(eventResult.data||[]);setReissue(reissueResult.data||null);setLoading(false)
    })()
    return()=>{live=false}
  },[controlNumber,company?.id,supabase])

  const emailState=useMemo(()=>emails[0]||null,[emails])
  if(!controlNumber)return <section className="billing-document-detail"><div className="billing-documents-empty"><strong>Seleccioná un DTE</strong><small>Al abrir “Ver detalle” aparecerán aquí Hacienda, finanzas, correo e historial fiscal.</small></div></section>
  if(loading)return <div className="billing-documents-state">Cargando trazabilidad completa del DTE…</div>
  if(error&&!document)return <div className="billing-documents-alert error">{error}</div>
  if(!document)return null

  return <section className="billing-document-detail" aria-label="Trazabilidad fiscal del DTE">
    <div className="billing-document-detail-head"><div><span>Trazabilidad fiscal y financiera</span><strong>{document.control_number}</strong><small>{document.generation_code}</small></div><span className={`billing-document-status ${String(document.status||'').toLowerCase()}`}>{labelStatus(document.status)}</span></div>
    {error&&<div className="billing-documents-alert error" style={{marginTop:12}}>{error}</div>}
    <div className="billing-document-detail-grid">
      <Info label="Sello MH" value={short(document.mh_receipt_seal,38)}/>
      <Info label="Procesado MH" value={document.mh_processed_at||'—'}/>
      <Info label="Mensaje MH" value={[document.mh_message_code,document.mh_message].filter(Boolean).join(' · ')||'Sin respuesta registrada'}/>
      <Info label="Estado financiero" value={financialLabel(document.financial_state)}/>
      <Info label="Contabilizado" value={dateTime(document.financial_posted_at)}/>
      <Info label="Origen comercial" value={document.source_work_order_id?'Orden de trabajo':document.source_quote_id?'Cotización':'Factura manual'}/>
      <Info label="Correo" value={emailState?`${String(emailState.status||'').toUpperCase()} · ${emailState.recipient_email||'sin destinatario'}`:'No enviado'}/>
      <Info label="Reemisión" value={reissue?`${reissue.control_number} · ${labelStatus(reissue.status)}`:document.reissued_from_id?'Documento origen no disponible':'No aplica'}/>
      <Info label="Ambiente" value={document.environment==='production'?'PRODUCCIÓN 01':'TEST 00'}/>
    </div>
    {document.financial_note&&<div className="billing-mh-response"><strong>Nota financiera</strong><p>{document.financial_note}</p></div>}

    <div className="billing-trace-grid" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12,marginTop:14}}>
      <TraceBlock title="Historial de estados" empty="Todavía no hay cambios de estado registrados.">
        {history.map(row=><div key={row.id} className="billing-trace-row" style={{padding:'9px 0',borderBottom:'1px solid #d5d8dc'}}><strong>{labelStatus(row.from_status)} → {labelStatus(row.to_status)}</strong><small style={{display:'block',marginTop:3,color:'#68707a'}}>{dateTime(row.created_at)} · {row.source||'sistema'}</small></div>)}
      </TraceBlock>
      <TraceBlock title="Eventos fiscales" empty="Sin invalidaciones ni contingencias para este DTE.">
        {events.map(row=><div key={row.id} className="billing-trace-row" style={{padding:'9px 0',borderBottom:'1px solid #d5d8dc'}}><strong>{eventLabel(row.event_type)} · {labelStatus(row.status)}</strong><small style={{display:'block',marginTop:3,color:'#68707a'}}>{dateTime(row.processed_at||row.updated_at||row.created_at)}{row.mh_message?` · ${row.mh_message}`:''}</small></div>)}
      </TraceBlock>
      <TraceBlock title="Entrega por correo" empty="Este documento todavía no tiene entregas de correo registradas.">
        {emails.map(row=><div key={row.id} className="billing-trace-row" style={{padding:'9px 0',borderBottom:'1px solid #d5d8dc'}}><strong>{String(row.status||'').toUpperCase()} · {row.delivery_kind||'entrega'}</strong><small style={{display:'block',marginTop:3,color:'#68707a'}}>{row.recipient_email||'Sin destinatario'} · {dateTime(row.sent_at||row.updated_at||row.created_at)}</small>{row.error_message&&<small style={{display:'block',marginTop:3,color:'#991b1b'}}>{row.error_message}</small>}</div>)}
      </TraceBlock>
      <TraceBlock title="Cadena documental" empty="Sin vínculos adicionales.">
        <div className="billing-trace-row" style={{padding:'9px 0'}}><strong>{reissue?'Reemisión vinculada':'Documento original'}</strong><small style={{display:'block',marginTop:3,color:'#68707a'}}>{reissue?`Origen ${reissue.control_number}`:'No proviene de otro DTE rechazado.'}</small><small style={{display:'block',marginTop:3,color:'#68707a'}}>{document.source_quote_id?'Cotización vinculada':''}{document.source_quote_id&&document.source_work_order_id?' · ':''}{document.source_work_order_id?'Orden de trabajo vinculada':''}</small></div>
      </TraceBlock>
    </div>
  </section>
}

function TraceBlock({title,empty,children}){const rows=Array.isArray(children)?children.filter(Boolean):children;const hasRows=Array.isArray(rows)?rows.length>0:Boolean(rows);return <div style={{padding:12,border:'1px solid #c6cbd0',borderRadius:8,background:'#fff'}}><strong style={{display:'block',marginBottom:7}}>{title}</strong>{hasRows?rows:<small style={{color:'#68707a'}}>{empty}</small>}</div>}
function Info({label,value}){return <div className="billing-document-info"><span>{label}</span><strong>{value||'—'}</strong></div>}
