import { useEffect,useMemo,useState } from 'react'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'
const TYPES=[
  ['1','Error en la información del documento'],
  ['2','Rescindir la operación'],
  ['3','Otro motivo que requiere documento de reemplazo'],
]
const DOC_TYPES=[['13','DUI'],['36','NIT'],['37','Otro']]
const text=value=>String(value||'').trim()
const money=value=>`$${Number(value||0).toFixed(2)}`

async function postJson(path,session,body){
  const response=await fetch(`${apiUrl}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.message||`La API respondió HTTP ${response.status}.`)
  return payload
}

export default function DteInvalidationPanel({supabase,company,session,controlNumber,onInvalidated}){
  const [document,setDocument]=useState(null)
  const [replacementOptions,setReplacementOptions]=useState([])
  const [receivables,setReceivables]=useState([])
  const [reasonType,setReasonType]=useState('2')
  const [reason,setReason]=useState('')
  const [replacementId,setReplacementId]=useState('')
  const [responsible,setResponsible]=useState({name:'',documentType:'13',documentNumber:''})
  const [requester,setRequester]=useState({name:'',documentType:'13',documentNumber:''})
  const [confirmation,setConfirmation]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const load=async()=>{
    if(!company?.id||!controlNumber){setDocument(null);setReplacementOptions([]);setReceivables([]);return}
    setError('')
    const {data:doc,error:docError}=await supabase.from('dte_documents').select('id,company_id,client_id,dte_type,control_number,generation_code,environment,status,mh_receipt_seal,financial_state,dte_payload').eq('company_id',company.id).eq('control_number',controlNumber).maybeSingle()
    if(docError){setError(docError.message);return}
    setDocument(doc||null)
    if(!doc){setReplacementOptions([]);setReceivables([]);return}
    const [replacementResult,arResult]=await Promise.all([
      supabase.from('dte_documents').select('id,control_number,generation_code,dte_type,status,environment,client_id,created_at').eq('company_id',company.id).eq('environment',doc.environment).eq('status','PROCESSED').neq('id',doc.id).order('created_at',{ascending:false}).limit(100),
      supabase.from('accounts_receivable').select('id,status,amount_paid').eq('company_id',company.id).eq('dte_document_id',doc.id),
    ])
    if(replacementResult.error)setError(replacementResult.error.message)
    else setReplacementOptions((replacementResult.data||[]).filter(row=>String(row.dte_type)===String(doc.dte_type)&&(row.client_id||null)===(doc.client_id||null)))
    if(arResult.error)setError(current=>current||arResult.error.message)
    else setReceivables(arResult.data||[])
  }

  useEffect(()=>{
    setReasonType('2');setReason('');setReplacementId('');setResponsible({name:'',documentType:'13',documentNumber:''});setRequester({name:'',documentType:'13',documentNumber:''});setConfirmation('');setMessage('');setError('');void load()
  },[controlNumber,company?.id])

  const requiresReplacement=reasonType!=='2'
  const expected=useMemo(()=>document?`INVALIDAR ${document.control_number}`:'',[document])
  const paid=useMemo(()=>receivables.reduce((sum,row)=>sum+Number(row.amount_paid||0),0),[receivables])
  const canSubmit=Boolean(document&&document.status==='PROCESSED'&&document.mh_receipt_seal&&text(reason).length>=5&&text(responsible.name)&&text(responsible.documentNumber)&&text(requester.name)&&text(requester.documentNumber)&&(!requiresReplacement||replacementId)&&confirmation===expected&&!busy)

  if(!document||document.status!=='PROCESSED')return null

  const submit=async()=>{
    if(!session?.access_token||!canSubmit)return
    if(paid>0){setError(`Este DTE todavía registra ${money(paid)} en cobros aplicados. Revertí esos cobros antes de invalidar.`);return}
    setBusy(true);setError('');setMessage('')
    try{
      const result=await postJson('/api/dte/invalidate',session,{
        documentId:document.id,
        tipoAnulacion:Number(reasonType),
        motivoAnulacion:text(reason),
        responsable:{name:text(responsible.name),documentType:text(responsible.documentType),documentNumber:text(responsible.documentNumber)},
        solicitante:{name:text(requester.name),documentType:text(requester.documentType),documentNumber:text(requester.documentNumber)},
        replacementDocumentId:requiresReplacement?replacementId:null,
        confirmation,
      })
      setMessage(result.status==='PROCESSED'?'Hacienda procesó la invalidación. El DTE quedó invalidado y el backend ejecutó las validaciones/reversión financiera correspondientes.':`Evento de invalidación enviado. Estado: ${result.status||'desconocido'}.`)
      setConfirmation('')
      await load()
      onInvalidated?.(result)
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }

  return <section className="billing-document-detail" aria-label="Invalidación DTE">
    <div className="billing-document-detail-head"><div><span>Invalidación fiscal</span><strong>Invalidar DTE aceptado por Hacienda</strong><small>{document.control_number}</small></div><span className="billing-document-status processed">ACEPTADO MH</span></div>
    {error&&<div className="billing-documents-alert error" style={{marginTop:12}}>{error}</div>}
    {message&&<div className="billing-documents-alert success" style={{marginTop:12}}>{message}</div>}
    <div className="billing-document-detail-grid">
      <Info label="Sello MH" value={document.mh_receipt_seal||'—'}/>
      <Info label="Estado financiero" value={document.financial_state||'Sin contabilizar'}/>
      <Info label="Cobros aplicados" value={money(paid)}/>
    </div>
    {paid>0&&<div className="billing-mh-response"><strong>Reversión previa obligatoria</strong><p>Hay cobros aplicados a este DTE. El backend bloqueará la invalidación hasta que esos cobros estén revertidos correctamente.</p></div>}
    <div className="form-grid two" style={{marginTop:14}}>
      <label className="field"><span>Tipo de invalidación</span><select value={reasonType} onChange={e=>{setReasonType(e.target.value);setReplacementId('')}}>{TYPES.map(([v,l])=><option key={v} value={v}>{v} · {l}</option>)}</select></label>
      {requiresReplacement?<label className="field"><span>DTE de reemplazo aceptado *</span><select value={replacementId} onChange={e=>setReplacementId(e.target.value)}><option value="">Seleccionar DTE de reemplazo</option>{replacementOptions.map(row=><option key={row.id} value={row.id}>{row.control_number}</option>)}</select></label>:<div className="billing-document-info"><span>Documento de reemplazo</span><strong>No requerido para tipo 2</strong></div>}
      <label className="field form-span-2"><span>Motivo de invalidación *</span><textarea rows="2" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe la razón real de la invalidación"/></label>
    </div>
    <div className="form-grid three" style={{marginTop:12}}>
      <label className="field"><span>Responsable *</span><input value={responsible.name} onChange={e=>setResponsible({...responsible,name:e.target.value})} placeholder="Nombre completo"/></label>
      <label className="field"><span>Documento responsable</span><select value={responsible.documentType} onChange={e=>setResponsible({...responsible,documentType:e.target.value})}>{DOC_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field"><span>Número *</span><input value={responsible.documentNumber} onChange={e=>setResponsible({...responsible,documentNumber:e.target.value})}/></label>
      <label className="field"><span>Solicitante *</span><input value={requester.name} onChange={e=>setRequester({...requester,name:e.target.value})} placeholder="Nombre completo"/></label>
      <label className="field"><span>Documento solicitante</span><select value={requester.documentType} onChange={e=>setRequester({...requester,documentType:e.target.value})}>{DOC_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field"><span>Número *</span><input value={requester.documentNumber} onChange={e=>setRequester({...requester,documentNumber:e.target.value})}/></label>
    </div>
    <div className="billing-mh-response" style={{marginTop:14}}><strong>Confirmación obligatoria</strong><p>Escribí exactamente: <strong>{expected}</strong></p><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder={expected} style={{width:'100%',padding:'10px 12px',border:'1px solid #8e959d',borderRadius:8}}/></div>
    <div className="billing-document-actions"><button type="button" onClick={submit} disabled={!canSubmit}>{busy?'Invalidando…':'Invalidar DTE en Hacienda'}</button></div>
    <small className="billing-document-safety">Esta acción sí transmite un evento fiscal a Hacienda. El backend exige DTE PROCESSED con sello MH, permisos válidos, confirmación exacta y controles financieros antes de cambiar el documento a INVALIDATED.</small>
  </section>
}

function Info({label,value}){return <div className="billing-document-info"><span>{label}</span><strong>{value||'—'}</strong></div>}
