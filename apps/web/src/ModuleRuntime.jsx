import { lazy, Suspense, useEffect, useState } from 'react'
import RuntimeBoundary from './RuntimeBoundary.jsx'

const MobileFieldTools = lazy(() => import('./MobileFieldTools.jsx'))
const MobileSalesFieldBlock = lazy(() => import('./MobileSalesFieldBlock.jsx'))
const MobileClient360 = lazy(() => import('./MobileClient360.jsx'))
const Client360Enhancer = lazy(() => import('./Client360Enhancer.jsx'))
const CommercialAutomationCenter = lazy(() => import('./CommercialAutomationCenter.jsx'))
const ClientCrmPipeline = lazy(() => import('./ClientCrmPipeline.jsx'))
const ClientModuleOrganizer = lazy(() => import('./ClientModuleOrganizer.jsx'))
const Client360TimelineHost = lazy(() => import('./Client360TimelineHost.jsx'))
const ClientVatCardScannerHost = lazy(() => import('./ClientVatCardScannerHost.jsx'))

const Safe = ({ label, children }) => (
  <RuntimeBoundary label={label} notify={false}>
    <Suspense fallback={null}>{children}</Suspense>
  </RuntimeBoundary>
)

export default function ModuleRuntime() {
  const [activeModule, setActiveModule] = useState('Dashboard')

  useEffect(() => {
    const onModuleChange = (event) => setActiveModule(event.detail || 'Dashboard')
    window.addEventListener('idealo-module-change', onModuleChange)
    return () => window.removeEventListener('idealo-module-change', onModuleChange)
  }, [])

  return (
    <>
      {activeModule === 'App móviles' && (
        <>
          <Safe label="Herramientas móviles"><MobileFieldTools /></Safe>
          <Safe label="Ventas móviles"><MobileSalesFieldBlock /></Safe>
          <Safe label="Clientes móvil"><MobileClient360 /></Safe>
        </>
      )}

      {activeModule === 'Clientes' && (
        <>
          <Safe label="Clientes 360"><Client360Enhancer /></Safe>
          <Safe label="Automatización comercial"><CommercialAutomationCenter /></Safe>
          <Safe label="CRM"><ClientCrmPipeline /></Safe>
          <Safe label="Organizador clientes"><ClientModuleOrganizer /></Safe>
          <Safe label="Historial cliente"><Client360TimelineHost /></Safe>
          <Safe label="Escáner fiscal"><ClientVatCardScannerHost /></Safe>
        </>
      )}
    </>
  )
}
