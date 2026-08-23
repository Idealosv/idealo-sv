import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { ConsumptionCostsModule, ProfitabilityModule } from './InventoryCostModules.jsx'
import Inventory360Module from './Inventory360Module.jsx'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true}}):null

export default function InventoryCostLauncher(){
  const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Inventario')
  useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
  if(!session||!company)return null
  const tabs=['Inventario','Consumo y costos','Rentabilidad']
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="sidebar-module-access inventory" aria-label="Abrir inventario y costos">
      <span className="module-glyph">▦</span><span className="module-copy"><span>Inventario</span><small>Stock · Kardex · Reservas · Costos</small></span>
    </button>
    {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Inventario, costos y rentabilidad" onMouseDown={e=>e.stopPropagation()}>
      <header className="erp-modal-head"><div><strong>Inventario 360</strong><small>Compra → entrada → bodega → reserva → producción → consumo → costo real</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
      <nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>setTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav>
      <div className="erp-modal-body commercial-module">{tab==='Inventario'&&<Inventory360Module company={company} supabase={supabase}/>} {tab==='Consumo y costos'&&<ConsumptionCostsModule company={company} supabase={supabase}/>} {tab==='Rentabilidad'&&<ProfitabilityModule company={company} supabase={supabase}/>}</div>
    </section></div>}
  </>
}
