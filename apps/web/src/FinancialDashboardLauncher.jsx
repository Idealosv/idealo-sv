import { useEffect,useState } from 'react'
import { supabase } from './lib/supabase.js'
import FinancialDashboard from './FinancialDashboard.jsx'
import CashReconciliationPanel from './CashReconciliationPanel.jsx'
const tabs=['Resultados','Liquidez','Flujo de efectivo','Rentabilidad','Conciliación']
export default function FinancialDashboardLauncher(){
 const [session,setSession]=useState(null),[company,setCompany]=useState(null),[open,setOpen]=useState(false),[tab,setTab]=useState('Resultados')
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session||null));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>l.subscription.unsubscribe()},[])
 useEffect(()=>{if(!session||!supabase){setCompany(null);return}supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)})},[session])
 useEffect(()=>{const fn=e=>{const d=e.detail||{};if(d.target!=='financial')return;setOpen(true);if(tabs.includes(d.tab))setTab(d.tab)};window.addEventListener('idealo-open-module',fn);return()=>window.removeEventListener('idealo-open-module',fn)},[])
 if(!session||!company)return null
 return <><button type="button" onClick={()=>{setOpen(true);setTab('Resultados');window.dispatchEvent(new CustomEvent('idealo-module-change',{detail:'Reportes'}))}} className="sidebar-module-access financial" aria-label="Abrir reportes financieros"><span className="module-glyph">▥</span><span className="module-copy"><span>Reportes</span><small>Resultados · Liquidez · Flujo · Rentabilidad · Conciliación</small></span></button>{open&&<div className="erp-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="erp-modal-panel" role="dialog" aria-modal="true" aria-label="Reportes financieros" onMouseDown={e=>e.stopPropagation()}><header className="erp-modal-head"><div><strong>Reportes</strong><small>Información gerencial organizada por objetivo</small></div><button type="button" className="erp-modal-close" onClick={()=>setOpen(false)}>×</button></header><nav className="erp-module-tabs">{tabs.map(x=><button type="button" key={x} className={`erp-module-tab ${tab===x?'active':''}`} onClick={()=>setTab(x)}>{x}</button>)}</nav><div className="erp-modal-body commercial-module">{tab==='Conciliación'?<CashReconciliationPanel company={company} supabase={supabase}/>:<FinancialDashboard company={company} supabase={supabase} view={tab}/>}</div></section></div>}</>
}
