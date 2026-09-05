import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { WorkOrdersModule } from './CommercialFlow.jsx'
import Products360Module from './Products360Module.jsx'
import ProductIntegrityCenter from './ProductIntegrityCenter.jsx'
import QuotesQuickModule from './QuotesQuickModule.jsx'
import Production360Module from './Production360Module.jsx'
import ProductionControlCenter from './ProductionControlCenter.jsx'
import { DeliveriesModule, ReceivablesModule } from './DeliveryFinanceModules.jsx'

const tabs=['Productos y trabajos','Cotizaciones','Órdenes de trabajo','Producción','Entregas','Cuentas por cobrar']
const mainModuleForTab={ 'Productos y trabajos':'Productos', Cotizaciones:'Cotizaciones', Producción:'Producción' }

export default function CommercialLauncher() {
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Productos y trabajos'),[contextClient,setContextClient]=useState({id:'',name:''})
 useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const{data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const{data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='commercial')return;setContextClient({id:d.clientId||'',name:d.clientName||''});setTab(tabs.includes(d.tab)?d.tab:'Cotizaciones');setOpen(true)};window.addEventListener('idealo-open-client-context',fn);return()=>window.removeEventListener('idealo-open-client-context',fn)},[])
 useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='commercial')return;setContextClient({id:'',name:''});setTab(tabs.includes(d.tab)?d.tab:'Productos y trabajos');setOpen(true)};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
 if(!session||!company)return null
 const selectTab=(name)=>{setTab(name);const moduleName=mainModuleForTab[name];if(moduleName)window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:moduleName}))}
 return <><button type="button" onClick={()=>{setContextClient({id:'',name:''});setOpen(true)}} className="sidebar-module-access commercial" aria-label="Abrir gestión comercial"><span className="module-glyph">◇</span><span className="module-copy"><span>Operaciones comerciales</span><small>Ventas · Producción · Entregas · Cobros</small></span></button>{open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Gestión comercial y producción" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>{mainModuleForTab[tab]||'Operaciones comerciales'}</strong><small>Producto terminado → Cotización → Aprobación → Orden → Producción → Entrega → Facturación → Cobro</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(n=><button type="button" key={n} onClick={()=>selectTab(n)} className={`erp-module-tab ${tab===n?'active':''}`}>{n}</button>)}</nav><div className="erp-modal-body commercial-module">{contextClient.id&&<p className="feedback success">Cliente 360 activo: <strong>{contextClient.name||'cliente seleccionado'}</strong>.</p>}{tab==='Productos y trabajos'&&<><ProductIntegrityCenter company={company} supabase={supabase}/><Products360Module company={company} supabase={supabase}/></>} {tab==='Cotizaciones'&&<QuotesQuickModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} {tab==='Órdenes de trabajo'&&<WorkOrdersModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} {tab==='Producción'&&<><ProductionControlCenter company={company} supabase={supabase}/><Production360Module company={company} supabase={supabase} initialClientId={contextClient.id}/></>} {tab==='Entregas'&&<DeliveriesModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} {tab==='Cuentas por cobrar'&&<ReceivablesModule company={company} supabase={supabase} initialClientId={contextClient.id}/>}</div></section></div>}</>
}
