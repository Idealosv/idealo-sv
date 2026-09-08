import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import './mobile-update.css'

const BUILD_SHA=import.meta.env.VITE_ANDROID_BUILD_SHA||''
const RELEASE_API='https://api.github.com/repos/Idealosv/idealo-sv/releases/tags/android-latest'

const isAndroidNative=()=>{
 const c=window.Capacitor
 return !!c?.isNativePlatform?.()&&c.getPlatform?.()==='android'
}

export default function MobileUpdateNotice(){
 const [online,setOnline]=useState(navigator.onLine),[update,setUpdate]=useState(null)
 useEffect(()=>{const up=()=>setOnline(true),down=()=>setOnline(false);addEventListener('online',up);addEventListener('offline',down);return()=>{removeEventListener('online',up);removeEventListener('offline',down)}},[])
 useEffect(()=>{
  if(!online||!BUILD_SHA||!isAndroidNative())return
  let alive=true
  fetch(RELEASE_API,{headers:{Accept:'application/vnd.github+json'}}).then(async r=>r.ok?r.json():null).then(release=>{
   if(!alive||!release)return
   const latest=(release.body||'').match(/build_sha=([0-9a-f]{40})/i)?.[1]||''
   if(!latest||latest===BUILD_SHA)return
   const asset=(release.assets||[]).find(x=>x.name==='IDEALO-SV-Android.apk')
   if(asset?.browser_download_url)setUpdate({sha:latest,url:asset.browser_download_url})
  }).catch(()=>{})
  return()=>{alive=false}
 },[online])
 if(!update)return null
 const openUpdate=()=>{
  const w=window.open(update.url,'_blank','noopener,noreferrer')
  if(!w)window.location.assign(update.url)
 }
 return createPortal(<div className="mobile-update-notice"><div><strong>Actualización disponible</strong><small>Hay una versión nueva de IDEALO SV para Android.</small></div><button type="button" onClick={openUpdate}>Actualizar</button></div>,document.body)
}
