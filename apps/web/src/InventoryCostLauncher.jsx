import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { ConsumptionCostsModule, ProfitabilityModule } from './InventoryCostModules.jsx'
import Inventory360Module from './Inventory360Module.jsx'
import InventoryControlCenter from './InventoryControlCenter.jsx'

const tabs=['Inventario','Consumo y costos','Rentabilidad']

export default function InventoryCostLauncher(){
  const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Inventario')
  useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
  useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='inventory')return;setTab(tabs.includes(d.tab)?d.tab:'Inventario');setOpen(true)};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
  if(!session||!company)return null
  const selectTab=(name)=>{setTab(name);window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'Inventario'}))}
  return <>
    <button type="button" onClick={()=>setOpen(true)} className="sidebar-module-access inventory" aria-label="Abrir inventario y costos"><span className="module-glyph">▦</span><span className="module-copy"><span>Inventario</span><small>Stock · Kardex · Reservas · Costos</small></span></button>
    {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Inventario, costos y rentabilidad" onMouseDown={e=>e.stopPropagation()}>
      <header className="erp-modal-head"><div><strong>Inventario</strong><small>Compra → entrada → bodega → reserva → producción → consumo → costo real</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
      <nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>selectTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav>
      <div className="erp-modal-body commercial-module">{tab==='Inventario'&&<><details className="module-secondary-tools"><summary>Ver control y alertas de inventario</summary><div className="module-secondary-tools-body"><InventoryControlCenter company={company} supabase={supabase}/></div></details><Inventory360Module company={company} supabase={supabase}/></>} {tab==='Consumo y costos'&&<ConsumptionCostsModule company={company} supabase={supabase}/>} {tab==='Rentabilidad'&&<ProfitabilityModule company={company} supabase={supabase}/>}</div>
    </section></div>}
  </>
}
