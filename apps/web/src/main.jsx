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
import ExecutiveDashboardHost from './ExecutiveDashboardHost.jsx'
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

const nativeScrollIntoView = Element.prototype.scrollIntoView
Element.prototype.scrollIntoView = function scrollIntoViewWithoutInvoiceJump(options) {
  if (this.classList?.contains('invoice-form')) return
  return nativeScrollIntoView.call(this, options)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <CommercialLauncher />
    <OperationsFinanceLauncher />
    <InventoryCostLauncher />
    <FinancialDashboardLauncher />
    <HrPayrollLauncher />
    <ProductionCalendarLauncher />
    <QualityControlLauncher />
    <FacturacionLauncher />
    <MainMenuController />
    <ExecutiveDashboardHost />
  </StrictMode>,
)
