import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ExecutiveDashboard from './ExecutiveDashboard.jsx'
import DashboardIntelligence from './DashboardIntelligence.jsx'
import DashboardAdvancedInsights from './DashboardAdvancedInsights.jsx'
import DashboardOwnerDailyControl from './DashboardOwnerDailyControl.jsx'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true}}):null

export default function ExecutiveDashboardHost(){
  const [content,setContent]=useState(null)
  const [company,setCompany]=useState(null)
  const [visible,setVisible]=useState(true)

  useEffect(()=>{
    const find=()=>setContent(document.querySelector('.erp-content'))
    find();const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()
  },[])

  useEffect(()=>{
    const onModule=(event)=>setVisible(event.detail==='Dashboard')
    window.addEventListener('idealo-module-change',onModule)
    return()=>window.removeEventListener('idealo-module-change',onModule)
  },[])

  useEffect(()=>{
    if(!supabase)return undefined
    const load=async()=>{const {data:sessionData}=await supabase.auth.getSession();if(!sessionData.session){setCompany(null);return}const {data}=await supabase.rpc('get_my_companies');const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)}
    load();const {data:listener}=supabase.auth.onAuthStateChange(()=>load());return()=>listener.subscription.unsubscribe()
  },[])

  if(!content||!visible||!company||!supabase)return null
  return createPortal(<div className="executive-dashboard-host"><DashboardOwnerDailyControl company={company} supabase={supabase}/><DashboardIntelligence company={company} supabase={supabase}/><DashboardAdvancedInsights company={company} supabase={supabase}/><ExecutiveDashboard company={company} supabase={supabase}/></div>,content)
}
