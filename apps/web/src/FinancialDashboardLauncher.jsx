import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import FinancialDashboard from './FinancialDashboard.jsx'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true}}):null

export default function FinancialDashboardLauncher(){
  const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false)
  useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
  useEffect(()=>{const onOpen=e=>{const d=e.detail||{};if(d.target!=='financial')return;setOpen(true)};window.addEventListener('idealo-open-module',onOpen);return()=>window.removeEventListener('idealo-open-module',onOpen)},[])
  if(!session||!company)return null
  return <>
    <button type="button" onClick={()=>{setOpen(true);window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'Reportes'}))}} className="sidebar-module-access financial" aria-label="Abrir reportes financieros">
      <span className="module-glyph">▥</span><span className="module-copy"><span>Reportes</span><small>Resultados · Liquidez · Rentabilidad</small></span>
    </button>
    {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Reportes financieros" onMouseDown={e=>e.stopPropagation()}>
      <header className="erp-modal-head"><div><strong>Reportes</strong><small>Ventas → costos → gastos → utilidad → caja y obligaciones</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
      <div className="erp-modal-body commercial-module"><FinancialDashboard company={company} supabase={supabase}/></div>
    </section></div>}
  </>
}
