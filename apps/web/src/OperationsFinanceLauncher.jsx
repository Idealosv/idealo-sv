import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { CashModule, PurchasesExpensesModule } from './OperationsFinanceModules.jsx'
import SuppliersDirectoryModule from './SuppliersDirectoryModule.jsx'
import SupplierPayablesModule from './SupplierPayablesModule.jsx'
import ReplenishmentModule from './ReplenishmentModule.jsx'
import PurchaseReceivingModule from './PurchaseReceivingModule.jsx'
import ProcurementControlCenter from './ProcurementControlCenter.jsx'
import CashControlCenter from './CashControlCenter.jsx'

const tabs=['Control','Proveedores','Reposición','Recepción','Compras y gastos','Cuentas por pagar','Caja']
const menuForTab=name=>name==='Proveedores'?'Proveedores':name==='Caja'?'Caja':'Compras'
export default function OperationsFinanceLauncher(){
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Control')
 useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 useEffect(()=>{const fn=event=>{const d=event.detail||{};if(d.target!=='procurement')return;const next=tabs.includes(d.tab)?d.tab:'Control';setTab(next);setOpen(true);window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:menuForTab(next)}))};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
 if(!session||!company)return null
 const selectTab=name=>{setTab(name);window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:menuForTab(name)}))}
 const openReports=()=>window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target:'financial'}}))
 return <><button type="button" onClick={()=>{setOpen(true);setTab('Control');window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'Compras'}))}} className="sidebar-module-access procurement" aria-label="Abrir abastecimiento y finanzas"><span className="module-glyph">$</span><span className="module-copy"><span>Abastecimiento y caja</span><small>Reposición · Recepción · Compras · CxP · Proveedores · Caja</small></span></button>
 {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Abastecimiento y finanzas" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Abastecimiento y finanzas</strong><small>Necesidad → reposición → compra → recepción → cuenta por pagar → pago → salida de caja</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>selectTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav><div className="erp-modal-body commercial-module">{tab==='Control'&&<ProcurementControlCenter company={company} supabase={supabase} onOpen={selectTab}/>} {tab==='Proveedores'&&<SuppliersDirectoryModule company={company} supabase={supabase}/>} {tab==='Reposición'&&<ReplenishmentModule company={company} supabase={supabase}/>} {tab==='Recepción'&&<PurchaseReceivingModule company={company} supabase={supabase}/>} {tab==='Compras y gastos'&&<PurchasesExpensesModule company={company} supabase={supabase}/>} {tab==='Cuentas por pagar'&&<SupplierPayablesModule company={company} supabase={supabase}/>} {tab==='Caja'&&<><CashControlCenter company={company} supabase={supabase} onOpenReports={openReports}/><details className="cash-admin-tools"><summary>Administrar cuentas y movimientos manuales</summary><div className="cash-admin-tools-body"><CashModule company={company} supabase={supabase}/></div></details></>}</div></section></div>}</>
}
