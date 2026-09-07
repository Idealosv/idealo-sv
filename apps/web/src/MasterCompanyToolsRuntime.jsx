import { useEffect } from 'react'
import { supabase } from './lib/supabase.js'

const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'')

export default function MasterCompanyToolsRuntime(){
 useEffect(()=>{
  if(window.location.pathname!=='/master'||!API||!supabase)return undefined
  let stopped=false
  let observer=null
  const request=async(path)=>{
   const {data:{session}}=await supabase.auth.getSession()
   if(!session?.access_token)throw new Error('Sesión administradora requerida.')
   const response=await fetch(`${API}${path}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'}})
   const body=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(body.message||'No se pudo completar la operación.')
   return body
  }
  const load=async()=>{
   const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)return
   const response=await fetch(`${API}/api/admin/saas/dashboard`,{headers:{Authorization:`Bearer ${session.access_token}`}});if(!response.ok)return
   const body=await response.json();const companies=body.companies||[]
   const install=()=>{
    document.querySelectorAll('.saas-master-table-wrap tbody tr').forEach(row=>{
     if(row.dataset.masterTools==='1')return
     const first=row.querySelector('td');const actions=row.querySelector('td:last-child');if(!first||!actions)return
     const company=companies.find(item=>first.textContent.trim().startsWith(item.name));if(!company)return
     row.dataset.masterTools='1'
     const wrap=document.createElement('div');wrap.className='master-company-tools';wrap.style.display='flex';wrap.style.gap='6px';wrap.style.flexWrap='wrap';wrap.style.marginTop='6px'
     const enter=document.createElement('button');enter.type='button';enter.textContent='Entrar a empresa';enter.style.background='#f97316';enter.style.color='#fff';enter.onclick=async()=>{enter.disabled=true;try{const result=await request(`/api/admin/saas/companies/${company.id}/access`);window.location.href=result.redirect||`/?company=${encodeURIComponent(company.id)}&master=1`}catch(error){window.alert(error.message)}finally{enter.disabled=false}}
     const access=document.createElement('button');access.type='button';access.textContent='Enviar acceso';access.onclick=async()=>{access.disabled=true;try{const result=await request(`/api/admin/saas/companies/${company.id}/owner-access`);window.alert(result.message||'Enlace de acceso enviado.')}catch(error){window.alert(error.message)}finally{access.disabled=false}}
     wrap.append(enter,access);actions.appendChild(wrap)
    })
   }
   install();observer=new MutationObserver(install);observer.observe(document.body,{childList:true,subtree:true})
  }
  load().catch(()=>null)
  return()=>{stopped=true;observer?.disconnect()}
 },[])
 return null
}
