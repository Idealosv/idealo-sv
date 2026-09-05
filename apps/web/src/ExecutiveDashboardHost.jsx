import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ExecutiveDashboard from './ExecutiveDashboard.jsx'
import DashboardOwnerDailyControl from './DashboardOwnerDailyControl.jsx'
import FinancialAlertsDashboard from './FinancialAlertsDashboard.jsx'

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true}}):null

export default function ExecutiveDashboardHost(){
  const [content,setContent]=useState(null),[company,setCompany]=useState(null),[visible,setVisible]=useState(true),[loadingCompany,setLoadingCompany]=useState(true),[loadError,setLoadError]=useState(''),[expanded,setExpanded]=useState(false)
  useEffect(()=>{let attempts=0;const find=()=>{const target=document.querySelector('.erp-content');if(target){setContent(target);return true}return false};if(find())return undefined;const timer=window.setInterval(()=>{attempts+=1;if(find()||attempts>=40)window.clearInterval(timer)},250);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{const onModule=(event)=>{const isDashboard=event.detail==='Dashboard';setVisible(isDashboard);if(!isDashboard)setExpanded(false)};window.addEventListener('idealo-module-change',onModule);return()=>window.removeEventListener('idealo-module-change',onModule)},[])
  useEffect(()=>{
    if(!supabase){setLoadingCompany(false);setLoadError('No se pudo inicializar la conexión del Dashboard.');return undefined}
    let active=true
    const load=async()=>{setLoadingCompany(true);setLoadError('');try{const {data:sessionData,error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError;if(!sessionData.session){if(active)setCompany(null);return}const {data,error}=await supabase.rpc('get_my_companies');if(error)throw error;const id=data?.[0]?.id;if(!id){if(active)setLoadError('Tu cuenta todavía no tiene una empresa disponible para mostrar el Dashboard.');return}const {data:row,error:companyError}=await supabase.from('companies').select('*').eq('id',id).single();if(companyError)throw companyError;if(active)setCompany(row||null)}catch(error){if(active)setLoadError('No pudimos cargar el Dashboard. Reintentá en unos segundos.')}finally{if(active)setLoadingCompany(false)}}
    load();const {data:listener}=supabase.auth.onAuthStateChange(()=>load());return()=>{active=false;listener.subscription.unsubscribe()}
  },[])
  if(!content||!visible)return null
  if(loadingCompany)return createPortal(<section className="executive-dashboard-host"><div className="panel empty-state"><strong>Preparando el Dashboard ejecutivo…</strong><small>Estamos reuniendo ventas, producción, caja, cartera e inventario de tu empresa.</small></div></section>,content)
  if(loadError)return createPortal(<section className="executive-dashboard-host"><div className="panel empty-state"><strong>Dashboard temporalmente no disponible</strong><small>{loadError}</small></div></section>,content)
  if(!company||!supabase)return null
  return createPortal(<div className="executive-dashboard-host dashboard-clean-view">
    <FinancialAlertsDashboard company={company} supabase={supabase}/>
    <DashboardOwnerDailyControl company={company} supabase={supabase}/>
    <section className="dashboard-detail-gate" aria-label="Análisis detallado del negocio">
      <div><p className="form-kicker">ANÁLISIS DEL NEGOCIO</p><h2>{expanded?'Detalle ejecutivo':'Más información cuando la necesités'}</h2><p>{expanded?'Ventas, producción, caja, inventario, compras y facturación en una sola vista.':'El Dashboard principal queda enfocado en alertas y decisiones. Los indicadores extensos se muestran solo bajo demanda.'}</p></div>
      <button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?'Ocultar análisis':'Ver análisis completo'}</button>
    </section>
    {expanded&&<div className="dashboard-expanded-analysis"><ExecutiveDashboard company={company} supabase={supabase}/></div>}
  </div>,content)
}
