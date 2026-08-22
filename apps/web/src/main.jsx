import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import FacturacionLauncher from './FacturacionLauncher.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <FacturacionLauncher />
  </StrictMode>,
)
