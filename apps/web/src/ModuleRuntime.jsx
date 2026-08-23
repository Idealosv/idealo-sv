import { lazy, Suspense, useEffect, useState } from 'react'

const CommercialLauncher = lazy(() => import('./CommercialLauncher.jsx'))
const OperationsFinanceLauncher = lazy(() => import('./OperationsFinanceLauncher.jsx'))
const InventoryCostLauncher = lazy(() => import('./InventoryCostLauncher.jsx'))
const FinancialDashboardLauncher = lazy(() => import('./FinancialDashboardLauncher.jsx'))
const ProductionCalendarLauncher = lazy(() => import('./ProductionCalendarLauncher.jsx'))
const FacturacionLauncher = lazy(() => import('./FacturacionLauncher.jsx'))
const ExecutiveDashboardHost = lazy(() => import('./ExecutiveDashboardHost.jsx'))
const MobileAppHost = lazy(() => import('./MobileAppHost.jsx'))
const MobileFieldTools = lazy(() => import('./MobileFieldTools.jsx'))
const MobileSalesFieldBlock = lazy(() => import('./MobileSalesFieldBlock.jsx'))
const MobileClient360 = lazy(() => import('./MobileClient360.jsx'))
const Client360Enhancer = lazy(() => import('./Client360Enhancer.jsx'))
const CommercialAutomationCenter = lazy(() => import('./CommercialAutomationCenter.jsx'))
const ClientCrmPipeline = lazy(() => import('./ClientCrmPipeline.jsx'))
const ClientModuleOrganizer = lazy(() => import('./ClientModuleOrganizer.jsx'))
const Client360TimelineHost = lazy(() => import('./Client360TimelineHost.jsx'))
const ClientVatCardScannerHost = lazy(() => import('./ClientVatCardScannerHost.jsx'))
const HrPayrollLauncher = lazy(() => import('./HrPayrollLauncher.jsx'))
const QualityControlLauncher = lazy(() => import('./QualityControlLauncher.jsx'))

const moduleGroup = (name = '') => {
  if (['Productos', 'Cotizaciones', 'Producción'].includes(name)) return 'commercial'
  if (['Proveedores', 'Compras', 'Caja'].includes(name)) return 'procurement'
  if (name === 'Inventario') return 'inventory'
  if (name === 'Facturación') return 'billing'
  if (name === 'Reportes') return 'financial'
  if (name === 'Agenda') return 'planning'
  if (name === 'App móviles') return 'mobile'
  if (name === 'Clientes') return 'clients'
  if (name === 'Dashboard') return 'dashboard'
  if (name === 'Recursos humanos') return 'hr'
  if (name === 'Calidad') return 'quality'
  return ''
}

export default function ModuleRuntime() {
  const [loaded, setLoaded] = useState(() => new Set())

  useEffect(() => {
    const load = (name) => {
      const group = moduleGroup(name)
      if (!group) return
      setLoaded((current) => {
        if (current.has(group)) return current
        const next = new Set(current)
        next.add(group)
        return next
      })
    }

    const onModuleChange = (event) => load(event.detail)
    const onClientContext = (event) => {
      const target = event.detail?.target
      if (target === 'billing') load('Facturación')
      else if (target === 'commercial') load('Cotizaciones')
      else if (target === 'clients') load('Clientes')
    }

    window.addEventListener('idealo-module-change', onModuleChange)
    window.addEventListener('idealo-open-client-context', onClientContext)
    return () => {
      window.removeEventListener('idealo-module-change', onModuleChange)
      window.removeEventListener('idealo-open-client-context', onClientContext)
    }
  }, [])

  return <Suspense fallback={null}>
    {loaded.has('commercial') && <CommercialLauncher/>}
    {loaded.has('procurement') && <OperationsFinanceLauncher/>}
    {loaded.has('inventory') && <InventoryCostLauncher/>}
    {loaded.has('financial') && <FinancialDashboardLauncher/>}
    {loaded.has('planning') && <ProductionCalendarLauncher/>}
    {loaded.has('billing') && <FacturacionLauncher/>}
    {loaded.has('dashboard') && <ExecutiveDashboardHost/>}
    {loaded.has('mobile') && <><MobileAppHost/><MobileFieldTools/><MobileSalesFieldBlock/><MobileClient360/></>}
    {loaded.has('clients') && <><Client360Enhancer/><CommercialAutomationCenter/><ClientCrmPipeline/><ClientModuleOrganizer/><Client360TimelineHost/><ClientVatCardScannerHost/></>}
    {loaded.has('hr') && <HrPayrollLauncher/>}
    {loaded.has('quality') && <QualityControlLauncher/>}
  </Suspense>
}
