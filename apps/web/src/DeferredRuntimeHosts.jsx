import { useEffect, useState } from 'react'
import RuntimeBoundary from './RuntimeBoundary.jsx'
import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'
import CommercialLauncher from './CommercialLauncher.jsx'
import OperationsFinanceLauncher from './OperationsFinanceLauncher.jsx'
import InventoryCostLauncher from './InventoryCostLauncher.jsx'
import FinancialDashboardLauncher from './FinancialDashboardLauncher.jsx'
import HrPayrollLauncher from './HrPayrollLauncher.jsx'
import ProductionCalendarLauncher from './ProductionCalendarLauncher.jsx'
import QualityControlLauncher from './QualityControlLauncher.jsx'
import FacturacionLauncher from './FacturacionLauncher.jsx'
import BillingUiRecovery from './BillingUiRecovery.jsx'
import AssistantLauncher from './AssistantLauncher.jsx'
import SecurityLauncher from './SecurityLauncher.jsx'
import WorkspaceNavigationBridge from './WorkspaceNavigationBridge.jsx'
import ErpUxCoordinator from './ErpUxCoordinator.jsx'
import FormAccordionManager from './FormAccordionManager.jsx'
import FormSimplificationManager from './FormSimplificationManager.jsx'
import MobileRuntimeGuard from './MobileRuntimeGuard.jsx'
import MobileAppHost from './MobileAppHost.jsx'
import MobileDteHost from './MobileDteHost.jsx'
import MobileCollectionsHost from './MobileCollectionsHost.jsx'
import MobileDteEnvironmentGuard from './MobileDteEnvironmentGuard.jsx'
import MobileHealthGuard from './MobileHealthGuard.jsx'
import MobileNotificationBridge from './MobileNotificationBridge.jsx'
import MobileUpdateNotice from './MobileUpdateNotice.jsx'
import ClientIntegrityCenter from './ClientIntegrityCenter.jsx'
import ClientAdditionalActivitiesHost from './ClientAdditionalActivitiesHost.jsx'
import SaasMasterPanelHost from './SaasMasterPanelHost.jsx'
import SaasBillingCenterHost from './SaasBillingCenterHost.jsx'
import SaasCommercialControlHost from './SaasCommercialControlHost.jsx'
import SaasCustomerAccountHost from './SaasCustomerAccountHost.jsx'
import AgencyDemoGuard from './AgencyDemoGuard.jsx'
import PurchaseTaxAssistant from './PurchaseTaxAssistant.jsx'
import ModuleRuntime from './ModuleRuntime.jsx'

const Safe=({label,children})=><RuntimeBoundary label={label}>{children}</RuntimeBoundary>

export default function DeferredRuntimeHosts(){
 const [companyReady,setCompanyReady]=useState(()=>Boolean(typeof window!=='undefined'&&window.__IDEALO_ACTIVE_COMPANY__?.id))

 useEffect(()=>{
  const sync=event=>{
   const company=event?.detail||window.__IDEALO_ACTIVE_COMPANY__
   if(company?.id)setCompanyReady(true)
  }
  window.addEventListener('idealo-company-resolved',sync)
  sync()
  const timer=window.setInterval(()=>{
   if(window.__IDEALO_ACTIVE_COMPANY__?.id){setCompanyReady(true);window.clearInterval(timer)}
  },150)
  return()=>{window.removeEventListener('idealo-company-resolved',sync);window.clearInterval(timer)}
 },[])

 // Los launchers operativos no deben inicializarse antes de que el ERP principal
 // confirme qué empresa está activa. Así todos comparten exactamente la misma
 // empresa y ningún clic del menú se pierde por una resolución paralela tardía.
 if(!companyReady)return null

 return <>
  <Safe label="Dashboard ejecutivo"><ExecutiveDashboardHost/></Safe>
  <Safe label="Comercial"><CommercialLauncher/></Safe>
  <Safe label="Compras y finanzas"><OperationsFinanceLauncher/></Safe>
  <Safe label="Inventario"><InventoryCostLauncher/></Safe>
  <Safe label="Reportes financieros"><FinancialDashboardLauncher/></Safe>
  <Safe label="RRHH"><HrPayrollLauncher/></Safe>
  <Safe label="Agenda de producción"><ProductionCalendarLauncher/></Safe>
  <Safe label="Control de calidad"><QualityControlLauncher/></Safe>
  <Safe label="Facturación"><FacturacionLauncher/></Safe>
  <Safe label="Recuperación UI Facturación"><BillingUiRecovery/></Safe>
  <Safe label="Asistente IA"><AssistantLauncher/></Safe>
  <Safe label="Seguridad"><SecurityLauncher/></Safe>
  <Safe label="Compatibilidad Workspace"><WorkspaceNavigationBridge/></Safe>
  <Safe label="Coordinación UX"><ErpUxCoordinator/></Safe>
  <Safe label="Formularios"><FormAccordionManager/></Safe>
  <Safe label="Simplificación de formularios"><FormSimplificationManager/></Safe>
  <Safe label="Runtime móvil"><MobileRuntimeGuard/></Safe>
  <Safe label="App móvil"><MobileAppHost/></Safe>
  <Safe label="DTE móvil"><MobileDteHost/></Safe>
  <Safe label="Cobros móviles"><MobileCollectionsHost/></Safe>
  <Safe label="Ambiente DTE móvil"><MobileDteEnvironmentGuard/></Safe>
  <Safe label="Salud móvil"><MobileHealthGuard/></Safe>
  <Safe label="Notificaciones móviles"><MobileNotificationBridge/></Safe>
  <Safe label="Actualizaciones móviles"><MobileUpdateNotice/></Safe>
  <Safe label="Integridad clientes"><ClientIntegrityCenter/></Safe>
  <Safe label="Giros adicionales clientes"><ClientAdditionalActivitiesHost/></Safe>
  <Safe label="Panel Maestro SaaS"><SaasMasterPanelHost/></Safe>
  <Safe label="Centro de cobros SaaS"><SaasBillingCenterHost/></Safe>
  <Safe label="Control comercial SaaS"><SaasCommercialControlHost/></Safe>
  <Safe label="Cuenta SaaS"><SaasCustomerAccountHost/></Safe>
  <Safe label="Entorno demo"><AgencyDemoGuard/></Safe>
  <Safe label="Asistente IVA compras"><PurchaseTaxAssistant/></Safe>
  <Safe label="Runtime por módulo"><ModuleRuntime/></Safe>
 </>
}