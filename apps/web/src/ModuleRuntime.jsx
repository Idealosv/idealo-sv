import { useEffect, useState } from 'react'
import RuntimeBoundary from './RuntimeBoundary.jsx'
import MobileFieldTools from './MobileFieldTools.jsx'
import MobileSalesFieldBlock from './MobileSalesFieldBlock.jsx'
import MobileClient360 from './MobileClient360.jsx'
import Client360Enhancer from './Client360Enhancer.jsx'
import CommercialAutomationCenter from './CommercialAutomationCenter.jsx'
import ClientCrmPipeline from './ClientCrmPipeline.jsx'
import ClientModuleOrganizer from './ClientModuleOrganizer.jsx'
import Client360TimelineHost from './Client360TimelineHost.jsx'
import ClientVatCardScannerHost from './ClientVatCardScannerHost.jsx'

const Safe = ({ label, children }) => <RuntimeBoundary label={label}>{children}</RuntimeBoundary>

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
