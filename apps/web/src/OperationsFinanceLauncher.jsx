import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { CashModule } from './OperationsFinanceModules.jsx'
import PurchasesExpensesModule from './PurchasesExpensesCashModule.jsx'
import SuppliersDirectoryModule from './SuppliersDirectoryModule.jsx'
import SupplierPayablesModule from './SupplierPayablesModule.jsx'
import ReplenishmentModule from './ReplenishmentModule.jsx'
import PurchaseReceivingModule from './PurchaseReceivingModule.jsx'
import ProcurementControlCenter from './ProcurementControlCenter.jsx'
import CashControlCenter from './CashControlCenter.jsx'
import { activateModule, confirmModule, subscribeNavigation } from './erp-navigation.js'

const tabs=['Control','Proveedores','Compras','Cuentas por pagar','Caja']
const purchaseViews=['Reposición','Recepción','Compras y gastos']
const menuForTab=name=>name==='Proveedores'?'Proveedores':name==='Caja'?'Caja':'Compras'
const destination=requested=>purchaseViews.includes(requested)?{tab:'Compras',purchaseView:requested}:{tab:tabs.includes(requested)?requested:'Control',purchaseView:'Compras y gastos'}

export default function OperationsFinanceLauncher(){
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Control'),[purchaseView,setPurchaseView]=useState('Compras y gastos')
 const pendingNavigation=useRef(null)
 useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}const resolved=window.__IDEALO_ACTIVE_COMPANY__;if(resolved?.id){setCompany(resolved);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 useEffect(()=>subscribeNavigation(navigation=>{if(navigation.status!=='requested'||navigation.target!=='procurement')return;const next=destination(navigation.tab||'Control');pendingNavigation.current=navigation;setTab(next.tab);setPurchaseView(next.purchaseView);setOpen(true)}),[])
 useEffect(()=>{const navigation=pendingNavigation.current;if(!navigation||!open||!session||!company)return;const expected=destination(navigation.tab||'Control');if(tab!==expected.tab)return;if(expected.tab==='Compras'&&purchaseView!==expected.purchaseView)return;window.requestAnimationFrame(()=>{if(pendingNavigation.current?.requestId===navigation.requestId){confirmModule(navigation.requestId,navigation.requestedModule);pendingNavigation.current=null}})},[open,session,company,tab,purchaseView])
 if(!session||!company)return null
 const selectTab=name=>{setTab(name);activateModule(menuForTab(name),{source:'procurement-tabs'})}
 const selectPurchaseView=name=>{setPurchaseView(name);activateModule('Compras',{source:'purchase-subnav'})}
 const openReports=()=>window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target:'financial'}}))
 return <><button type="button" onClick={()=>{setOpen(true);setTab('Control');activateModule('Compras',{source:'legacy-launcher'})}} className="sidebar-module-access procurement" aria-label="Abrir abastecimiento y finanzas"><span className="module-glyph">$</span><span className="module-copy"><span>Abastecimiento y caja</span><small>Compras · Proveedores · CxP · Caja</small></span></button>
 {open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Abastecimiento y finanzas" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Abastecimiento y finanzas</strong><small>Necesidad → compra → recepción → pago → caja</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(name=><button type="button" key={name} onClick={()=>selectTab(name)} className={`erp-module-tab ${tab===name?'active':''}`}>{name}</button>)}</nav><div className="erp-modal-body commercial-module">
 {tab==='Control'&&<ProcurementControlCenter company={company} supabase={supabase} onOpen={name=>{if(purchaseViews.includes(name)){setTab('Compras');selectPurchaseView(name)}else selectTab(name)}}/>}
 {tab==='Proveedores'&&<SuppliersDirectoryModule company={company} supabase={supabase}/>} 
 {tab==='Compras'&&<><div className="compact-subnav" role="tablist" aria-label="Etapa de compras">{purchaseViews.map(name=><button type="button" key={name} className={purchaseView===name?'active':''} onClick={()=>selectPurchaseView(name)}>{name}</button>)}</div>{purchaseView==='Reposición'&&<ReplenishmentModule company={company} supabase={supabase}/>} {purchaseView==='Recepción'&&<PurchaseReceivingModule company={company} supabase={supabase}/>} {purchaseView==='Compras y gastos'&&<PurchasesExpensesModule company={company} supabase={supabase}/>}</>}
 {tab==='Cuentas por pagar'&&<SupplierPayablesModule company={company} supabase={supabase}/>} 
 {tab==='Caja'&&<><CashControlCenter company={company} supabase={supabase} onOpenReports={openReports}/><details className="cash-admin-tools"><summary>Administrar cuentas y movimientos manuales</summary><div className="cash-admin-tools-body"><CashModule company={company} supabase={supabase}/></div></details></>}
 </div></section></div>}</>
}
