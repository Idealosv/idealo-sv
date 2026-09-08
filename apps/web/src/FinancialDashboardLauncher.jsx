import { useEffect,useRef,useState } from 'react'
import { supabase } from './lib/supabase.js'
import FinancialDashboard from './FinancialDashboard.jsx'
import FinancialReportsCenter from './FinancialReportsCenter.jsx'
import CashReconciliationPanel from './CashReconciliationPanel.jsx'
import { activateModule, confirmModule, subscribeNavigation } from './erp-navigation.js'

const tabs=['Resumen','Análisis','Conciliación']
const analysisViews=['Resultados','Liquidez','Flujo de efectivo','Rentabilidad']
const destination=requested=>requested==='Ejecutivo'||requested==='Resumen'||!requested?{tab:'Resumen',analysis:'Resultados'}:requested==='Conciliación'?{tab:'Conciliación',analysis:'Resultados'}:analysisViews.includes(requested)?{tab:'Análisis',analysis:requested}:{tab:'Resumen',analysis:'Resultados'}

export default function FinancialDashboardLauncher(){
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Resumen'),[analysisView,setAnalysisView]=useState('Resultados')
 const pendingNavigation=useRef(null)
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}const resolved=window.__IDEALO_ACTIVE_COMPANY__;if(resolved?.id){setCompany(resolved);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 useEffect(()=>subscribeNavigation(navigation=>{if(navigation.status!=='requested'||navigation.target!=='financial')return;const next=destination(navigation.tab);pendingNavigation.current=navigation;setTab(next.tab);setAnalysisView(next.analysis);setOpen(true)}),[])
 useEffect(()=>{const navigation=pendingNavigation.current;if(!navigation||!open||!session||!company)return;const expected=destination(navigation.tab);if(tab!==expected.tab||(tab==='Análisis'&&analysisView!==expected.analysis))return;window.requestAnimationFrame(()=>{if(pendingNavigation.current?.requestId===navigation.requestId){confirmModule(navigation.requestId,navigation.requestedModule);pendingNavigation.current=null}})},[open,session,company,tab,analysisView])
 if(!session||!company)return null
 const selectTab=name=>{setTab(name);activateModule('Reportes',{source:'financial-tabs'})}
 return <><button type="button" onClick={()=>{setOpen(true);setTab('Resumen');activateModule('Reportes',{source:'legacy-launcher'})}} className="sidebar-module-access financial" aria-label="Abrir reportes financieros"><span className="module-glyph">▥</span><span className="module-copy"><span>Reportes</span><small>Resumen · Análisis · Conciliación</small></span></button>{open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Reportes financieros" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Reportes</strong><small>Una vista principal y análisis cuando los necesités</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(x=><button type="button" key={x} className={`erp-module-tab ${tab===x?'active':''}`} onClick={()=>selectTab(x)}>{x}</button>)}</nav><div className="erp-modal-body commercial-module">{tab==='Resumen'?<FinancialReportsCenter company={company} supabase={supabase}/>:tab==='Conciliación'?<CashReconciliationPanel company={company} supabase={supabase}/>:<><div className="compact-subnav" role="tablist" aria-label="Tipo de análisis">{analysisViews.map(view=><button type="button" key={view} className={analysisView===view?'active':''} onClick={()=>{setAnalysisView(view);activateModule('Reportes',{source:'financial-analysis'})}}>{view}</button>)}</div><FinancialDashboard company={company} supabase={supabase} view={analysisView}/></>}</div></section></div>}</>
}
