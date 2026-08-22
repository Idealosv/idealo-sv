import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import FacturacionLauncher from './FacturacionLauncher.jsx'
import './styles.css'
import './facturacion-feedback.css'

const nativeScrollIntoView = Element.prototype.scrollIntoView
Element.prototype.scrollIntoView = function scrollIntoViewWithoutInvoiceJump(options) {
  if (this.classList?.contains('invoice-form')) return
  return nativeScrollIntoView.call(this, options)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <FacturacionLauncher />
  </StrictMode>,
)
