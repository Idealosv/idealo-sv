import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { CashModule, PurchasesExpensesModule, SuppliersModule } from './OperationsFinanceModules.jsx'
import SupplierPayablesModule from './SupplierPayablesModule.jsx'
import ReplenishmentModule from './ReplenishmentModule.jsx'
import PurchaseReceivingModule from './PurchaseReceivingModule.jsx'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true}}):null

const tabs=['Proveedores','Reposición','Recepción','Compras y gastos','Cuentas por pagar','Caja']
const menuForTab=(name)=>name==='Proveedores'?'Proveedores':name==='Caja'?'Caja':'Compras'

export default function OperationsFinanceLauncher(){
  const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Proveedores')
  useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
  useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
  useEffect(()=>{const fn=(event)=>{const detail=event.detail||{};if(detail.target!=='procurement')return;const next=tabs.includes(detail.tab)?detail.tab:'Proveedores';setTab(next);setOpen(true);window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:menuForTab(next)}))};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
  if(!session||!company)return null
  const selectTab=(name)=>{setTab(name);window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:menuForTab(name)}))}
  return <>
    <button type="button" onClick={()=>{setOpen(true);setTab('Proveedores');window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'Proveedores'}))}} className="sidebar-module-access procurement" aria-label="Abrir abastecimiento y finanzas">
      <span className="module-glyph">$</span><span className="module-copy"><span>Abastecimiento y caja</span><small>Reposición · Recepción · Compras · CxP · Proveedores · Caja</small></span>
    </button>
    {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Abastecimiento y finanzas" onMouseDown={e=>e.stopPropagation()}>
      <header className="erp-modal-head"><div><strong>Abastecimiento y finanzas</strong><small>Necesidad → reposición → compra → recepción → cuenta por pagar → pago → salida de caja</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
      <nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>selectTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav>
      <div className="erp-modal-body commercial-module">{tab==='Proveedores'&&<SuppliersModule company={company} supabase={supabase}/>} {tab==='Reposición'&&<ReplenishmentModule company={company} supabase={supabase}/>} {tab==='Recepción'&&<PurchaseReceivingModule company={company} supabase={supabase}/>} {tab==='Compras y gastos'&&<PurchasesExpensesModule company={company} supabase={supabase}/>} {tab==='Cuentas por pagar'&&<SupplierPayablesModule company={company} supabase={supabase}/>} {tab==='Caja'&&<CashModule company={company} supabase={supabase}/>}</div>
    </section></div>}
  </>
}
