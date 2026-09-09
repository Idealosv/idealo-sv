import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AccessControlRuntime from './AccessControlRuntime.jsx'
import MainMenuController from './MainMenuController.jsx'
import MfaSessionGate from './MfaSessionGate.jsx'
import NavigationEventBridge from './NavigationEventBridge.jsx'
import RuntimeBoundary from './RuntimeBoundary.jsx'
import './styles.css'
import './facturacion-feedback.css'
import './sidebar-modules.css'
import './accounts-payable.css'
import './financial-dashboard.css'
import './financial-alerts-dashboard.css'
import './hr-payroll.css'
import './production-calendar.css'
import './production-control-center.css'
import './production-simple.css'
import './quality-control.css'
import './main-menu.css'
import './executive-dashboard-main.css'
import './dashboard-intelligence.css'
import './dashboard-advanced-insights.css'
import './dashboard-owner-daily.css'
import './mobile-app.css'
import './mobile-field-tools.css'
import './mobile-next-block.css'
import './mobile-client-360.css'
import './mobile-dte.css'
import './mobile-collections.css'
import './mobile-dte-environment.css'
import './mobile-health.css'
import './mobile-owner-hub.css'
import './mobile-simple-navigation.css'
import './client-360.css'
import './client-integrity-center.css'
import './commercial-automation.css'
import './client-crm-pipeline.css'
import './client-module-organizer.css'
import './client-360-timeline.css'
import './client-button-balance.css'
import './client-vat-card-scanner.css'
import './client-additional-activities.css'
import './products-360.css'
import './products-360-simple.css'
import './quotes-360.css'
import './quotes-simple.css'
import './quotes-quick.css'
import './inventory-360.css'
import './inventory-control-center.css'
import './procurement-control-center.css'
import './purchases-expenses-clean.css'
import './purchase-tax-assistant.css'
import './cash-control-center.css'
import './billing-simplification.css'
import './billing-classic-layout.css'
import './billing-documents.css'
import './billing-tax-mode.css'
import './billing-reorganization.css'
import './billing-ui-recovery.css'
import './modal-structure.css'
import './erp-corporate-master.css'
import './module-action-hierarchy.css'
import './form-simplification.css'
import './mobile-android-polish.css'
import './mobile-platform-native.css'
import './agency-demo.css'
import './welcome-login-force.css'
import './privacy-admin-header.css'
import './persistent-sidebar.css'
import './idealo-bar.css'

const DeferredRuntimeHosts=lazy(()=>import('./DeferredRuntimeHosts.jsx'))
const nativeScrollIntoView=Element.prototype.scrollIntoView
Element.prototype.scrollIntoView=function(options){if(this.classList?.contains('invoice-form'))return;return nativeScrollIntoView.call(this,options)}
const mobileRuntimeRequested=()=>{const ua=navigator.userAgent||'';const mobileDevice=/Android|iPhone|iPad|iPod|Mobile/i.test(ua);const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches===true;return window.location.pathname==='/mobile'||window.location.pathname.startsWith('/mobile/')||mobileDevice||standalone}
if('serviceWorker'in navigator&&import.meta.env.PROD){window.addEventListener('load',async()=>{try{if(!mobileRuntimeRequested()){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map((registration)=>registration.unregister()));if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter((key)=>key.startsWith('idealo-mobile-')).map((key)=>caches.delete(key)))}sessionStorage.removeItem('idealo-sw-controller-reload');return}const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});await registration.update().catch(()=>null);navigator.serviceWorker.addEventListener('controllerchange',()=>{const key='idealo-sw-controller-reload';if(sessionStorage.getItem(key)==='1')return;sessionStorage.setItem(key,'1');window.location.reload()})}catch{}})}
const Safe=({label,children,fatal=false})=><RuntimeBoundary label={label} fatal={fatal}>{children}</RuntimeBoundary>

function DeferredRuntimeLoader(){
 const [ready,setReady]=useState(false)
 useEffect(()=>{
  let idleId=null
  let timerId=null
  const start=()=>setReady(true)
  if(typeof window.requestIdleCallback==='function')idleId=window.requestIdleCallback(start,{timeout:350})
  else timerId=window.setTimeout(start,40)
  return()=>{if(idleId!==null&&typeof window.cancelIdleCallback==='function')window.cancelIdleCallback(idleId);if(timerId!==null)window.clearTimeout(timerId)}
 },[])
 if(!ready)return null
 return <Suspense fallback={null}><DeferredRuntimeHosts/></Suspense>
}

createRoot(document.getElementById('root')).render(
 <StrictMode>
  <Safe label="ERP principal" fatal><App/></Safe>
  <Safe label="Verificación 2FA"><MfaSessionGate/></Safe>
  <Safe label="Control de accesos"><AccessControlRuntime/></Safe>
  <Safe label="Navegación persistente"><NavigationEventBridge/></Safe>
  <Safe label="Menú principal"><MainMenuController/></Safe>
  <DeferredRuntimeLoader/>
 </StrictMode>
)
