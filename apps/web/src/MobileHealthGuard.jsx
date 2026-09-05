import { useEffect, useState } from 'react'
import { offlineCount } from './mobileOffline.js'

const platform=()=>window.Capacitor?.getPlatform?.()||'web'

export default function MobileHealthGuard(){
  const [visible,setVisible]=useState(window.location.pathname==='/mobile')
  const [online,setOnline]=useState(navigator.onLine)
  const [pending,setPending]=useState(0)
  const [errors,setErrors]=useState(0)
  const [sw,setSw]=useState(Boolean(navigator.serviceWorker?.controller))
  const [expanded,setExpanded]=useState(false)
  const [diag,setDiag]=useState({camera:'Sin probar',gps:'Sin probar',notifications:'Sin probar'})

  useEffect(()=>{const onModule=e=>{if(e.detail==='App móviles')setVisible(true);else if(window.location.pathname!=='/mobile')setVisible(false)};window.addEventListener('idealo-module-change',onModule);return()=>window.removeEventListener('idealo-module-change',onModule)},[])
  useEffect(()=>{const refresh=()=>offlineCount().then(setPending).catch(()=>setErrors(x=>x+1));refresh();const up=()=>{setOnline(true);refresh()},down=()=>setOnline(false);window.addEventListener('online',up);window.addEventListener('offline',down);const timer=setInterval(refresh,5000);return()=>{clearInterval(timer);window.removeEventListener('online',up);window.removeEventListener('offline',down)}},[])
  useEffect(()=>{const resize=()=>{const h=window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--mobile-safe-height',`${Math.round(h)}px`)};resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize)}},[])
  useEffect(()=>{const onError=()=>setErrors(x=>x+1),onReject=()=>setErrors(x=>x+1);window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject);navigator.serviceWorker?.ready.then(()=>setSw(true)).catch(()=>{});return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject)}},[])
  useEffect(()=>{const onStatus=e=>setDiag(x=>({...x,notifications:e.detail?.ready?'OK':e.detail?.error||'Revisar'}));window.addEventListener('idealo-mobile-notifications-status',onStatus);return()=>window.removeEventListener('idealo-mobile-notifications-status',onStatus)},[])

  const testCamera=async()=>{try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('No disponible');const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});stream.getTracks().forEach(t=>t.stop());setDiag(x=>({...x,camera:'OK'}))}catch(e){setDiag(x=>({...x,camera:e?.name==='NotAllowedError'?'Permiso denegado':'Revisar'}))}}
  const testGps=()=>{if(!navigator.geolocation)return setDiag(x=>({...x,gps:'No disponible'}));navigator.geolocation.getCurrentPosition(()=>setDiag(x=>({...x,gps:'OK'})),e=>setDiag(x=>({...x,gps:e.code===1?'Permiso denegado':'Revisar'})),{enableHighAccuracy:true,timeout:12000,maximumAge:0})}
  const enableNotifications=()=>window.dispatchEvent(new CustomEvent('idealo-mobile-notifications-enable'))

  if(!visible)return null
  const status=!online?'Sin conexión':errors?'Revisar':pending?'Pendiente':'Operativa'
  return <aside className={`mobile-health ${!online||errors?'attention':''}`} aria-label="Estado de la app móvil">
    <button className="mobile-health-summary" type="button" onClick={()=>setExpanded(x=>!x)}><strong>{status}</strong><span>{online?'Red OK':'Offline'} · {sw?'PWA OK':'PWA iniciando'} · {pending} pendientes{errors?` · ${errors} errores`:''}</span></button>
    {expanded&&<div className="mobile-health-details"><small>Plataforma: {platform()}</small><div><button type="button" onClick={testCamera}>Cámara</button><b>{diag.camera}</b></div><div><button type="button" onClick={testGps}>GPS</button><b>{diag.gps}</b></div><div><button type="button" onClick={enableNotifications}>Notificaciones</button><b>{diag.notifications}</b></div><small>La firma táctil se valida dentro del comprobante de Entrega.</small></div>}
  </aside>
}
