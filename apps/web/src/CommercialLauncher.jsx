import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { WorkOrdersModule } from './CommercialFlow.jsx'
import Products360Module from './Products360Module.jsx'
import ProductIntegrityCenter from './ProductIntegrityCenter.jsx'
import QuotesQuickModule from './QuotesQuickModule.jsx'
import Production360Module from './Production360Module.jsx'
import { DeliveriesModule, ReceivablesModule } from './DeliveryFinanceModules.jsx'

const tabs=['Productos y trabajos','Cotizaciones','Operación','Cuentas por cobrar']
const operationViews=['Órdenes de trabajo','Producción','Entregas']
const mainModuleForTab={ 'Productos y trabajos':'Productos', Cotizaciones:'Cotizaciones', Operación:'Producción' }

export default function CommercialLauncher() {
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Productos y trabajos'),[operationView,setOperationView]=useState('Órdenes de trabajo'),[contextClient,setContextClient]=useState({id:'',name:''})
 useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const{data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const{data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 const resolveDestination=name=>{if(operationViews.includes(name))return {tab:'Operación',operation:name};return {tab:tabs.includes(name)?name:'Cotizaciones',operation:'Órdenes de trabajo'}}
 useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='commercial')return;const next=resolveDestination(d.tab);setContextClient({id:d.clientId||'',name:d.clientName||''});setTab(next.tab);setOperationView(next.operation);setOpen(true)};window.addEventListener('idealo-open-client-context',fn);return()=>window.removeEventListener('idealo-open-client-context',fn)},[])
 useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='commercial')return;const next=resolveDestination(d.tab||'Productos y trabajos');setContextClient({id:'',name:''});setTab(next.tab);setOperationView(next.operation);setOpen(true)};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
 if(!session||!company)return null
 const selectTab=(name)=>{setTab(name);const moduleName=mainModuleForTab[name];if(moduleName)window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:moduleName}))}
 return <><button type="button" onClick={()=>{setContextClient({id:'',name:''});setOpen(true)}} className="sidebar-module-access commercial" aria-label="Abrir gestión comercial"><span className="module-glyph">◇</span><span className="module-copy"><span>Operaciones comerciales</span><small>Productos · Ventas · Operación · Cobros</small></span></button>{open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Gestión comercial y producción" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>{mainModuleForTab[tab]||'Operaciones comerciales'}</strong><small>Producto → cotización → operación → entrega → cobro</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(n=><button type="button" key={n} onClick={()=>selectTab(n)} className={`erp-module-tab ${tab===n?'active':''}`}>{n}</button>)}</nav><div className="erp-modal-body commercial-module">{contextClient.id&&<p className="feedback success">Cliente 360 activo: <strong>{contextClient.name||'cliente seleccionado'}</strong>.</p>}
 {tab==='Productos y trabajos'&&<><details className="module-secondary-tools"><summary>Revisar integridad del catálogo</summary><div className="module-secondary-tools-body"><ProductIntegrityCenter company={company} supabase={supabase}/></div></details><Products360Module company={company} supabase={supabase}/></>}
 {tab==='Cotizaciones'&&<QuotesQuickModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} 
 {tab==='Operación'&&<><div className="compact-subnav" role="tablist" aria-label="Etapa operativa">{operationViews.map(name=><button type="button" key={name} className={operationView===name?'active':''} onClick={()=>setOperationView(name)}>{name}</button>)}</div>{operationView==='Órdenes de trabajo'&&<WorkOrdersModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} {operationView==='Producción'&&<Production360Module company={company} supabase={supabase} initialClientId={contextClient.id}/>} {operationView==='Entregas'&&<DeliveriesModule company={company} supabase={supabase} initialClientId={contextClient.id}/>}</>}
 {tab==='Cuentas por cobrar'&&<ReceivablesModule company={company} supabase={supabase} initialClientId={contextClient.id}/>}</div></section></div>}</>
}
