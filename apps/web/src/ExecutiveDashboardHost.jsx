import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ExecutiveDashboard from './ExecutiveDashboard.jsx'
import DashboardOwnerDailyControl from './DashboardOwnerDailyControl.jsx'
import FinancialAlertsDashboard from './FinancialAlertsDashboard.jsx'
import { supabase } from './lib/supabase.js'

export default function ExecutiveDashboardHost(){
  const [content,setContent]=useState(null),[company,setCompany]=useState(()=>window.__IDEALO_ACTIVE_COMPANY__||null),[visible,setVisible]=useState(true),[loadingCompany,setLoadingCompany]=useState(()=>!window.__IDEALO_ACTIVE_COMPANY__),[loadError,setLoadError]=useState(''),[expanded,setExpanded]=useState(false)
  useEffect(()=>{let attempts=0;const find=()=>{const target=document.querySelector('.erp-content');if(target){setContent(target);return true}return false};if(find())return undefined;const timer=window.setInterval(()=>{attempts+=1;if(find()||attempts>=40)window.clearInterval(timer)},250);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{const onModule=(event)=>{const isDashboard=event.detail==='Dashboard';setVisible(isDashboard);if(!isDashboard)setExpanded(false)};window.addEventListener('idealo-module-change',onModule);return()=>window.removeEventListener('idealo-module-change',onModule)},[])
  useEffect(()=>{
    let active=true
    const onCompany=(event)=>{if(!active)return;setCompany(event.detail||null);setLoadingCompany(false);setLoadError('')}
    window.addEventListener('idealo-company-resolved',onCompany)
    const resolved=window.__IDEALO_ACTIVE_COMPANY__
    if(resolved){setCompany(resolved);setLoadingCompany(false);setLoadError('')}
    else if(!supabase){setLoadingCompany(false);setLoadError('No se pudo inicializar la conexión del Dashboard.')}
    else {
      const recover=async()=>{
        setLoadingCompany(true);setLoadError('')
        try{
          const {data:sessionData,error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError
          const session=sessionData.session
          if(!session){if(active)setCompany(null);return}
          let resolvedCompany=null
          const {data,error}=await supabase.rpc('get_my_companies')
          if(!error&&data?.[0]?.id){
            const {data:row,error:companyError}=await supabase.from('companies').select('*').eq('id',data[0].id).single();if(companyError)throw companyError;resolvedCompany=row||null
          } else {
            const {data:memberships,error:memberError}=await supabase.from('company_members').select('company_id, companies(*)').eq('user_id',session.user.id).limit(1)
            if(memberError)throw memberError
            const companyRow=Array.isArray(memberships?.[0]?.companies)?memberships[0].companies[0]:memberships?.[0]?.companies
            resolvedCompany=companyRow||null
          }
          if(active){setCompany(resolvedCompany);if(resolvedCompany){window.__IDEALO_ACTIVE_COMPANY__=resolvedCompany}}
        }catch(error){if(active)setLoadError('No pudimos cargar el Dashboard. Reintentá en unos segundos.')}finally{if(active)setLoadingCompany(false)}
      }
      recover()
    }
    return()=>{active=false;window.removeEventListener('idealo-company-resolved',onCompany)}
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
