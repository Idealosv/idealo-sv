import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {supabase} from './lib/supabase.js'

const apiUrl=import.meta.env.VITE_API_URL||'http://localhost:4000'

export default function MobileDteEnvironmentGuard(){
 const [session,setSession]=useState(null),[companyId,setCompanyId]=useState(null),[settings,setSettings]=useState(null),[target,setTarget]=useState(null)
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session){setCompanyId(null);return}(async()=>{const {data}=await supabase.rpc('get_my_companies');setCompanyId(data?.[0]?.id||null)})()},[session?.user?.id])
 useEffect(()=>{if(!session||!companyId)return;(async()=>{try{const r=await fetch(`${apiUrl}/api/dte/runtime-settings?companyId=${encodeURIComponent(companyId)}`,{headers:{Authorization:`Bearer ${session.access_token}`}});if(r.ok)setSettings(await r.json())}catch{}})()},[session?.access_token,companyId])
 useEffect(()=>{const sync=()=>setTarget(document.querySelector('.mobile-dte-panel>main'));sync();const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[])
 useEffect(()=>{if(!target)return;const production=settings?.environment==='production';const normalize=()=>{target.querySelectorAll('.mobile-dte-actions button').forEach(btn=>{if(/Transmitir MH/i.test(btn.textContent||''))btn.textContent='Enviar a Hacienda TEST';if(production&&/Firmar|Transmitir|Enviar a Hacienda/i.test(btn.textContent||'')){btn.disabled=true;btn.title='Producción Android bloqueada hasta soportar creación y firma en ambiente 01.'}});const create=target.querySelector('.mobile-dte-primary');if(production&&create){create.disabled=true;create.title='Producción Android bloqueada hasta soportar creación y firma en ambiente 01.'}};normalize();const observer=new MutationObserver(normalize);observer.observe(target,{childList:true,subtree:true});return()=>observer.disconnect()},[target,settings?.environment])
 if(!target)return null
 const production=settings?.environment==='production'
 return createPortal(<div className={`mobile-dte-environment ${production?'production-blocked':'test'}`}><strong>{production?'PRODUCCIÓN CONFIGURADA · EMISIÓN ANDROID BLOQUEADA':'AMBIENTE TEST · NO PRODUCCIÓN'}</strong><span>{production?'La empresa está configurada para producción, pero Android no emitirá ni firmará DTE reales hasta que creación y firma soporten ambiente 01.':'Los DTE creados, firmados y enviados desde esta pantalla pertenecen al ambiente de pruebas 00 de Hacienda.'}</span>{settings?.preflight&&!settings.preflight.configurationReady&&<small>Preflight producción: {(settings.preflight.blockers||[]).join(' ')||'Pendiente'}</small>}</div>,target)
}
