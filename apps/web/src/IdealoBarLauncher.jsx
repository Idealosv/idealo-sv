import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import IdealoBar from './IdealoBar.jsx'
import { confirmModule, subscribeNavigation } from './erp-navigation.js'

export default function IdealoBarLauncher(){
 const [session,setSession]=useState(null)
 const [company,setCompany]=useState(null)
 const [open,setOpen]=useState(false)
 const pendingNavigation=useRef(null)

 useEffect(()=>{
  if(!supabase)return
  supabase.auth.getSession().then(({data})=>setSession(data.session||null))
  const {data:listener}=supabase.auth.onAuthStateChange((_event,nextSession)=>setSession(nextSession))
  return()=>listener.subscription.unsubscribe()
 },[])

 useEffect(()=>{
  if(!session||!supabase){setCompany(null);return}
  const resolved=window.__IDEALO_ACTIVE_COMPANY__
  if(resolved?.id){setCompany(resolved);return}
  supabase.rpc('get_my_companies').then(async({data,error})=>{
   if(error||!data?.[0]?.id)return
   const {data:row}=await supabase.from('companies').select('*').eq('id',data[0].id).single()
   setCompany(row||null)
  })
 },[session])

 useEffect(()=>subscribeNavigation(navigation=>{
  if(navigation.status!=='requested'||navigation.target!=='bar')return
  pendingNavigation.current=navigation
  setOpen(true)
 }),[])

 useEffect(()=>{
  const navigation=pendingNavigation.current
  if(!navigation||!open||!session||!company)return
  window.requestAnimationFrame(()=>{
   if(pendingNavigation.current?.requestId===navigation.requestId){
    confirmModule(navigation.requestId,navigation.requestedModule)
    pendingNavigation.current=null
   }
  })
 },[open,session,company])

 if(!session||!company)return null
 return open?<div className="erp-modal-backdrop idealo-bar-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}>
  <section className="erp-modal-panel idealo-bar-modal" role="dialog" aria-modal="true" aria-label="IDEALO BAR" onMouseDown={event=>event.stopPropagation()}>
   <button type="button" className="erp-modal-close idealo-bar-close" aria-label="Cerrar IDEALO BAR" onClick={()=>setOpen(false)}>×</button>
   <IdealoBar company={company} supabase={supabase}/>
  </section>
 </div>:null
}
