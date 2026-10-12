import { useEffect, useState } from 'react'

const API=import.meta.env.VITE_API_URL||'http://localhost:4000'
const sectionNames={identificacion:'Identificación',documentoRelacionado:'DTE relacionado',emisor:'Emisor',documento:'Documento',cuerpoDocumento:'Detalle de devolución / operación',resumen:'Resumen',ventaTercero:'Venta a terceros',compraTercero:'Compra a terceros',apendice:'Apéndice'}
const field={width:'100%',padding:10,boxSizing:'border-box',border:'1px solid #cbd5e1',borderRadius:8,background:'white',color:'#0f172a'}
const btn={padding:'10px 14px',border:0,borderRadius:9,color:'#fff',background:'#0f172a',fontWeight:750,cursor:'pointer'}
async function apiRequest(path,token,options={}) {
 const r=await fetch(API+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}})
 const j=await r.json().catch(()=>({}))
 if(!r.ok)throw new Error(j.message||j.error||'HTTP '+r.status)
 return j
}
export default function MhAdditionalEventEditor({company,supabase,session,initialType='RETURN'}) {
 const [type,setType]=useState(initialType)
 const [template,setTemplate]=useState(null)
 const [document,setDocument]=useState(null)
 const [sections,setSections]=useState({})
 const [syntaxErrors,setSyntaxErrors]=useState({})
 const [sourceId,setSourceId]=useState('')
 const [sources,setSources]=useState([])
 const [busy,setBusy]=useState('')
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [valid,setValid]=useState(false)
 const [saved,setSaved]=useState(null)
 const token=session?.access_token
 const sectionsOf=d=>Object.fromEntries(Object.entries(d||{}).map(([k,v])=>[k,JSON.stringify(v,null,2)]))
 useEffect(()=>{
  if(!company?.id||!token)return
  let cancelled=false
  setBusy('template');setMessage('');setError('');setSaved(null);setSourceId('')
  apiRequest('/api/dte/certification/events/template?companyId='+encodeURIComponent(company.id)+'&eventType='+encodeURIComponent(type),token)
   .then(x=>{if(cancelled)return;setTemplate(x.document);setDocument(x.document);setSections(sectionsOf(x.document));setSyntaxErrors({});setValid(false)})
   .catch(e=>{if(!cancelled)setError(e.message)})
   .finally(()=>{if(!cancelled)setBusy('')})
  return()=>{cancelled=true}
 },[company?.id,type,token])
 useEffect(()=>{
  if(!company?.id)return
  let cancelled=false
  supabase.from('dte_documents').select('id,dte_type,generation_code,dte_payload,status,control_number')
   .eq('company_id',company.id).eq('environment','test').in('dte_type',['01','11','14'])
   .in('status',['PROCESSED','INVALIDATED']).order('created_at',{ascending:false}).limit(80)
   .then(({data,error:err})=>{if(cancelled)return;if(err)setError(err.message);else setSources(data||[])})
  return()=>{cancelled=true}
 },[company?.id,supabase])
 function change(key,text) {
  setSections(s=>({...s,[key]:text}));setValid(false);setSaved(null)
  try {const value=JSON.parse(text);setDocument(x=>({...x,[key]:value}));setSyntaxErrors(x=>{const next={...x};delete next[key];return next})}
  catch {setSyntaxErrors(x=>({...x,[key]:'JSON no válido'}))}
 }
 function takeSource() {
  const original=sources.find(x=>x.id===sourceId)
  if(!original||!document)return
  const next=structuredClone(document)
  if(Array.isArray(next.documentoRelacionado))next.documentoRelacionado=[{
   tipoDocumento:original.dte_type,
   codigoGeneracion:String(original.generation_code).toUpperCase(),
   fechaEmision:original.dte_payload?.identificacion?.fecEmi||'',
  }]
  setDocument(next);setSections(sectionsOf(next));setValid(false)
  setMessage('DTE relacionado agregado. Completa los datos reales de la devolución antes de validar.')
 }
 async function request(action,path) {
  if(Object.keys(syntaxErrors).length) return setError('Corrige primero el JSON de las secciones señaladas.')
  setError('');setMessage('');setBusy(action)
  try {
   const result=await apiRequest(path,token,{
    method:'POST',body:JSON.stringify({companyId:company.id,eventType:type,document,sourceDocumentId:sourceId||null}),
   })
   if(action==='validate'){setValid(true);setMessage('Esquema validado. Puedes guardar el borrador; no se transmite a Hacienda.')}
   else {setSaved(result);setValid(false);setMessage('Borrador guardado. Transmisión inhabilitada hasta autorización y contrato oficial de Hacienda.')}
  }catch(e){setValid(false);setError(e.message)}
  finally{setBusy('')}
 }
 return <section style={{padding:15,border:'1px solid #cbd5e1',borderRadius:12,background:'#fff',marginTop:15,color:'#0f172a'}} aria-label="Eventos DTE de normativa 2.0">
  <strong style={{fontSize:18}}>Eventos adicionales MH 2.0</strong>
  <p style={{fontSize:13,color:'#64748b'}}>Preparación y validación de eventos desde IDEALO. El envío está bloqueado hasta confirmar la autorización del emisor y la ruta oficial de estos nuevos servicios.</p>
  <label style={{fontWeight:700}}>Tipo de evento
   <select value={type} onChange={e=>setType(e.target.value)} style={{...field,display:'block',marginTop:5}} disabled={Boolean(busy)}>
    <option value="RETURN">Evento de Retorno</option><option value="SPECIAL_OPERATIONS">Evento de Operaciones Especiales</option>
   </select>
  </label>
  {type==='RETURN'&&<div style={{marginTop:10}}>
   <label>DTE anterior aceptado en TEST
    <select value={sourceId} onChange={e=>setSourceId(e.target.value)} style={{...field,display:'block'}}>
     <option value="">Selecciona un DTE real del ERP</option>
     {sources.map(s=><option key={s.id} value={s.id}>{s.dte_type} · {s.control_number}</option>)}
    </select>
   </label>
   <button type="button" onClick={takeSource} disabled={!sourceId||Boolean(busy)} style={{...btn,marginTop:8}}>Vincular DTE al retorno</button>
  </div>}
  {template&&Object.entries(sections).map(([key,value])=><details key={key} style={{marginTop:10,border:'1px solid #e2e8f0',padding:9,borderRadius:8}} open={key==='cuerpoDocumento'||key==='resumen'||key==='documentoRelacionado'}>
   <summary style={{cursor:'pointer',fontWeight:700}}>{sectionNames[key]||key}</summary>
   <textarea spellCheck={false} aria-label={'JSON '+key} value={value||''} onChange={e=>change(key,e.target.value)} style={{...field,marginTop:8,fontFamily:'ui-monospace,Consolas,monospace',fontSize:12}} rows={Math.min(12,Math.max(4,String(value||'').split('\n').length+1))}/>
   {syntaxErrors[key]&&<small style={{color:'#b91c1c'}} role="alert">{syntaxErrors[key]}</small>}
  </details>)}
  {error&&<p role="alert" style={{color:'#b91c1c',whiteSpace:'pre-wrap'}}>{error}</p>}
  {message&&<p role="status" style={{color:'#065f46'}}>{message}</p>}
  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>
   <button type="button" style={btn} disabled={Boolean(busy)||!document||Boolean(saved)} onClick={()=>request('validate','/api/dte/certification/events/validate')}>1 · {busy==='validate'?'Validando…':'Validar evento'}</button>
   <button type="button" style={{...btn,background:'#0f766e'}} disabled={Boolean(busy)||!valid||Boolean(saved)} onClick={()=>request('save','/api/dte/certification/events/drafts')}>2 · Guardar borrador</button>
   <button type="button" style={{...btn,opacity:.5,cursor:'not-allowed'}} disabled title="Pendiente autorización del Ministerio de Hacienda">3 · Enviar a MH (no habilitado)</button>
  </div>
  {saved&&<small style={{display:'block',marginTop:10}}>Borrador {saved.event_type} · {saved.generation_code} · {saved.status}</small>}
 </section>
}
