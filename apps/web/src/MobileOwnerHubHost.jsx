import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {supabase} from './lib/supabase.js'
import {offlineCount} from './mobileOffline.js'
import MobileOwnerHub from './MobileOwnerHub.jsx'

export default function MobileOwnerHubHost(){
 const [visible,setVisible]=useState(location.pathname==='/mobile')
 const [open,setOpen]=useState(false),[session,setSession]=useState(null),[company,setCompany]=useState(null),[role,setRole]=useState('viewer')
 const [online,setOnline]=useState(navigator.onLine),[pending,setPending]=useState(0),[busy,setBusy]=useState('')
 useEffect(()=>{const sync=()=>setVisible(location.pathname==='/mobile'||!!document.querySelector('.mobile-app-shell'));const h=e=>e.detail==='App móviles'?setVisible(true):location.pathname!=='/mobile'&&setVisible(false);sync();window.addEventListener('idealo-module-change',h);return()=>window.removeEventListener('idealo-module-change',h)},[])
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session){setCompany(null);return}(async()=>{const {data:list}=await supabase.rpc('get_my_companies');const id=list?.[0]?.id;if(!id)return;const [{data:c},{data:m}]=await Promise.all([supabase.from('companies').select('id,name').eq('id',id).single(),supabase.from('company_members').select('role').eq('company_id',id).eq('user_id',session.user.id).single()]);setCompany(c||null);setRole(m?.role||'viewer')})()},[session?.user?.id])
 useEffect(()=>{const up=()=>setOnline(true),down=()=>setOnline(false);window.addEventListener('online',up);window.addEventListener('offline',down);offlineCount().then(setPending).catch(()=>{});return()=>{window.removeEventListener('online',up);window.removeEventListener('offline',down)}},[])
 const sync=async()=>{setBusy('sync');setPending(await offlineCount());setBusy('')}
 const notifications=async()=>{if(typeof Notification==='undefined')return;await Notification.requestPermission()}
 if(!visible||!session||!company||!['owner','admin'].includes(role))return null
 return createPortal(<><button type="button" className="mobile-owner-fab" onClick={()=>setOpen(true)}>Más</button>{open&&<div className="mobile-owner-backdrop" onMouseDown={()=>setOpen(false)}><section className="mobile-owner-panel" onMouseDown={e=>e.stopPropagation()}><header><div><small>IDEALO SV · APP ANDROID</small><strong>Gestión de empresa</strong></div><button type="button" onClick={()=>setOpen(false)}>×</button></header><main><MobileOwnerHub company={company} supabase={supabase} session={session} role={role} online={online} pending={pending} busy={busy} onSync={sync} onSignOut={()=>supabase.auth.signOut()} onNotifications={notifications}/></main></section></div>}</>,document.body)
}
