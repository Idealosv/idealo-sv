import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { WorkOrdersModule } from './CommercialFlow.jsx'
import Products360Module from './Products360Module.jsx'
import ProductIntegrityCenter from './ProductIntegrityCenter.jsx'
import QuotesQuickModule from './QuotesQuickModule.jsx'
import Production360Module from './Production360Module.jsx'
import { DeliveriesModule, ReceivablesModule } from './DeliveryFinanceModules.jsx'
import { activateModule, confirmModule, subscribeNavigation } from './erp-navigation.js'

const operationViews=['Órdenes de trabajo','Producción','Entregas']
const journeySteps=[
 {id:'quote',label:'Cotización'},
 {id:'work-order',label:'OT'},
 {id:'production',label:'Producción'},
 {id:'agenda',label:'Agenda'},
 {id:'delivery',label:'Entrega'},
 {id:'billing',label:'Facturación'},
 {id:'collection',label:'Cobro'},
]

export default function CommercialLauncher() {
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Productos y trabajos'),[operationView,setOperationView]=useState('Órdenes de trabajo'),[contextClient,setContextClient]=useState({id:'',name:''}),[flowContext,setFlowContext]=useState({workOrderId:'',quoteId:''})
 const pendingNavigation=useRef(null)
 useEffect(()=>{if(!supabase)return undefined;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const{data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}const resolved=window.__IDEALO_ACTIVE_COMPANY__;if(resolved?.id){setCompany(resolved);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const{data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 const resolveDestination=name=>{if(operationViews.includes(name))return {tab:'Operación',operation:name};if(name==='Cuentas por cobrar')return{tab:'Cuentas por cobrar',operation:'Órdenes de trabajo'};if(name==='Cotizaciones')return{tab:'Cotizaciones',operation:'Órdenes de trabajo'};return{tab:'Productos y trabajos',operation:'Órdenes de trabajo'}}
 useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='commercial')return;const next=resolveDestination(d.tab);setContextClient({id:d.clientId||'',name:d.clientName||''});setFlowContext({workOrderId:d.workOrderId||'',quoteId:d.quoteId||''});setTab(next.tab);setOperationView(next.operation);setOpen(true)};window.addEventListener('idealo-open-client-context',fn);return()=>window.removeEventListener('idealo-open-client-context',fn)},[])
 useEffect(()=>subscribeNavigation(navigation=>{if(navigation.status!=='requested'||navigation.target!=='commercial')return;const next=resolveDestination(navigation.tab||'Productos y trabajos');const context=navigation.context||{};pendingNavigation.current=navigation;setContextClient({id:context.clientId||'',name:context.clientName||''});setFlowContext({workOrderId:context.workOrderId||'',quoteId:context.quoteId||''});setTab(next.tab);setOperationView(next.operation);setOpen(true)}),[])
 useEffect(()=>{const navigation=pendingNavigation.current;if(!navigation||!open||!session||!company)return;const expected=resolveDestination(navigation.tab||'Productos y trabajos');if(tab!==expected.tab||operationView!==expected.operation)return;window.requestAnimationFrame(()=>{if(pendingNavigation.current?.requestId===navigation.requestId){confirmModule(navigation.requestId,navigation.requestedModule);pendingNavigation.current=null}})},[open,session,company,tab,operationView])
 useEffect(()=>{const fn=e=>{const detail=e.detail||{};if(!detail.step)return;goJourney(detail.step,detail)};window.addEventListener('idealo-commercial-flow-next',fn);return()=>window.removeEventListener('idealo-commercial-flow-next',fn)},[flowContext])
 if(!session||!company)return null
 const openCatalog=()=>{setFlowContext({workOrderId:'',quoteId:''});setTab('Productos y trabajos');activateModule('Productos',{source:'commercial-tabs'})}
 const goJourney=(step,detail={})=>{
  const nextContext={workOrderId:detail.workOrderId||flowContext.workOrderId||'',quoteId:detail.quoteId||flowContext.quoteId||''}
  if(detail.workOrderId||detail.quoteId)setFlowContext(nextContext)
  if(step==='quote'){setOpen(true);setTab('Cotizaciones');activateModule('Cotizaciones',{source:'commercial-journey'});return}
  if(step==='work-order'){setOpen(true);setTab('Operación');setOperationView('Órdenes de trabajo');activateModule('Producción',{source:'commercial-journey'});return}
  if(step==='production'){setOpen(true);setTab('Operación');setOperationView('Producción');activateModule('Producción',{source:'commercial-journey'});return}
  if(step==='delivery'){setOpen(true);setTab('Operación');setOperationView('Entregas');activateModule('Producción',{source:'commercial-journey'});return}
  if(step==='collection'){setOpen(true);setTab('Cuentas por cobrar');activateModule('Cuentas por cobrar',{source:'commercial-journey'});return}
  if(step==='agenda'){setOpen(false);window.setTimeout(()=>window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target:'planning',workOrderId:nextContext.workOrderId}})),40);return}
  if(step==='billing'){setOpen(false);window.setTimeout(()=>window.dispatchEvent(new CustomEvent('idealo-open-module',{detail:{target:'billing',tab:'emitir',workOrderId:nextContext.workOrderId,quoteId:nextContext.quoteId}})),40)}
 }
 const activeJourney=tab==='Cotizaciones'?'quote':tab==='Cuentas por cobrar'?'collection':tab==='Operación'?(operationView==='Órdenes de trabajo'?'work-order':operationView==='Producción'?'production':'delivery'):''
 const title=tab==='Productos y trabajos'?'Catálogo':tab==='Cotizaciones'?'Cotizaciones':tab==='Cuentas por cobrar'?'Cobros':operationView
 return <><button type="button" onClick={()=>{setContextClient({id:'',name:''});setFlowContext({workOrderId:'',quoteId:''});setTab('Productos y trabajos');setOpen(true);activateModule('Productos',{source:'legacy-launcher'})}} className="sidebar-module-access commercial" aria-label="Abrir gestión comercial"><span className="module-glyph">◇</span><span className="module-copy"><span>Comercial</span><small>Catálogo · ventas · operación · cobro</small></span></button>{open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Gestión comercial y producción" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>{title}</strong><small>Un solo recorrido desde la cotización hasta el cobro</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header>
 <div className="commercial-flow-toolbar"><button type="button" className={tab==='Productos y trabajos'?'active':''} onClick={openCatalog}>Catálogo</button><div className="commercial-journey" aria-label="Recorrido comercial">{journeySteps.map((step,index)=><button type="button" key={step.id} className={activeJourney===step.id?'active':''} onClick={()=>goJourney(step.id)}><span>{index+1}</span><strong>{step.label}</strong></button>)}</div></div>
 <div className="erp-modal-body commercial-module">{contextClient.id&&<div className="billing-context-banner">Cliente activo: <strong>{contextClient.name||'cliente seleccionado'}</strong></div>}
 {tab==='Productos y trabajos'&&<><Products360Module company={company} supabase={supabase}/><details className="module-secondary-tools"><summary>Herramientas de revisión del catálogo</summary><div className="module-secondary-tools-body"><ProductIntegrityCenter company={company} supabase={supabase}/></div></details></>}
 {tab==='Cotizaciones'&&<QuotesQuickModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} 
 {tab==='Operación'&&<>{operationView==='Órdenes de trabajo'&&<WorkOrdersModule company={company} supabase={supabase} initialClientId={contextClient.id}/>} {operationView==='Producción'&&<Production360Module company={company} supabase={supabase} initialClientId={contextClient.id}/>} {operationView==='Entregas'&&<DeliveriesModule company={company} supabase={supabase} initialWorkOrderId={flowContext.workOrderId}/>}</>}
 {tab==='Cuentas por cobrar'&&<ReceivablesModule company={company} supabase={supabase} initialClientId={contextClient.id}/>}</div></section></div>}</>
}
