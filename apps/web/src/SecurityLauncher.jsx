import {useEffect,useState} from 'react'
import {supabase} from './lib/supabase.js'
import UsersAdministrationCenter from './UsersAdministrationCenter.jsx'
import AccountSecurityPanel from './AccountSecurityPanel.jsx'
import './users-administration.css'
import './users-administration-tuning.css'

export default function SecurityLauncher(){
 const [open,setOpen]=useState(false),[session,setSession]=useState(null),[company,setCompany]=useState(null),[msg,setMsg]=useState('')
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}let live=true;(async()=>{setMsg('');const {data,error}=await supabase.rpc('get_my_companies');if(!live)return;if(error){setMsg(error.message);return}setCompany(data?.[0]||null)})();return()=>{live=false}},[session?.user?.id])
 useEffect(()=>{const fn=e=>{if((e.detail||{}).target==='security')setOpen(true)};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
 if(!open)return null
 return <div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel admin-users-modal" role="dialog" aria-modal="true" aria-label="Usuarios y Administración" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Usuarios y Administración</strong><small>Personas, roles, accesos y trazabilidad</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><div className="erp-modal-body admin-users-body">{msg&&<p className="feedback error">{msg}</p>}{session&&company?<><UsersAdministrationCenter company={company} session={session}/><section className="admin-users-panel account-protection-panel"><div className="admin-section-head"><div><h3>Protección avanzada de la cuenta</h3><p>Autenticación de dos pasos, actividad reciente y control de sesiones.</p></div></div><AccountSecurityPanel session={session}/></section></>:<div className="empty-state"><strong>Necesitás una sesión y empresa activa para administrar usuarios.</strong></div>}</div></section></div>
}
