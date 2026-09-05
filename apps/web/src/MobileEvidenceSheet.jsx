import { useEffect,useRef,useState } from 'react'
import { enqueueOffline } from './mobileOffline.js'
import MobileEvidenceGallery from './MobileEvidenceGallery.jsx'

const fileExt=f=>{const n=(f?.name||'').split('.').pop();return n&&n.length<6?n.toLowerCase():(f?.type==='image/png'?'png':'jpg')}
const dataUrlToBlob=async dataUrl=>(await fetch(dataUrl)).blob()

export default function MobileEvidenceSheet({supabase,company,order,onClose,onSaved,deliveryMode=false,onConfirmDelivery}){
 const [type,setType]=useState(deliveryMode?'DELIVERY':'PRODUCTION'),[files,setFiles]=useState([]),[notes,setNotes]=useState(''),[recipient,setRecipient]=useState(''),[geo,setGeo]=useState(null),[geoError,setGeoError]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[gallery,setGallery]=useState(false),[done,setDone]=useState(false)
 const canvasRef=useRef(null),drawing=useRef(false),signed=useRef(false)
 useEffect(()=>{locate()},[])
 useEffect(()=>{if(deliveryMode)setType('DELIVERY')},[deliveryMode])
 const locate=()=>{if(!navigator.geolocation){setGeoError('GPS no disponible en este dispositivo.');return}setGeo(null);setGeoError('');navigator.geolocation.getCurrentPosition(p=>setGeo({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_m:p.coords.accuracy}),e=>setGeoError(e.message||'No se pudo obtener la ubicación.'),{enableHighAccuracy:true,timeout:12000,maximumAge:30000})}
 const point=e=>{const c=canvasRef.current,r=c.getBoundingClientRect(),p=e.touches?.[0]||e;return {x:(p.clientX-r.left)*(c.width/r.width),y:(p.clientY-r.top)*(c.height/r.height)}}
 const start=e=>{e.preventDefault();drawing.current=true;const c=canvasRef.current,x=point(e),ctx=c.getContext('2d');ctx.beginPath();ctx.moveTo(x.x,x.y)}
 const move=e=>{if(!drawing.current)return;e.preventDefault();const c=canvasRef.current,x=point(e),ctx=c.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#111827';ctx.lineTo(x.x,x.y);ctx.stroke();signed.current=true}
 const stop=()=>{drawing.current=false}
 const clearSign=()=>{const c=canvasRef.current;c.getContext('2d').clearRect(0,0,c.width,c.height);signed.current=false}
 const uploadOne=async(file,evidenceType)=>{const id=crypto.randomUUID(),ext=fileExt(file),path=`${company.id}/${order.id}/${id}.${ext}`,meta={company_id:company.id,work_order_id:order.id,evidence_type:evidenceType,storage_path:path,file_name:file.name||`${evidenceType}.${ext}`,mime_type:file.type||'image/jpeg',notes:notes||null,recipient_name:recipient||null,...geo}
  if(!navigator.onLine){await enqueueOffline({kind:'evidence',blob:file,meta});return 'queued'}
  const {error:u}=await supabase.storage.from('work-order-evidence').upload(path,file,{contentType:meta.mime_type,upsert:false});if(u)throw u
  const {error:i}=await supabase.from('work_order_evidence').insert(meta);if(i){await supabase.storage.from('work-order-evidence').remove([path]);throw i}return 'saved'}
 const openBillingPreparation=()=>window.dispatchEvent(new CustomEvent('idealo-mobile-delivery-billing',{detail:{workOrderId:order.id,workOrderNumber:order.number,clientId:order.client_id||'',description:order.title||`OT-${order.number}`,total:Number(order.total||0)}}))
 const save=async()=>{
  if(deliveryMode){
   if(!recipient.trim()){setMsg('Indicá el nombre de la persona que recibe.');return}
   if(!files.length){setMsg('Tomá al menos una foto de la entrega.');return}
   if(!geo){setMsg(`Necesitamos la ubicación GPS para el comprobante.${geoError?` ${geoError}`:' Tocá “Actualizar”.'}`);return}
   if(!signed.current){setMsg('Pedí la firma del cliente o receptor antes de confirmar la entrega.');return}
  }else if(!files.length&&!signed.current){setMsg('Tomá al menos una foto o pedí la firma del cliente.');return}
  setBusy(true);setMsg('');try{let queued=0;for(const f of files){if(await uploadOne(f,deliveryMode?'DELIVERY':type)==='queued')queued++}if(signed.current){const blob=await dataUrlToBlob(canvasRef.current.toDataURL('image/png'));blob.name='firma-cliente.png';if(await uploadOne(blob,'SIGNATURE')==='queued')queued++}
   let deliveryResult=null;if(deliveryMode){if(!onConfirmDelivery)throw new Error('No está disponible la confirmación de entrega.');deliveryResult=await onConfirmDelivery({order,recipient:recipient.trim(),notes:notes||null,geo});setDone(true)}
   if(deliveryMode)setMsg(deliveryResult==='queued'||queued?'Entrega guardada sin conexión. Foto, GPS, firma y confirmación se sincronizarán automáticamente.':'Entrega confirmada con foto, GPS y firma. Facturación quedó preparada para revisión.');else setMsg(queued?'Guardado sin conexión. Se sincronizará automáticamente.':'Evidencia guardada correctamente.')
   if(deliveryResult!=='queued'){await onSaved?.();if(deliveryMode)openBillingPreparation()}if(!deliveryMode&&!queued&&deliveryResult!=='queued')setGallery(true)
  }catch(e){if(!navigator.onLine){setMsg('Sin conexión: intentá guardar nuevamente para dejarlo en cola.')}else setMsg(e.message||'No se pudo guardar la evidencia.')}finally{setBusy(false)}}
 return <>{!gallery&&<div className="mobile-sheet-backdrop" onMouseDown={onClose}><section className="mobile-sheet" onMouseDown={e=>e.stopPropagation()}><header><div><small>{deliveryMode?'COMPROBANTE DE ENTREGA':'EVIDENCIA'} OT-{order.number}</small><strong>{order.title}</strong></div><button onClick={onClose}>×</button></header><div className="mobile-sheet-body">
  {deliveryMode&&<div className="mobile-evidence-msg">Para cerrar la OT como entregada se requiere persona que recibe, foto, ubicación GPS y firma.</div>}
  {!deliveryMode&&<button className="mobile-primary-action" onClick={()=>setGallery(true)}>Ver galería y comprobante</button>}
  {!deliveryMode&&<label>Tipo de evidencia<select value={type} onChange={e=>setType(e.target.value)}><option value="PRODUCTION">Producción</option><option value="INSTALLATION">Instalación</option><option value="DELIVERY">Entrega</option><option value="OTHER">Otra</option></select></label>}
  <label className="mobile-camera-button">📷 {deliveryMode?'Tomar foto de la entrega *':'Tomar foto / elegir imagen'}<input type="file" accept="image/*" capture="environment" multiple onChange={e=>setFiles([...e.target.files])} disabled={done}/></label>{files.length>0&&<small className="mobile-file-count">{files.length} foto(s) preparada(s)</small>}
  <label>Persona que recibe{deliveryMode?' *':''}<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Nombre del cliente o receptor" disabled={done}/></label><label>Notas<textarea rows="3" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Detalle de instalación, entrega o trabajo realizado" disabled={done}/></label>
  <div className="mobile-gps"><div><strong>Ubicación GPS{deliveryMode?' *':''}</strong><small>{geo?`${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)} · ±${Math.round(geo.accuracy_m)} m`:geoError||'Obteniendo ubicación…'}</small></div><button onClick={locate} disabled={done}>Actualizar</button></div>
  <div className="mobile-sign"><div><strong>Firma del cliente{deliveryMode?' *':''}</strong><button onClick={clearSign} disabled={done}>Limpiar</button></div><canvas ref={canvasRef} width="700" height="220" onPointerDown={done?undefined:start} onPointerMove={done?undefined:move} onPointerUp={stop} onPointerLeave={stop} onTouchStart={done?undefined:start} onTouchMove={done?undefined:move} onTouchEnd={stop}/><small>Firmar con el dedo dentro del recuadro.</small></div>
  {msg&&<div className="mobile-evidence-msg">{msg}</div>}{done?<><button className="mobile-primary-action" onClick={()=>setGallery(true)}>Ver comprobante</button><button className="mobile-primary-action" onClick={onClose}>Cerrar</button></>:<button className="mobile-primary-action" disabled={busy} onClick={save}>{busy?'Guardando…':deliveryMode?(navigator.onLine?'Guardar y confirmar entrega':'Guardar entrega sin conexión'):(navigator.onLine?'Guardar evidencia':'Guardar sin conexión')}</button>}
 </div></section></div>}{gallery&&<MobileEvidenceGallery supabase={supabase} company={company} order={order} onClose={()=>deliveryMode&&done?setGallery(false):setGallery(false)}/>}</>
}
