import { useEffect, useState } from 'react'
import { offlineCount } from './mobileOffline.js'

export default function MobileHealthGuard(){
  const [visible,setVisible]=useState(window.location.pathname==='/mobile')
  const [online,setOnline]=useState(navigator.onLine)
  const [pending,setPending]=useState(0)
  const [errors,setErrors]=useState(0)
  const [sw,setSw]=useState(Boolean(navigator.serviceWorker?.controller))

  useEffect(()=>{const onModule=e=>{if(e.detail==='App móviles')setVisible(true);else if(window.location.pathname!=='/mobile')setVisible(false)};window.addEventListener('idealo-module-change',onModule);return()=>window.removeEventListener('idealo-module-change',onModule)},[])
  useEffect(()=>{const refresh=()=>offlineCount().then(setPending).catch(()=>setErrors(x=>x+1));refresh();const up=()=>{setOnline(true);refresh()},down=()=>setOnline(false);window.addEventListener('online',up);window.addEventListener('offline',down);const timer=setInterval(refresh,5000);return()=>{clearInterval(timer);window.removeEventListener('online',up);window.removeEventListener('offline',down)}},[])
  useEffect(()=>{const resize=()=>{const h=window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--mobile-safe-height',`${Math.round(h)}px`)};resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize)}},[])
  useEffect(()=>{const onError=()=>setErrors(x=>x+1),onReject=()=>setErrors(x=>x+1);window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject);navigator.serviceWorker?.ready.then(()=>setSw(true)).catch(()=>{});return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject)}},[])

  if(!visible)return null
  const status=!online?'Sin conexión':errors?'Revisar':pending?'Pendiente':'Operativa'
  return <aside className={`mobile-health ${!online||errors?'attention':''}`} aria-label="Estado de la app móvil">
    <strong>{status}</strong><span>{online?'Red OK':'Offline'} · {sw?'PWA OK':'PWA iniciando'} · {pending} pendientes{errors?` · ${errors} errores`:''}</span>
  </aside>
}
