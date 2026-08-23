import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import FacturacionLauncher from './FacturacionLauncher.jsx'
import CommercialLauncher from './CommercialLauncher.jsx'
import OperationsFinanceLauncher from './OperationsFinanceLauncher.jsx'
import InventoryCostLauncher from './InventoryCostLauncher.jsx'
import FinancialDashboardLauncher from './FinancialDashboardLauncher.jsx'
import HrPayrollLauncher from './HrPayrollLauncher.jsx'
import ProductionCalendarLauncher from './ProductionCalendarLauncher.jsx'
import QualityControlLauncher from './QualityControlLauncher.jsx'
import MainMenuController from './MainMenuController.jsx'
import ErpUxCoordinator from './ErpUxCoordinator.jsx'
import FormAccordionManager from './FormAccordionManager.jsx'
import RuntimeBoundary from './RuntimeBoundary.jsx'
import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'
import MobileAppHost from './MobileAppHost.jsx'
import MobileFieldTools from './MobileFieldTools.jsx'
import MobileSalesFieldBlock from './MobileSalesFieldBlock.jsx'
import MobileClient360 from './MobileClient360.jsx'
import Client360Enhancer from './Client360Enhancer.jsx'
import CommercialAutomationCenter from './CommercialAutomationCenter.jsx'
import ClientCrmPipeline from './ClientCrmPipeline.jsx'
import ClientModuleOrganizer from './ClientModuleOrganizer.jsx'
import Client360TimelineHost from './Client360TimelineHost.jsx'
import ClientVatCardScannerHost from './ClientVatCardScannerHost.jsx'
import './styles.css'
import './premium.css'
import './executive.css'
import './idealo-brand.css'
import './idealo-reference.css'
import './facturacion-feedback.css'
import './sidebar-modules.css'
import './accounts-payable.css'
import './financial-dashboard.css'
import './hr-payroll.css'
import './production-calendar.css'
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
import './client-360.css'
import './commercial-automation.css'
import './client-crm-pipeline.css'
import './client-module-organizer.css'
import './global-contrast.css'
import './client-360-timeline.css'
import './client-button-balance.css'
import './client-vat-card-scanner.css'
import './products-360.css'
import './quotes-360.css'
import './inventory-360.css'
import './erp-corporate-master.css'
import './billing-simplification.css'
import './billing-classic-layout.css'
import './erp-clean-system.css'
import './erp-audit-clean.css'
import './executive-minimal.css'

const nativeScrollIntoView = Element.prototype.scrollIntoView
Element.prototype.scrollIntoView = function(options) {
  if (this.classList?.contains('invoice-form')) return
  return nativeScrollIntoView.call(this, options)
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => null))
}

const Safe = ({ label, children, fatal = false }) => <RuntimeBoundary label={label} fatal={fatal}>{children}</RuntimeBoundary>

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Safe label="ERP principal" fatal><App /></Safe>
    <Safe label="Comercial"><CommercialLauncher /></Safe>
    <Safe label="Compras y finanzas"><OperationsFinanceLauncher /></Safe>
    <Safe label="Inventario"><InventoryCostLauncher /></Safe>
    <Safe label="Reportes financieros"><FinancialDashboardLauncher /></Safe>
    <Safe label="RRHH"><HrPayrollLauncher /></Safe>
    <Safe label="Agenda de producción"><ProductionCalendarLauncher /></Safe>
    <Safe label="Control de calidad"><QualityControlLauncher /></Safe>
    <Safe label="Facturación"><FacturacionLauncher /></Safe>
    <Safe label="Menú principal"><MainMenuController /></Safe>
    <Safe label="Coordinación UX"><ErpUxCoordinator /></Safe>
    <Safe label="Formularios"><FormAccordionManager /></Safe>
    <Safe label="Dashboard ejecutivo"><ExecutiveDashboardHost /></Safe>
    <Safe label="App móvil"><MobileAppHost /></Safe>
    <Safe label="Herramientas móviles"><MobileFieldTools /></Safe>
    <Safe label="Ventas móviles"><MobileSalesFieldBlock /></Safe>
    <Safe label="Clientes móvil"><MobileClient360 /></Safe>
    <Safe label="Clientes 360"><Client360Enhancer /></Safe>
    <Safe label="Automatización comercial"><CommercialAutomationCenter /></Safe>
    <Safe label="CRM"><ClientCrmPipeline /></Safe>
    <Safe label="Organizador clientes"><ClientModuleOrganizer /></Safe>
    <Safe label="Historial cliente"><Client360TimelineHost /></Safe>
    <Safe label="Escáner fiscal"><ClientVatCardScannerHost /></Safe>
  </StrictMode>,
)
