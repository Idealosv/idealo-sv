import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MainMenuController from './MainMenuController.jsx'
import ModuleRuntime from './ModuleRuntime.jsx'
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
import './corporate-premium-global.css'
import './corporate-gray-dark.css'
import './orange-button-clean.css'
import './solid-button-clean.css'
import './client-vat-card-scanner.css'
import './less-orange-global.css'
import './enterprise-theme-final.css'
import './enterprise-ui-v2.css'
import './enterprise-ui-v3-hotfix.css'
import './products-360.css'
import './quotes-360.css'
import './inventory-360.css'
import './erp-corporate-master.css'
import './billing-simplification.css'
import './billing-classic-layout.css'

const nativeScrollIntoView = Element.prototype.scrollIntoView
Element.prototype.scrollIntoView = function(options) {
  if (this.classList?.contains('invoice-form')) return
  return nativeScrollIntoView.call(this, options)
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => null))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App/>
    <MainMenuController/>
    <ModuleRuntime/>
  </StrictMode>,
)
