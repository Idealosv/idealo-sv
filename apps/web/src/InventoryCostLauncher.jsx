import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { ConsumptionCostsModule, ProfitabilityModule } from './InventoryCostModules.jsx'
import Inventory360Module from './Inventory360Module.jsx'
import InventoryControlCenter from './InventoryControlCenter.jsx'
import { activateModule, confirmModule, subscribeNavigation } from './erp-navigation.js'

const tabs=['Inventario','Consumo y costos','Rentabilidad']

export default function InventoryCostLauncher(){
  const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Inventario')
  const pendingNavigation=useRef(null)
  useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session||!supabase){setCompany(null);return}const resolved=window.__IDEALO_ACTIVE_COMPANY__;if(resolved?.id){setCompany(resolved);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
  useEffect(()=>subscribeNavigation(navigation=>{if(navigation.status!=='requested'||navigation.target!=='inventory')return;pendingNavigation.current=navigation;setTab(tabs.includes(navigation.tab)?navigation.tab:'Inventario');setOpen(true)}),[])
  useEffect(()=>{const navigation=pendingNavigation.current;if(!navigation||!open||!session||!company)return;const expected=tabs.includes(navigation.tab)?navigation.tab:'Inventario';if(tab!==expected)return;window.requestAnimationFrame(()=>{if(pendingNavigation.current?.requestId===navigation.requestId){confirmModule(navigation.requestId,navigation.requestedModule);pendingNavigation.current=null}})},[open,session,company,tab])
  if(!session||!company)return null
  const selectTab=(name)=>{setTab(name);activateModule('Inventario',{source:'inventory-tabs'})}
  return <>
    <button type="button" onClick={()=>{setTab('Inventario');setOpen(true);activateModule('Inventario',{source:'legacy-launcher'})}} className="sidebar-module-access inventory" aria-label="Abrir inventario y costos"><span className="module-glyph">▦</span><span className="module-copy"><span>Inventario</span><small>Stock · Kardex · Reservas · Costos</small></span></button>
    {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Inventario, costos y rentabilidad" onMouseDown={e=>e.stopPropagation()}>
      <header className="erp-modal-head"><div><strong>Inventario</strong><small>Compra → entrada → bodega → reserva → producción → consumo → costo real</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
      <nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>selectTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav>
      <div className="erp-modal-body commercial-module">{tab==='Inventario'&&<><details className="module-secondary-tools"><summary>Ver control y alertas de inventario</summary><div className="module-secondary-tools-body"><InventoryControlCenter company={company} supabase={supabase}/></div></details><Inventory360Module company={company} supabase={supabase}/></>} {tab==='Consumo y costos'&&<ConsumptionCostsModule company={company} supabase={supabase}/>} {tab==='Rentabilidad'&&<ProfitabilityModule company={company} supabase={supabase}/>}</div>
    </section></div>}
  </>
}
