import { useEffect,useRef,useState } from 'react'
import { enqueueOffline } from './mobileOffline.js'

const fileExt=f=>{const n=(f?.name||'').split('.').pop();return n&&n.length<6?n.toLowerCase():(f?.type==='image/png'?'png':'jpg')}
const dataUrlToBlob=async dataUrl=>(await fetch(dataUrl)).blob()

export default function MobileEvidenceSheet({supabase,company,order,onClose,onSaved}){
 const [type,setType]=useState('PRODUCTION'),[files,setFiles]=useState([]),[notes,setNotes]=useState(''),[recipient,setRecipient]=useState(''),[geo,setGeo]=useState(null),[geoError,setGeoError]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const canvasRef=useRef(null),drawing=useRef(false),signed=useRef(false)
 useEffect(()=>{locate()},[])
 const locate=()=>{if(!navigator.geolocation){setGeoError('GPS no disponible en este dispositivo.');return}setGeoError('');navigator.geolocation.getCurrentPosition(p=>setGeo({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_m:p.coords.accuracy}),e=>setGeoError(e.message),{enableHighAccuracy:true,timeout:12000,maximumAge:30000})}
 const point=e=>{const c=canvasRef.current,r=c.getBoundingClientRect(),p=e.touches?.[0]||e;return {x:(p.clientX-r.left)*(c.width/r.width),y:(p.clientY-r.top)*(c.height/r.height)}}
 const start=e=>{e.preventDefault();drawing.current=true;const c=canvasRef.current,x=point(e),ctx=c.getContext('2d');ctx.beginPath();ctx.moveTo(x.x,x.y)}
 const move=e=>{if(!drawing.current)return;e.preventDefault();const c=canvasRef.current,x=point(e),ctx=c.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#111827';ctx.lineTo(x.x,x.y);ctx.stroke();signed.current=true}
 const stop=()=>{drawing.current=false}
 const clearSign=()=>{const c=canvasRef.current;c.getContext('2d').clearRect(0,0,c.width,c.height);signed.current=false}
 const uploadOne=async(file,evidenceType)=>{const id=crypto.randomUUID(),ext=fileExt(file),path=`${company.id}/${order.id}/${id}.${ext}`,meta={company_id:company.id,work_order_id:order.id,evidence_type:evidenceType,storage_path:path,file_name:file.name||`${evidenceType}.${ext}`,mime_type:file.type||'image/jpeg',notes:notes||null,recipient_name:recipient||null,...geo}
  if(!navigator.onLine){await enqueueOffline({kind:'evidence',blob:file,meta});return 'queued'}
  const {error:u}=await supabase.storage.from('work-order-evidence').upload(path,file,{contentType:meta.mime_type,upsert:false});if(u)throw u
  const {error:i}=await supabase.from('work_order_evidence').insert(meta);if(i){await supabase.storage.from('work-order-evidence').remove([path]);throw i}return 'saved'}
 const save=async()=>{if(!files.length&&!signed.current){setMsg('Tomá al menos una foto o pedí la firma del cliente.');return}setBusy(true);setMsg('');try{let queued=0;for(const f of files){if(await uploadOne(f,type)==='queued')queued++}if(signed.current){const blob=await dataUrlToBlob(canvasRef.current.toDataURL('image/png'));blob.name='firma-cliente.png';if(await uploadOne(blob,'SIGNATURE')==='queued')queued++}setMsg(queued?'Guardado sin conexión. Se sincronizará automáticamente.':'Evidencia guardada correctamente.');await onSaved?.();setTimeout(onClose,700)}catch(e){if(!navigator.onLine){setMsg('Sin conexión: intentá guardar nuevamente para dejarlo en cola.')}else setMsg(e.message||'No se pudo guardar la evidencia.')}finally{setBusy(false)}}
 return <div className="mobile-sheet-backdrop" onMouseDown={onClose}><section className="mobile-sheet" onMouseDown={e=>e.stopPropagation()}><header><div><small>EVIDENCIA OT-{order.number}</small><strong>{order.title}</strong></div><button onClick={onClose}>×</button></header><div className="mobile-sheet-body">
  <label>Tipo de evidencia<select value={type} onChange={e=>setType(e.target.value)}><option value="PRODUCTION">Producción</option><option value="INSTALLATION">Instalación</option><option value="DELIVERY">Entrega</option><option value="OTHER">Otra</option></select></label>
  <label className="mobile-camera-button">📷 Tomar foto / elegir imagen<input type="file" accept="image/*" capture="environment" multiple onChange={e=>setFiles([...e.target.files])}/></label>{files.length>0&&<small className="mobile-file-count">{files.length} foto(s) preparada(s)</small>}
  <label>Persona que recibe<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Nombre del cliente o receptor"/></label><label>Notas<textarea rows="3" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Detalle de instalación, entrega o trabajo realizado"/></label>
  <div className="mobile-gps"><div><strong>Ubicación GPS</strong><small>{geo?`${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)} · ±${Math.round(geo.accuracy_m)} m`:geoError||'Obteniendo ubicación…'}</small></div><button onClick={locate}>Actualizar</button></div>
  <div className="mobile-sign"><div><strong>Firma del cliente</strong><button onClick={clearSign}>Limpiar</button></div><canvas ref={canvasRef} width="700" height="220" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerLeave={stop} onTouchStart={start} onTouchMove={move} onTouchEnd={stop}/><small>Firmar con el dedo dentro del recuadro.</small></div>
  {msg&&<div className="mobile-evidence-msg">{msg}</div>}<button className="mobile-primary-action" disabled={busy} onClick={save}>{busy?'Guardando…':navigator.onLine?'Guardar evidencia':'Guardar sin conexión'}</button>
 </div></section></div>
}
