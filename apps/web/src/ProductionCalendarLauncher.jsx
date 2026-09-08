import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import ProductionCalendar from './ProductionCalendar.jsx'
import { activateModule, confirmModule, subscribeNavigation } from './erp-navigation.js'

export default function ProductionCalendarLauncher(){
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false)
 const pendingNavigation=useRef(null)
 useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}const resolved=window.__IDEALO_ACTIVE_COMPANY__;if(resolved?.id){setCompany(resolved);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 useEffect(()=>subscribeNavigation(navigation=>{if(navigation.status!=='requested'||navigation.target!=='planning')return;pendingNavigation.current=navigation;setOpen(true)}),[])
 useEffect(()=>{const navigation=pendingNavigation.current;if(!navigation||!open||!session||!company)return;window.requestAnimationFrame(()=>{if(pendingNavigation.current?.requestId===navigation.requestId){confirmModule(navigation.requestId,navigation.requestedModule);pendingNavigation.current=null}})},[open,session,company])
 if(!session||!company)return null
 return <><button type="button" onClick={()=>{setOpen(true);activateModule('Agenda',{source:'legacy-launcher'})}} className="sidebar-module-access planning"><span className="module-glyph">▦</span><span className="module-copy"><span>Planificación</span><small>Calendario · Personal · Entregas</small></span></button>{open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Planificación de producción" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Agenda</strong><small>Órdenes → agenda → equipo → entregas e instalaciones</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><div className="erp-modal-body commercial-module"><ProductionCalendar company={company} supabase={supabase}/></div></section></div>}</>
}
