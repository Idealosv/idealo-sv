import { lazy, Suspense, useEffect, useState } from 'react'
import RuntimeBoundary from './RuntimeBoundary.jsx'
import { getNavigationState, subscribeNavigation } from './erp-navigation.js'

const ExecutiveDashboardHost = lazy(() => import('./ExecutiveDashboardHost.jsx'))
const CommercialLauncher = lazy(() => import('./CommercialLauncher.jsx'))
const OperationsFinanceLauncher = lazy(() => import('./OperationsFinanceLauncher.jsx'))
const InventoryCostLauncher = lazy(() => import('./InventoryCostLauncher.jsx'))
const FinancialDashboardLauncher = lazy(() => import('./FinancialDashboardLauncher.jsx'))
const ProductionCalendarLauncher = lazy(() => import('./ProductionCalendarLauncher.jsx'))
const QualityControlLauncher = lazy(() => import('./QualityControlLauncher.jsx'))
const FacturacionLauncher = lazy(() => import('./FacturacionLauncher.jsx'))
const BillingUiRecovery = lazy(() => import('./BillingUiRecovery.jsx'))
const AssistantLauncher = lazy(() => import('./AssistantLauncher.jsx'))
const SecurityLauncher = lazy(() => import('./SecurityLauncher.jsx'))
const WorkspaceNavigationBridge = lazy(() => import('./WorkspaceNavigationBridge.jsx'))
const ErpUxCoordinator = lazy(() => import('./ErpUxCoordinator.jsx'))
const FormAccordionManager = lazy(() => import('./FormAccordionManager.jsx'))
const FormSimplificationManager = lazy(() => import('./FormSimplificationManager.jsx'))
const MobileRuntimeGuard = lazy(() => import('./MobileRuntimeGuard.jsx'))
const MobileAppHost = lazy(() => import('./MobileAppHost.jsx'))
const MobileDteHost = lazy(() => import('./MobileDteHost.jsx'))
const MobileCollectionsHost = lazy(() => import('./MobileCollectionsHost.jsx'))
const MobileDteEnvironmentGuard = lazy(() => import('./MobileDteEnvironmentGuard.jsx'))
const MobileHealthGuard = lazy(() => import('./MobileHealthGuard.jsx'))
const MobileNotificationBridge = lazy(() => import('./MobileNotificationBridge.jsx'))
const MobileUpdateNotice = lazy(() => import('./MobileUpdateNotice.jsx'))
const ClientIntegrityCenter = lazy(() => import('./ClientIntegrityCenter.jsx'))
const ClientAdditionalActivitiesHost = lazy(() => import('./ClientAdditionalActivitiesHost.jsx'))
const SaasMasterPanelHost = lazy(() => import('./SaasMasterPanelHost.jsx'))
const SaasBillingCenterHost = lazy(() => import('./SaasBillingCenterHost.jsx'))
const SaasCommercialControlHost = lazy(() => import('./SaasCommercialControlHost.jsx'))
const SaasCustomerAccountHost = lazy(() => import('./SaasCustomerAccountHost.jsx'))
const AgencyDemoGuard = lazy(() => import('./AgencyDemoGuard.jsx'))
const PurchaseTaxAssistant = lazy(() => import('./PurchaseTaxAssistant.jsx'))
const ModuleRuntime = lazy(() => import('./ModuleRuntime.jsx'))
const EggWholesaleAppHost = lazy(() => import('./EggWholesaleAppHost.jsx'))
const PrestaditosInvestorAppHost = lazy(() => import('./PrestaditosInvestorAppHost.jsx'))

const Safe = ({ label, children }) => (
  <RuntimeBoundary label={label}>
    <Suspense fallback={null}>{children}</Suspense>
  </RuntimeBoundary>
)

const currentModuleName = (navigation) =>
  navigation?.status === 'requested'
    ? navigation.requestedModule || navigation.activeModule || 'Dashboard'
    : navigation?.activeModule || navigation?.requestedModule || 'Dashboard'

export default function DeferredRuntimeHosts() {
  const [companyReady, setCompanyReady] = useState(() => Boolean(typeof window !== 'undefined' && window.__IDEALO_ACTIVE_COMPANY__?.id))
  const [navigation, setNavigation] = useState(() => getNavigationState())

  useEffect(() => {
    const sync = (event) => {
      const company = event?.detail || window.__IDEALO_ACTIVE_COMPANY__
      if (company?.id) setCompanyReady(true)
    }
    window.addEventListener('idealo-company-resolved', sync)
    sync()
    const timer = window.setInterval(() => {
      if (window.__IDEALO_ACTIVE_COMPANY__?.id) {
        setCompanyReady(true)
        window.clearInterval(timer)
      }
    }, 150)
    return () => {
      window.removeEventListener('idealo-company-resolved', sync)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => subscribeNavigation(setNavigation), [])

  if (!companyReady) return null

  const moduleName = currentModuleName(navigation)
  const target = navigation?.target || 'workspace'
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isMobile = target === 'mobile' || moduleName === 'App móviles'
  const isClients = moduleName === 'Clientes'
  const isCommercial = target === 'commercial' || ['Productos', 'Cotizaciones', 'Producción'].includes(moduleName)
  const isProcurement = target === 'procurement' || ['Proveedores', 'Compras', 'Caja'].includes(moduleName)
  const isBilling = target === 'billing' || ['Facturación', 'Cuentas por cobrar'].includes(moduleName)
  const isMasterRoute = pathname === '/master' || pathname.startsWith('/master/')
  const isAccountRoute = pathname === '/cuenta' || pathname === '/mi-cuenta'
  const isEggWholesaleRoute = pathname === '/eggs' || pathname.startsWith('/eggs/')
  const isInvestorRoute = pathname === '/investors' || pathname.startsWith('/investors/')

  return <>
    <Safe label="Compatibilidad Workspace"><WorkspaceNavigationBridge /></Safe>
    <Safe label="Coordinación UX"><ErpUxCoordinator /></Safe>
    <Safe label="Formularios"><FormAccordionManager /></Safe>
    <Safe label="Simplificación de formularios"><FormSimplificationManager /></Safe>
    <Safe label="Entorno demo"><AgencyDemoGuard /></Safe>
    <Safe label="Runtime por módulo"><ModuleRuntime /></Safe>

    {moduleName === 'Dashboard' && <Safe label="Dashboard ejecutivo"><ExecutiveDashboardHost /></Safe>}

    {isCommercial && <Safe label="Comercial"><CommercialLauncher /></Safe>}
    {moduleName === 'Producción' && <Safe label="Control de calidad"><QualityControlLauncher /></Safe>}

    {target === 'inventory' && <Safe label="Inventario"><InventoryCostLauncher /></Safe>}
    {target === 'financial' && <Safe label="Reportes financieros"><FinancialDashboardLauncher /></Safe>}
    {target === 'planning' && <Safe label="Agenda de producción"><ProductionCalendarLauncher /></Safe>}

    {isProcurement && <Safe label="Compras y finanzas"><OperationsFinanceLauncher /></Safe>}
    {moduleName === 'Compras' && <Safe label="Asistente IVA compras"><PurchaseTaxAssistant /></Safe>}

    {isBilling && <>
      <Safe label="Facturación"><FacturacionLauncher /></Safe>
      <Safe label="Recuperación UI Facturación"><BillingUiRecovery /></Safe>
    </>}

    {target === 'assistant' && <Safe label="Asistente IA"><AssistantLauncher /></Safe>}
    {target === 'security' && <Safe label="Seguridad"><SecurityLauncher /></Safe>}

    {isClients && <>
      <Safe label="Integridad clientes"><ClientIntegrityCenter /></Safe>
      <Safe label="Giros adicionales clientes"><ClientAdditionalActivitiesHost /></Safe>
    </>}

    {isMobile && <>
      <Safe label="Runtime móvil"><MobileRuntimeGuard /></Safe>
      <Safe label="App móvil"><MobileAppHost /></Safe>
      <Safe label="DTE móvil"><MobileDteHost /></Safe>
      <Safe label="Cobros móviles"><MobileCollectionsHost /></Safe>
      <Safe label="Ambiente DTE móvil"><MobileDteEnvironmentGuard /></Safe>
      <Safe label="Salud móvil"><MobileHealthGuard /></Safe>
      <Safe label="Notificaciones móviles"><MobileNotificationBridge /></Safe>
      <Safe label="Actualizaciones móviles"><MobileUpdateNotice /></Safe>
    </>}

    {isMasterRoute && <>
      <Safe label="Panel Maestro SaaS"><SaasMasterPanelHost /></Safe>
      <Safe label="Centro de cobros SaaS"><SaasBillingCenterHost /></Safe>
      <Safe label="Control comercial SaaS"><SaasCommercialControlHost /></Safe>
    </>}
    {isAccountRoute && <Safe label="Cuenta SaaS"><SaasCustomerAccountHost /></Safe>}
    {isEggWholesaleRoute && <Safe label="IDEALO Eggs"><EggWholesaleAppHost /></Safe>}
    {isInvestorRoute && <Safe label="Prestadito$ Inversionistas"><PrestaditosInvestorAppHost /></Safe>}
  </>
}
