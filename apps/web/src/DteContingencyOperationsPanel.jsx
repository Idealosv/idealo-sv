import { useEffect, useMemo, useState } from 'react'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const dateTimeLocal=()=>{const d=new Date(),pad=v=>String(v).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
const CONTINGENCY_TYPES=[['1','No disponibilidad del sistema de MH'],['2','No disponibilidad del sistema del emisor'],['3','Falla en suministro de energía eléctrica'],['4','Falla de conexión a Internet'],['5','Otro']]
const DOC_TYPES=[['13','DUI'],['36','NIT'],['37','Otro']]
const statusLabel=value=>({DRAFT:'Borrador',SIGNED:'Firmado',PROCESSED:'Aceptado MH',REJECTED:'Rechazado MH',TRANSMISSION_UNKNOWN:'Resultado incierto',SUBMITTED:'Enviado',RECONCILED:'Conciliado',RECONCILED_WITH_REJECTIONS:'Conciliado con rechazos'}[String(value||'').toUpperCase()]||String(value||'—'))

async function apiRequest(path,session,{method='POST',body}={}){
  const response=await fetch(`${apiUrl}${path}`,{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.message||`La API respondió HTTP ${response.status}.`)
  return payload
}

export default function DteContingencyOperationsPanel({supabase,company,session}){
  const [documents,setDocuments]=useState([]),[events,setEvents]=useState([]),[batches,setBatches]=useState([])
  const [selected,setSelected]=useState([]),[selectedEventId,setSelectedEventId]=useState('')
  const [startAt,setStartAt]=useState(dateTimeLocal()),[endAt,setEndAt]=useState(dateTimeLocal())
  const [tipo,setTipo]=useState('2'),[motivo,setMotivo]=useState('')
  const [responsable,setResponsable]=useState({name:'',documentType:'13',documentNumber:''})
  const [busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('')

  const load=async()=>{
    setError('')
    const [docsResult,eventsResult,batchesResult]=await Promise.all([
      supabase.from('dte_documents').select('id,dte_type,control_number,generation_code,environment,status,dte_payload,signed_document,created_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(500),
      supabase.from('dte_fiscal_events').select('id,event_type,environment,status,payload,mh_message,processed_at,created_at').eq('company_id',company.id).eq('event_type','CONTINGENCY').order('created_at',{ascending:false}).limit(100),
      supabase.from('dte_contingency_batches').select('id,event_id,batch_number,status,codigo_lote,error_message,submitted_at,reconciled_at,created_at').eq('company_id',company.id).order('created_at',{ascending:false}).limit(500),
    ])
    const first=[docsResult,eventsResult,batchesResult].find(x=>x.error)?.error
    if(first){setError(first.message);return}
    const eligible=(docsResult.data||[]).filter(d=>d.signed_document&&Number(d.dte_payload?.identificacion?.tipoModelo)===2&&Number(d.dte_payload?.identificacion?.tipoOperacion)===2&&d.dte_payload?.identificacion?.tipoContingencia)
    setDocuments(eligible);setEvents(eventsResult.data||[]);setBatches(batchesResult.data||[])
    setSelected(current=>current.filter(id=>eligible.some(d=>d.id===id)))
    if(!selectedEventId&&eventsResult.data?.[0]?.id)setSelectedEventId(eventsResult.data[0].id)
  }
  useEffect(()=>{load()},[company.id])

  const selectedDocs=useMemo(()=>documents.filter(d=>selected.includes(d.id)),[documents,selected])
  const selectedEnvironment=selectedDocs[0]?.environment||''
  const mixedEnvironment=selectedDocs.some(d=>d.environment!==selectedEnvironment)
  const selectedEvent=events.find(e=>e.id===selectedEventId)||null
  const eventBatches=batches.filter(b=>b.event_id===selectedEventId).sort((a,b)=>a.batch_number-b.batch_number)

  const toggle=id=>setSelected(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])
  const report=async()=>{
    if(selectedDocs.length<2){setError('Seleccioná al menos 2 DTE firmados en contingencia para poder completar también la recepción por lotes.');return}
    if(mixedEnvironment){setError('Todos los DTE seleccionados deben pertenecer al mismo ambiente.');return}
    if(!motivo.trim()||!responsable.name.trim()||!responsable.documentNumber.trim()){setError('Completá motivo y datos del responsable.');return}
    setBusy('report');setError('');setMessage('')
    try{
      const result=await apiRequest('/api/dte/contingency-event',session,{body:{companyId:company.id,documentIds:selectedDocs.map(d=>d.id),startAt,endAt,tipoContingencia:Number(tipo),motivoContingencia:motivo.trim(),responsable:{...responsable,documentNumber:responsable.documentNumber.trim()},confirmation:`REPORTAR CONTINGENCIA ${selectedDocs.length} DTE`}})
      setMessage(`Evento de contingencia ${statusLabel(result.status)}. ${result.documentsReported||selectedDocs.length} DTE reportados.`)
      if(result.eventId)setSelectedEventId(result.eventId)
      await load()
    }catch(e){setError(e.message)}finally{setBusy('')}
  }
  const transmit=async()=>{
    if(!selectedEventId)return
    const event=events.find(e=>e.id===selectedEventId)
    const count=Array.isArray(event?.payload?.detalleDTE)?event.payload.detalleDTE.length:0
    if(count<2){setError('El evento debe contener al menos 2 DTE para recepción por lotes.');return}
    setBusy('transmit');setError('');setMessage('')
    try{const result=await apiRequest('/api/dte/contingency-batches/transmit',session,{body:{eventId:selectedEventId,confirmation:`TRANSMITIR LOTES CONTINGENCIA ${count} DTE`}});setMessage(`${result.batches?.length||0} lote(s) enviados. Hacienda debe procesarlos antes de la conciliación.`);await load()}catch(e){setError(e.message)}finally{setBusy('')}
  }
  const reconcile=async()=>{
    if(!selectedEventId)return
    setBusy('reconcile');setError('');setMessage('')
    try{const result=await apiRequest(`/api/dte/contingency-batches/reconcile?eventId=${encodeURIComponent(selectedEventId)}`,session,{method:'GET'});setMessage(result.complete?'Conciliación completada. Los estados de los DTE fueron actualizados.':'Hacienda todavía tiene lotes pendientes de procesamiento.');await load()}catch(e){setError(e.message)}finally{setBusy('')}
  }

  return <section className="billing-document-detail" aria-label="Operación de contingencia DTE">
    <div className="billing-document-detail-head"><div><span>Contingencia DTE</span><strong>Reportar · transmitir lotes · conciliar</strong><small>Flujo operativo completo desde los DTE firmados en modelo 2.</small></div><span className="billing-document-status signed">{documents.length} elegibles</span></div>
    {error&&<div className="billing-documents-alert error" style={{marginTop:12}}>{error}</div>}
    {message&&<div className="billing-documents-alert success" style={{marginTop:12}}>{message}</div>}

    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.3fr) minmax(320px,.7fr)',gap:14,marginTop:14}}>
      <div style={{border:'1px solid #c6cbd0',borderRadius:8,background:'#fff',overflow:'hidden'}}>
        <div style={{padding:12,borderBottom:'1px solid #d5d8dc'}}><strong>DTE firmados en contingencia</strong><small style={{display:'block',color:'#68707a',marginTop:3}}>Seleccioná los documentos que formarán un mismo evento. Para lotes MH se requieren al menos 2.</small></div>
        {!documents.length?<div className="billing-documents-empty"><strong>No hay DTE firmados en contingencia.</strong><small>Primero prepará un borrador como contingencia y firmalo.</small></div>:documents.map(doc=><label key={doc.id} style={{display:'grid',gridTemplateColumns:'28px 1fr auto',gap:10,alignItems:'center',padding:'10px 12px',borderBottom:'1px solid #eef0f2',cursor:'pointer'}}><input type="checkbox" checked={selected.includes(doc.id)} onChange={()=>toggle(doc.id)}/><span><strong style={{display:'block'}}>{doc.control_number}</strong><small style={{color:'#68707a'}}>{doc.dte_type==='03'?'DTE-03':'DTE-01'} · {doc.environment==='production'?'PRODUCCIÓN 01':'TEST 00'} · contingencia {doc.dte_payload?.identificacion?.tipoContingencia}</small></span><span className="billing-document-status signed">{statusLabel(doc.status)}</span></label>)}
      </div>

      <div style={{display:'grid',gap:10,alignContent:'start'}}>
        <label className="field"><span>Inicio de contingencia</span><input type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/></label>
        <label className="field"><span>Fin de contingencia</span><input type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)}/></label>
        <label className="field"><span>Tipo</span><select value={tipo} onChange={e=>setTipo(e.target.value)}>{CONTINGENCY_TYPES.map(([v,l])=><option key={v} value={v}>{v} · {l}</option>)}</select></label>
        <label className="field"><span>Motivo</span><textarea rows="2" value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Describí la causa de la contingencia"/></label>
        <label className="field"><span>Responsable</span><input value={responsable.name} onChange={e=>setResponsable({...responsable,name:e.target.value})} placeholder="Nombre completo"/></label>
        <div style={{display:'grid',gridTemplateColumns:'110px 1fr',gap:8}}><label className="field"><span>Documento</span><select value={responsable.documentType} onChange={e=>setResponsable({...responsable,documentType:e.target.value})}>{DOC_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Número</span><input value={responsable.documentNumber} onChange={e=>setResponsable({...responsable,documentNumber:e.target.value})}/></label></div>
        <button type="button" onClick={report} disabled={busy||selectedDocs.length<2}>{busy==='report'?'Reportando a Hacienda…':`Reportar contingencia (${selectedDocs.length} DTE)`}</button>
        <small className="billing-document-safety">Esta acción firma y transmite el evento de contingencia a Hacienda. No transmite todavía los DTE individuales.</small>
      </div>
    </div>

    <div style={{marginTop:16,borderTop:'1px solid #cfd3d7',paddingTop:14}}>
      <div className="billing-document-detail-head"><div><span>Eventos reportados</span><strong>Recepción por lotes y conciliación</strong><small>Seleccioná un evento aceptado por MH para continuar.</small></div></div>
      {!events.length?<div className="billing-documents-empty"><strong>No hay eventos de contingencia.</strong><small>Cuando Hacienda acepte el evento aparecerá aquí.</small></div>:<div style={{display:'grid',gridTemplateColumns:'minmax(260px,.75fr) minmax(0,1.25fr)',gap:12,marginTop:12}}>
        <div>{events.map(event=>{const count=Array.isArray(event.payload?.detalleDTE)?event.payload.detalleDTE.length:0;return <button type="button" key={event.id} onClick={()=>setSelectedEventId(event.id)} className="secondary-button" style={{display:'block',width:'100%',textAlign:'left',marginBottom:7,border:selectedEventId===event.id?'2px solid #ff6b00':undefined}}><strong style={{display:'block'}}>{statusLabel(event.status)} · {count} DTE</strong><small>{event.environment==='production'?'PRODUCCIÓN 01':'TEST 00'} · {new Date(event.created_at).toLocaleString('es-SV')}</small></button>})}</div>
        <div>{selectedEvent&&<><div className="billing-document-detail-grid"><Info label="Estado evento" value={statusLabel(selectedEvent.status)}/><Info label="DTE reportados" value={Array.isArray(selectedEvent.payload?.detalleDTE)?selectedEvent.payload.detalleDTE.length:0}/><Info label="Lotes registrados" value={eventBatches.length}/></div><div className="billing-document-actions"><button type="button" onClick={transmit} disabled={busy||selectedEvent.status!=='PROCESSED'}>{busy==='transmit'?'Transmitiendo lotes…':'Transmitir lotes a Hacienda'}</button><button type="button" className="secondary-button" onClick={reconcile} disabled={busy||!eventBatches.length}>{busy==='reconcile'?'Consultando Hacienda…':'Consultar y conciliar lotes'}</button><button type="button" className="secondary-button" onClick={load} disabled={busy}>Actualizar</button></div>{eventBatches.length>0&&<div style={{marginTop:10}}>{eventBatches.map(batch=><div key={batch.id} style={{display:'grid',gridTemplateColumns:'70px 1fr auto',gap:10,padding:'8px 0',borderBottom:'1px solid #e1e4e7'}}><strong>Lote {batch.batch_number}</strong><span><small style={{display:'block'}}>{batch.codigo_lote||'Sin código MH'}</small>{batch.error_message&&<small style={{color:'#991b1b'}}>{batch.error_message}</small>}</span><span className={`billing-document-status ${String(batch.status||'').toLowerCase()}`}>{statusLabel(batch.status)}</span></div>)}</div>}</>}</div>
      </div>}
    </div>
  </section>
}

function Info({label,value}){return <div className="billing-document-info"><span>{label}</span><strong>{value??'—'}</strong></div>}
