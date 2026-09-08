import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { canAccessModule, isReadOnlyRole, moduleFromOpenDetail, ROLE_LABEL } from './erp-access-control.js'

const API=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'')
const MUTATION_WORDS=['guardar','crear','nuevo','nueva','agregar','añadir','eliminar','borrar','anular','revocar','autorizar','aprobar','rechazar','emitir','facturar','cobrar','pagar','registrar','actualizar','editar','modificar','enviar invitación','procesar']
const SAFE_WORDS=['cerrar','volver','cancelar','buscar','filtrar','ver','detalle','detalles','actualizar lista','refrescar','descargar','imprimir']
const MODULE_CODE={Dashboard:'DASHBOARD',Clientes:'CLIENTS',Cotizaciones:'QUOTES',Producción:'PRODUCTION',Inventario:'INVENTORY',Facturación:'DTE','Cuentas por cobrar':'CASH',Proveedores:'SUPPLIERS',Compras:'PURCHASES',Caja:'CASH','Asistente IA':'AI',Agenda:'PRODUCTION',Reportes:'REPORTS',Seguridad:'SECURITY'}
const deniedCache=new Map()

export default function AccessControlRuntime(){
 const [access,setAccess]=useState({role:'',session:null,companyId:'',entitlements:null})
 const {role,session,companyId,entitlements}=access

 useEffect(()=>{
  let live=true
  if(!supabase)return
  const applySession=async next=>{
   if(!next){if(live)setAccess({role:'',session:null,companyId:'',entitlements:null});return}
   const {data:companies,error:companyError}=await supabase.rpc('get_my_companies')
   if(companyError||!companies?.[0]?.id){if(live)setAccess({role:'',session:next,companyId:'',entitlements:null});return}
   const activeCompanyId=String(companies[0].id)
   const {data,error}=await supabase.from('company_members').select('role').eq('company_id',activeCompanyId).eq('user_id',next.user.id).maybeSingle()
   let planAccess=null
   if(API&&!error){try{const response=await fetch(`${API}/api/saas/access?company_id=${encodeURIComponent(activeCompanyId)}`,{headers:{Authorization:`Bearer ${next.access_token}`}});if(response.ok)planAccess=await response.json()}catch{}}
   if(live&&!error){setAccess({role:String(data?.role||'').toLowerCase(),session:next,companyId:activeCompanyId,entitlements:planAccess});if(planAccess){window.dispatchEvent(new CustomEvent('idealo-saas-entitlements',{detail:planAccess}))}}
  }
  supabase.auth.getSession().then(({data})=>void applySession(data.session))
  const {data:l}=supabase.auth.onAuthStateChange((_event,next)=>{void applySession(next)})
  return()=>{live=false;l.subscription.unsubscribe()}
 },[])

 useEffect(()=>{
  if(!role)return
  const allowedByPlan=module=>{
   if(!entitlements)return true
   if(!entitlements.access)return false
   if(module==='App móviles')return entitlements.plan?.mobile_apps_enabled===true
   const code=MODULE_CODE[module]
   return !code||entitlements.modules?.includes(code)
  }
  const reasonFor=module=>{
   if(entitlements&&!entitlements.access)return entitlements.reason||'La membresía no permite ingresar al ERP.'
   if(entitlements&&!allowedByPlan(module))return `El módulo ${module} no está incluido en el plan ${entitlements.plan?.name||''}.`
   return `Acceso restringido: ${ROLE_LABEL[role]||role} no tiene permiso para ${module}.`
  }
  const guardModule=module=>{
   if(!module)return true
   if(canAccessModule(role,module)&&allowedByPlan(module))return true
   const message=reasonFor(module)
   notify(message)
   void logDenied({session,companyId,module,reason:message,action:entitlements&&!allowedByPlan(module)?'PLAN_ACCESS_DENIED':'ACCESS_DENIED'})
   return false
  }
  const denyEvent=(event,module)=>{
   if(guardModule(module))return
   event.stopImmediatePropagation()
   event.preventDefault?.()
  }
  const guardRequest=event=>denyEvent(event,event.detail?.module||null)
  const guardOpen=event=>denyEvent(event,moduleFromOpenDetail(event.detail||{}))
  const guardChange=event=>denyEvent(event,typeof event.detail==='string'?event.detail:null)

  window.addEventListener('idealo-navigation-request',guardRequest,true)
  window.addEventListener('idealo-open-module',guardOpen,true)
  window.addEventListener('idealo-module-change',guardChange,true)
  return()=>{
   window.removeEventListener('idealo-navigation-request',guardRequest,true)
   window.removeEventListener('idealo-open-module',guardOpen,true)
   window.removeEventListener('idealo-module-change',guardChange,true)
  }
 },[role,session?.access_token,companyId,entitlements])

 useEffect(()=>{
  if(!role)return
  document.documentElement.dataset.erpRole=role
  if(entitlements?.plan?.code)document.documentElement.dataset.saasPlan=entitlements.plan.code
  if(entitlements&&!entitlements.access)document.documentElement.dataset.saasBlocked='true';else delete document.documentElement.dataset.saasBlocked
  if(window.location.pathname.startsWith('/mobile')&&entitlements?.plan&&entitlements.plan.mobile_apps_enabled!==true){notify(`La aplicación móvil no está incluida en el plan ${entitlements.plan.name}.`)}
  if(!isReadOnlyRole(role))return()=>{delete document.documentElement.dataset.erpRole;delete document.documentElement.dataset.saasPlan;delete document.documentElement.dataset.saasBlocked}
  const block=reason=>{notify(reason);void logDenied({session,companyId,module:'ERP',reason,action:'READ_ONLY_BLOCKED'})}
  const onSubmit=event=>{if(!insideErp(event.target))return;event.preventDefault();event.stopImmediatePropagation();block('Modo Solo lectura: no podés guardar ni modificar información.')}
  const onClick=event=>{const button=event.target.closest?.('button,[role="button"]');if(!button||!insideErp(button)||button.closest('.idealo-main-menu'))return;const text=(button.innerText||button.getAttribute('aria-label')||'').trim().toLowerCase();if(!text||SAFE_WORDS.some(x=>text.includes(x)))return;if(MUTATION_WORDS.some(x=>text.includes(x))){event.preventDefault();event.stopImmediatePropagation();block(`Modo Solo lectura: la acción "${text.slice(0,80)}" requiere permiso de edición.`)}}
  document.addEventListener('submit',onSubmit,true)
  document.addEventListener('click',onClick,true)
  return()=>{delete document.documentElement.dataset.erpRole;delete document.documentElement.dataset.saasPlan;delete document.documentElement.dataset.saasBlocked;document.removeEventListener('submit',onSubmit,true);document.removeEventListener('click',onClick,true)}
 },[role,session?.access_token,companyId,entitlements])
 return null
}

function insideErp(node){return Boolean(node?.closest?.('.erp-shell,.erp-modal-panel,.clients-module,.invoice-form,.admin-users-panel'))}
async function logDenied({session,companyId,module,reason,action}){if(!API||!session?.access_token||!companyId)return;const key=`${action}:${module}:${reason}`;const now=Date.now();if(now-(deniedCache.get(key)||0)<10000)return;deniedCache.set(key,now);try{await fetch(`${API}/api/security/audit`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({company_id:companyId,action,module,reason,control:'frontend_role_and_plan_guard'})})}catch{}}
function notify(message){window.dispatchEvent(new CustomEvent('idealo-access-denied',{detail:{message}}));let box=document.getElementById('idealo-access-toast');if(!box){box=document.createElement('div');box.id='idealo-access-toast';box.setAttribute('role','status');document.body.appendChild(box)}box.textContent=message;box.classList.add('show');window.clearTimeout(box._t);box._t=window.setTimeout(()=>box.classList.remove('show'),4200)}
