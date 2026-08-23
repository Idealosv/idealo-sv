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
import AssistantLauncher from './AssistantLauncher.jsx'
import SecurityLauncher from './SecurityLauncher.jsx'
import MainMenuController from './MainMenuController.jsx'
import ErpUxCoordinator from './ErpUxCoordinator.jsx'
import FormAccordionManager from './FormAccordionManager.jsx'
import RuntimeBoundary from './RuntimeBoundary.jsx'
import ModuleRuntime from './ModuleRuntime.jsx'
import MobileAppHost from './MobileAppHost.jsx'
import './styles.css'
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
import './client-360-timeline.css'
import './client-button-balance.css'
import './client-vat-card-scanner.css'
import './products-360.css'
import './quotes-360.css'
import './inventory-360.css'
import './billing-simplification.css'
import './billing-classic-layout.css'
import './erp-corporate-master.css'

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
    <Safe label="Asistente IA"><AssistantLauncher /></Safe>
    <Safe label="Seguridad"><SecurityLauncher /></Safe>
    <Safe label="Menú principal"><MainMenuController /></Safe>
    <Safe label="Coordinación UX"><ErpUxCoordinator /></Safe>
    <Safe label="Formularios"><FormAccordionManager /></Safe>
    <Safe label="App móvil"><MobileAppHost /></Safe>
    <Safe label="Runtime por módulo"><ModuleRuntime /></Safe>
  </StrictMode>,
)
